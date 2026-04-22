import PDFDocument from 'pdfkit';
import { Router } from 'express';
import { query, withTransaction } from '../config/db.js';
import { createHttpError } from '../utils/http.js';

const cashRegisterRouter = Router();

function parseNonNegativeNumber(value, fieldName) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw createHttpError(400, `${fieldName} must be a non-negative number`);
  }

  return parsed;
}

async function getOrCreateOpenCashSession(userId, dbClient = null) {
  const runner = dbClient || { query };

  const openResult = await runner.query(
    `SELECT id, opened_by_user_id, opening_amount, status, opened_at, closed_at
     FROM cash_register_sessions
     WHERE status = 'open'
     ORDER BY opened_at DESC
     LIMIT 1`
  );

  if (openResult.rowCount > 0) {
    return openResult.rows[0];
  }

  const created = await runner.query(
    `INSERT INTO cash_register_sessions (opened_by_user_id, opening_amount, status, notes)
     VALUES ($1, $2, 'open', $3)
     RETURNING id, opened_by_user_id, opening_amount, status, opened_at, closed_at`,
    [userId, 0, 'Sesion abierta automaticamente por POS']
  );

  return created.rows[0];
}

async function buildCashSessionSummary(sessionId, dbClient = null) {
  const runner = dbClient || { query };

  const sessionResult = await runner.query(
    `SELECT
       cs.id,
       cs.opened_by_user_id,
       op.username AS opened_by_username,
       cs.closed_by_user_id,
       cl.username AS closed_by_username,
       cs.opening_amount,
       cs.closing_amount,
       cs.expected_amount,
       cs.difference_amount,
       cs.opened_at,
       cs.closed_at,
       cs.status,
       cs.notes
     FROM cash_register_sessions cs
     LEFT JOIN users op ON op.id = cs.opened_by_user_id
     LEFT JOIN users cl ON cl.id = cs.closed_by_user_id
     WHERE cs.id = $1`,
    [sessionId]
  );

  if (sessionResult.rowCount === 0) {
    throw createHttpError(404, 'Cash session not found');
  }

  const session = sessionResult.rows[0];

  const receiptsIssuedResult = await runner.query(
    `SELECT
       s.id,
       s.sale_number,
       s.total,
       s.sold_at,
       u.username AS cashier_username
     FROM sales s
     LEFT JOIN users u ON u.id = s.cashier_user_id
     WHERE s.cash_register_session_id = $1
       AND s.status = 'completed'
     ORDER BY s.sold_at DESC, s.id DESC
     LIMIT 200`,
    [sessionId]
  );

  const receiptsVoidedResult = await runner.query(
    `SELECT
       s.id,
       s.sale_number,
       s.total,
       s.sold_at,
       s.cancelled_at,
       u.username AS cashier_username
     FROM sales s
     LEFT JOIN users u ON u.id = s.cashier_user_id
     WHERE s.status = 'cancelled'
       AND (
         s.cash_register_session_id = $1
         OR (
           s.cancelled_at IS NOT NULL
           AND s.cancelled_at >= $2
           AND s.cancelled_at <= COALESCE($3, NOW())
         )
       )
     ORDER BY COALESCE(s.cancelled_at, s.sold_at) DESC, s.id DESC
     LIMIT 200`,
    [sessionId, session.opened_at, session.closed_at]
  );

  const posPaymentBreakdownResult = await runner.query(
    `SELECT
       p.payment_method,
       COALESCE(SUM(p.amount), 0)::numeric(12,2) AS total
     FROM payments p
     INNER JOIN sales s ON s.id = p.sale_id
     WHERE s.cash_register_session_id = $1
       AND s.status = 'completed'
     GROUP BY p.payment_method`,
    [sessionId]
  );

  const cashMovementsResult = await runner.query(
    `SELECT
       movement_type,
       COALESCE(SUM(amount), 0)::numeric(12,2) AS total
     FROM cash_movements
     WHERE created_at >= $1
       AND created_at <= COALESCE($2, NOW())
     GROUP BY movement_type`,
    [session.opened_at, session.closed_at]
  );

  const membershipIncomeResult = await runner.query(
    `WITH membership_payments AS (
       SELECT
         p.id,
         p.payment_method,
         COALESCE(p.amount, 0)::numeric(12,2) AS amount
       FROM payments p
       WHERE p.membership_id IS NOT NULL
         AND p.paid_at >= $1
         AND p.paid_at <= COALESCE($2, NOW())
     ),
     memberships_without_payment AS (
       SELECT
         NULL::bigint AS id,
         'cash'::text AS payment_method,
         COALESCE(m.amount_paid, 0)::numeric(12,2) AS amount
       FROM memberships m
       WHERE m.amount_paid > 0
         AND m.created_at >= $1
         AND m.created_at <= COALESCE($2, NOW())
         AND NOT EXISTS (
           SELECT 1
           FROM payments p2
           WHERE p2.membership_id = m.id
         )
     ),
     all_membership_entries AS (
       SELECT * FROM membership_payments
       UNION ALL
       SELECT * FROM memberships_without_payment
     )
     SELECT
       COUNT(*)::int AS total_count,
       COALESCE(SUM(amount), 0)::numeric(12,2) AS total_amount
     FROM all_membership_entries`,
    [session.opened_at, session.closed_at]
  );

  const dailyPassIncomeResult = await runner.query(
    `SELECT
       COUNT(*)::int AS total_count,
       COALESCE(SUM(p.amount), 0)::numeric(12,2) AS total_amount
     FROM payments p
     WHERE p.payment_number LIKE 'DAY-%'
       AND p.sale_id IS NULL
       AND p.membership_id IS NULL
       AND p.paid_at >= $1
       AND p.paid_at <= COALESCE($2, NOW())`,
    [session.opened_at, session.closed_at]
  );

  const allChannelPaymentBreakdownResult = await runner.query(
    `WITH pos_payments AS (
       SELECT
         p.payment_method,
         COALESCE(p.amount, 0)::numeric(12,2) AS amount
       FROM payments p
       INNER JOIN sales s ON s.id = p.sale_id
       WHERE s.cash_register_session_id = $1
         AND s.status = 'completed'
     ),
     membership_payments AS (
       SELECT
         p.payment_method,
         COALESCE(p.amount, 0)::numeric(12,2) AS amount
       FROM payments p
       WHERE p.membership_id IS NOT NULL
         AND p.paid_at >= $2
         AND p.paid_at <= COALESCE($3, NOW())
     ),
     daily_pass_payments AS (
       SELECT
         p.payment_method,
         COALESCE(p.amount, 0)::numeric(12,2) AS amount
       FROM payments p
       WHERE p.payment_number LIKE 'DAY-%'
         AND p.sale_id IS NULL
         AND p.membership_id IS NULL
         AND p.paid_at >= $2
         AND p.paid_at <= COALESCE($3, NOW())
     ),
     all_channel_payments AS (
       SELECT * FROM pos_payments
       UNION ALL
       SELECT * FROM membership_payments
       UNION ALL
       SELECT * FROM daily_pass_payments
     )
     SELECT
       payment_method,
       COALESCE(SUM(amount), 0)::numeric(12,2) AS total
     FROM all_channel_payments
     GROUP BY payment_method`,
    [sessionId, session.opened_at, session.closed_at]
  );

  const receiptsIssued = receiptsIssuedResult.rows;
  const receiptsVoided = receiptsVoidedResult.rows;

  const totalReceiptsIssued = receiptsIssued.length;
  const totalReceiptsVoided = receiptsVoided.length;

  const totalSalesAmount = receiptsIssued.reduce((sum, row) => sum + Number(row.total || 0), 0);

  const paymentByMethod = {
    cash: 0,
    card: 0,
    transfer: 0,
    mobile: 0,
    other: 0
  };

  posPaymentBreakdownResult.rows.forEach((row) => {
    if (row.payment_method in paymentByMethod) {
      paymentByMethod[row.payment_method] = Number(row.total || 0);
    }
  });

  const allChannelsByMethod = {
    cash: 0,
    card: 0,
    transfer: 0,
    mobile: 0,
    other: 0
  };

  allChannelPaymentBreakdownResult.rows.forEach((row) => {
    if (row.payment_method in allChannelsByMethod) {
      allChannelsByMethod[row.payment_method] = Number(row.total || 0);
    }
  });

  let cashIncome = 0;
  let cashExpense = 0;

  cashMovementsResult.rows.forEach((row) => {
    if (row.movement_type === 'income') {
      cashIncome = Number(row.total || 0);
    }

    if (row.movement_type === 'expense') {
      cashExpense = Number(row.total || 0);
    }
  });

  const membershipIncome = Number(membershipIncomeResult.rows[0]?.total_amount || 0);
  const membershipSalesCount = Number(membershipIncomeResult.rows[0]?.total_count || 0);
  const dailyPassIncome = Number(dailyPassIncomeResult.rows[0]?.total_amount || 0);
  const dailyPassSalesCount = Number(dailyPassIncomeResult.rows[0]?.total_count || 0);
  const posSalesAmount = totalSalesAmount;
  const posSalesCount = totalReceiptsIssued;
  const totalSalesAllChannels = posSalesAmount + membershipIncome + dailyPassIncome;
  const expectedClosingAmount =
    Number(session.opening_amount || 0) + allChannelsByMethod.cash + cashIncome - cashExpense;

  return {
    session: {
      ...session,
      opening_amount: Number(session.opening_amount || 0),
      closing_amount: session.closing_amount == null ? null : Number(session.closing_amount),
      expected_amount: session.expected_amount == null ? null : Number(session.expected_amount),
      difference_amount: session.difference_amount == null ? null : Number(session.difference_amount)
    },
    metrics: {
      total_receipts_issued: totalReceiptsIssued,
      total_receipts_voided: totalReceiptsVoided,
      total_sales_amount: totalSalesAmount,
      pos_sales_amount: posSalesAmount,
      pos_sales_count: posSalesCount,
      membership_sales_amount: membershipIncome,
      membership_sales_count: membershipSalesCount,
      daily_pass_sales_amount: dailyPassIncome,
      daily_pass_sales_count: dailyPassSalesCount,
      total_sales_all_channels: totalSalesAllChannels,
      income_by_payment_method: paymentByMethod,
      all_channels_income_by_payment_method: allChannelsByMethod,
      cash_income: cashIncome,
      cash_expense: cashExpense,
      membership_income: membershipIncome,
      daily_pass_income: dailyPassIncome,
      expected_closing_amount: expectedClosingAmount
    },
    receipts_issued: receiptsIssued,
    receipts_voided: receiptsVoided
  };
}

cashRegisterRouter.get('/current/summary', async (request, response, next) => {
  try {
    const userId = Number(request.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw createHttpError(401, 'User session is invalid');
    }

    const session = await getOrCreateOpenCashSession(userId);
    const summary = await buildCashSessionSummary(session.id);

    response.json({ ok: true, data: summary });
  } catch (error) {
    next(error);
  }
});

cashRegisterRouter.get('/current/summary/pdf', async (request, response, next) => {
  try {
    const userId = Number(request.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw createHttpError(401, 'User session is invalid');
    }

    const session = await getOrCreateOpenCashSession(userId);
    const summary = await buildCashSessionSummary(session.id);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'attachment; filename="cierre_caja_previo.pdf"');
    doc.pipe(response);

    doc.fontSize(18).text('Cierre de Caja - Vista Previa', { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(11)
      .text(`Sesion: #${summary.session.id} | Estado: ${summary.session.status}`)
      .text(`Apertura: ${new Date(summary.session.opened_at).toLocaleString('es-NI')}`)
      .text(`Responsable apertura: ${summary.session.opened_by_username || summary.session.opened_by_user_id}`)
      .moveDown();

    doc.font('Helvetica-Bold').text('Resumen').font('Helvetica');
    doc
      .text(`Recibos emitidos: ${summary.metrics.total_receipts_issued}`)
      .text(`Recibos anulados: ${summary.metrics.total_receipts_voided}`)
      .text(`Ventas POS: C$${summary.metrics.pos_sales_amount.toFixed(2)} (${summary.metrics.pos_sales_count})`)
      .text(`Ventas membresia: C$${summary.metrics.membership_sales_amount.toFixed(2)} (${summary.metrics.membership_sales_count})`)
      .text(`Pagos rutina diaria: C$${summary.metrics.daily_pass_sales_amount.toFixed(2)} (${summary.metrics.daily_pass_sales_count})`)
      .text(`Total ventas (canales): C$${summary.metrics.total_sales_all_channels.toFixed(2)}`)
      .text(`Efectivo total cobrado: C$${Number(summary.metrics.all_channels_income_by_payment_method?.cash || 0).toFixed(2)}`)
      .text(`Ingresos de caja: C$${summary.metrics.cash_income.toFixed(2)}`)
      .text(`Egresos de caja: C$${summary.metrics.cash_expense.toFixed(2)}`)
      .text(`Esperado al cierre: C$${summary.metrics.expected_closing_amount.toFixed(2)}`)
      .moveDown();

    const issuedPreview = summary.receipts_issued.slice(0, 20);
    const voidedPreview = summary.receipts_voided.slice(0, 20);

    doc.font('Helvetica-Bold').text('Recibos emitidos (preview)').font('Helvetica');
    if (!issuedPreview.length) {
      doc.text('Sin recibos emitidos en la sesion.');
    } else {
      issuedPreview.forEach((receipt) => {
        doc.text(
          `${receipt.sale_number} | ${new Date(receipt.sold_at).toLocaleString('es-NI')} | C$${Number(receipt.total).toFixed(2)}`
        );
      });
    }
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Recibos anulados (preview)').font('Helvetica');
    if (!voidedPreview.length) {
      doc.text('Sin recibos anulados en la sesion.');
    } else {
      voidedPreview.forEach((receipt) => {
        doc.text(
          `${receipt.sale_number} | ${new Date(receipt.sold_at).toLocaleString('es-NI')} | C$${Number(receipt.total).toFixed(2)}`
        );
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i += 1) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 55;
      doc.fontSize(8).text(`Pagina ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Rohi-POS | Usuario: ${request.user?.username || request.user?.email || 'sistema'}`, 40, bottom + 12, {
        align: 'left'
      });
    }

    doc.end();
  } catch (error) {
    next(error);
  }
});

cashRegisterRouter.post('/current/close', async (request, response, next) => {
  try {
    const userId = Number(request.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw createHttpError(401, 'User session is invalid');
    }

    const closingAmount = parseNonNegativeNumber(request.body.closing_amount, 'closing_amount');
    const note = String(request.body.notes || '').trim();

    const result = await withTransaction(async (dbClient) => {
      const session = await getOrCreateOpenCashSession(userId, dbClient);

      const lockResult = await dbClient.query(
        `SELECT id, opening_amount, notes
         FROM cash_register_sessions
         WHERE id = $1
           AND status = 'open'
         FOR UPDATE`,
        [session.id]
      );

      if (lockResult.rowCount === 0) {
        throw createHttpError(409, 'No open cash session available for closing');
      }

      const summary = await buildCashSessionSummary(session.id, dbClient);
      const expectedAmount = Number(summary.metrics.expected_closing_amount || 0);
      const differenceAmount = closingAmount - expectedAmount;

      const closureSnapshot = {
        closed_by_user_id: userId,
        closed_at: new Date().toISOString(),
        note,
        metrics: summary.metrics,
        totals: {
          expected_amount: expectedAmount,
          closing_amount: closingAmount,
          difference_amount: differenceAmount
        }
      };

      const previousNotes = String(lockResult.rows[0].notes || '').trim();
      const mergedNotes = [
        previousNotes,
        note ? `Nota cierre: ${note}` : '',
        `Cierre JSON: ${JSON.stringify(closureSnapshot)}`
      ]
        .filter(Boolean)
        .join('\n');

      await dbClient.query(
        `UPDATE cash_register_sessions
         SET
           closed_by_user_id = $1,
           closing_amount = $2,
           expected_amount = $3,
           difference_amount = $4,
           closed_at = NOW(),
           status = 'closed',
           notes = $5
         WHERE id = $6`,
        [userId, closingAmount, expectedAmount, differenceAmount, mergedNotes, session.id]
      );

      return {
        session_id: session.id,
        expected_amount: expectedAmount,
        closing_amount: closingAmount,
        difference_amount: differenceAmount,
        metrics: summary.metrics
      };
    });

    response.json({
      ok: true,
      message: 'Cash register closed successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

export { cashRegisterRouter, getOrCreateOpenCashSession };
