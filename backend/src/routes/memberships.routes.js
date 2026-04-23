import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { query, withTransaction } from '../config/db.js';
import {
  addDaysToDate,
  inferMembershipStatus,
  validateCreateMembershipPayload,
  validateUpdateMembershipPayload
} from '../utils/memberships.js';
import {
  createHttpError,
  createPaginationMeta,
  parsePaginationParams,
  parsePositiveInteger
} from '../utils/http.js';
import { refreshMembershipStatusesIfNeeded } from '../jobs/membership-status.job.js';

const membershipsRouter = Router();

const baseMembershipSelect = `
  SELECT
    m.id,
    m.membership_number,
    m.client_id,
    c.client_code,
    c.first_name AS client_first_name,
    c.last_name AS client_last_name,
    c.photo_url AS client_photo_url,
    c.phone AS client_phone,
    m.plan_id,
    mp.name AS plan_name,
    mp.duration_days,
    m.sold_by_user_id,
    m.start_date,
    m.end_date,
    m.status,
    m.price,
    m.discount,
    m.amount_paid,
    (m.price - m.discount - m.amount_paid) AS balance_due,
    m.notes,
    m.cancelled_at,
    m.created_at,
    m.updated_at
  FROM memberships m
  INNER JOIN clients c ON c.id = m.client_id
  INNER JOIN membership_plans mp ON mp.id = m.plan_id
`;

function mapPostgresError(error) {
  if (error.code === '23505') {
    throw createHttpError(409, 'A membership with the same unique value already exists');
  }

  if (error.code === '23503') {
    throw createHttpError(400, 'A related client, plan or user was not found');
  }

  throw error;
}

async function ensureClientExists(clientId) {
  const result = await query('SELECT id FROM clients WHERE id = $1', [clientId]);
  if (result.rowCount === 0) {
    throw createHttpError(404, 'Client not found');
  }
}

async function getPlanById(planId) {
  const result = await query(
    'SELECT id, name, duration_days, price, is_active FROM membership_plans WHERE id = $1',
    [planId]
  );

  if (result.rowCount === 0) {
    throw createHttpError(404, 'Membership plan not found');
  }

  return result.rows[0];
}

async function ensureUserExists(userId) {
  if (!userId) {
    return;
  }

  const result = await query('SELECT id FROM users WHERE id = $1', [userId]);
  if (result.rowCount === 0) {
    throw createHttpError(404, 'User not found');
  }
}

async function getMembershipById(membershipId) {
  const result = await query(`${baseMembershipSelect} WHERE m.id = $1`, [membershipId]);
  return result.rows[0] || null;
}

membershipsRouter.get('/', async (request, response, next) => {
  try {
    await refreshMembershipStatusesIfNeeded();

    const { page, limit, offset } = parsePaginationParams(request.query, {
      defaultLimit: 6,
      maxLimit: 100
    });
    const status = String(request.query.status || '').trim();
    const search = String(request.query.search || '').trim();
    const clientId = parsePositiveInteger(request.query.client_id);
    const expiringInDays = Number.parseInt(request.query.expiring_in_days, 10);

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`m.status = $${params.length}`);
    }

    if (clientId) {
      params.push(clientId);
      conditions.push(`m.client_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(m.membership_number ILIKE $${params.length} OR c.client_code ILIKE $${params.length} OR c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length} OR mp.name ILIKE $${params.length} OR m.status ILIKE $${params.length})`
      );
    }

    if (Number.isInteger(expiringInDays) && expiringInDays >= 0) {
      params.push(expiringInDays);
      conditions.push(
        `m.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + ($${params.length} * INTERVAL '1 day'))`
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM memberships m
       INNER JOIN clients c ON c.id = m.client_id
       INNER JOIN membership_plans mp ON mp.id = m.plan_id
       ${whereClause}`,
      params
    );

    const totalItems = countResult.rows[0]?.total || 0;
    const dataParams = [...params, limit, offset];

    const result = await query(
      `${baseMembershipSelect}
       ${whereClause}
       ORDER BY m.end_date ASC, m.id DESC
       LIMIT $${dataParams.length - 1}
       OFFSET $${dataParams.length}`,
      dataParams
    );

    response.json({
      ok: true,
      count: result.rowCount,
      data: result.rows,
      pagination: createPaginationMeta(totalItems, page, limit)
    });
  } catch (error) {
    next(error);
  }
});

membershipsRouter.get('/summary', async (_request, response, next) => {
  try {
    await refreshMembershipStatusesIfNeeded();

    const settingsResult = await query(
      `SELECT setting_value
       FROM system_settings
       WHERE setting_key = 'membership_expiry_alert_days'
       LIMIT 1`
    );
    const parsedAlertDays = Number.parseInt(settingsResult.rows[0]?.setting_value, 10);
    const alertDays = Number.isInteger(parsedAlertDays) && parsedAlertDays >= 0 ? parsedAlertDays : 7;

    const result = await query(
      `SELECT
         COUNT(*)::int AS total_memberships,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active_memberships,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_memberships,
         COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_memberships,
         COUNT(*) FILTER (
           WHERE status IN ('active', 'pending')
             AND end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + ($1::int * INTERVAL '1 day'))
         )::int AS expiring_in_alert_days
       FROM memberships`,
      [alertDays]
    );

    response.json({
      ok: true,
      data: {
        ...result.rows[0],
        membership_expiry_alert_days: alertDays
      }
    });
  } catch (error) {
    next(error);
  }
});

membershipsRouter.get('/:id', async (request, response, next) => {
  try {
    const membershipId = parsePositiveInteger(request.params.id);

    if (!membershipId) {
      throw createHttpError(400, 'Membership id must be a positive integer');
    }

    const membership = await getMembershipById(membershipId);

    if (!membership) {
      throw createHttpError(404, 'Membership not found');
    }

    response.json({
      ok: true,
      data: membership
    });
  } catch (error) {
    next(error);
  }
});

membershipsRouter.post('/', async (request, response, next) => {
  try {
    const payload = validateCreateMembershipPayload(request.body);

    await ensureClientExists(payload.client_id);
    const plan = await getPlanById(payload.plan_id);
    const requestUserId = Number(request.user?.id);
    const soldByUserId =
      payload.sold_by_user_id ||
      (Number.isInteger(requestUserId) && requestUserId > 0 ? requestUserId : null);

    await ensureUserExists(soldByUserId);

    const membershipNumber =
      payload.membership_number ||
      `MEM-${payload.client_id}-${Date.now().toString().slice(-6)}`;

    const price = payload.price ?? Number(plan.price);
    const endDate = payload.end_date ?? addDaysToDate(payload.start_date, plan.duration_days - 1);
    const discount = payload.discount ?? 0;
    const amountPaid = payload.amount_paid ?? 0;

    if (amountPaid > price - discount) {
      throw createHttpError(400, 'amount_paid cannot be greater than the total due');
    }

    const status = payload.status || inferMembershipStatus(payload.start_date, endDate);

    const paymentMethod = payload.payment_method || 'cash';

    const membershipId = await withTransaction(async (dbClient) => {
      const membershipInsertResult = await dbClient.query(
        `INSERT INTO memberships (
           client_id,
           plan_id,
           sold_by_user_id,
           membership_number,
           start_date,
           end_date,
           status,
           price,
           discount,
           amount_paid,
           notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          payload.client_id,
          payload.plan_id,
          soldByUserId,
          membershipNumber,
          payload.start_date,
          endDate,
          status,
          price,
          discount,
          amountPaid,
          payload.notes
        ]
      );

      const createdMembershipId = membershipInsertResult.rows[0].id;

      if (amountPaid > 0) {
        const paymentNumber = `PAY-MEM-${Date.now().toString().slice(-8)}-${Math.floor(
          1000 + Math.random() * 9000
        )}`;

        await dbClient.query(
          `INSERT INTO payments (
             payment_number,
             client_id,
             membership_id,
             received_by_user_id,
             payment_method,
             amount,
             notes
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            paymentNumber,
            payload.client_id,
            createdMembershipId,
            soldByUserId,
            paymentMethod,
            amountPaid,
            payload.notes
          ]
        );
      }

      return createdMembershipId;
    });

    const membership = await getMembershipById(membershipId);

    response.status(201).json({
      ok: true,
      message: 'Membership created successfully',
      data: membership
    });
  } catch (error) {
    try {
      mapPostgresError(error);
    } catch (mappedError) {
      next(mappedError);
      return;
    }

    next(error);
  }
});

membershipsRouter.put('/:id', async (request, response, next) => {
  try {
    const membershipId = parsePositiveInteger(request.params.id);

    if (!membershipId) {
      throw createHttpError(400, 'Membership id must be a positive integer');
    }

    const currentMembership = await query(
      `SELECT id, start_date, end_date FROM memberships WHERE id = $1`,
      [membershipId]
    );

    if (currentMembership.rowCount === 0) {
      throw createHttpError(404, 'Membership not found');
    }

    const updates = validateUpdateMembershipPayload(request.body);

    const finalStartDate = updates.start_date || currentMembership.rows[0].start_date;
    const finalEndDate = updates.end_date || currentMembership.rows[0].end_date;

    if (new Date(finalEndDate) < new Date(finalStartDate)) {
      throw createHttpError(400, 'end_date must be greater than or equal to start_date');
    }

    const financialSnapshot = await query(
      'SELECT price, discount, amount_paid FROM memberships WHERE id = $1',
      [membershipId]
    );

    const finalPrice = Number(updates.price ?? financialSnapshot.rows[0].price);
    const finalDiscount = Number(updates.discount ?? financialSnapshot.rows[0].discount);
    const finalAmountPaid = Number(updates.amount_paid ?? financialSnapshot.rows[0].amount_paid);

    if (finalAmountPaid > finalPrice - finalDiscount) {
      throw createHttpError(400, 'amount_paid cannot be greater than the total due');
    }

    if (!('status' in updates) && ('start_date' in updates || 'end_date' in updates)) {
      updates.status = inferMembershipStatus(finalStartDate, finalEndDate);
    }

    if ('sold_by_user_id' in updates) {
      await ensureUserExists(updates.sold_by_user_id);
    }

    const keys = Object.keys(updates);
    const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);
    const values = keys.map((key) => updates[key]);

    await query(
      `UPDATE memberships
       SET ${setClauses.join(', ')}
       WHERE id = $${keys.length + 1}`,
      [...values, membershipId]
    );

    const membership = await getMembershipById(membershipId);

    response.json({
      ok: true,
      message: 'Membership updated successfully',
      data: membership
    });
  } catch (error) {
    try {
      mapPostgresError(error);
    } catch (mappedError) {
      next(mappedError);
      return;
    }

    next(error);
  }
});

membershipsRouter.get('/:id/receipt/pdf', async (request, response, next) => {
  try {
    const membershipId = parsePositiveInteger(request.params.id);

    if (!membershipId) {
      throw createHttpError(400, 'Membership id must be a positive integer');
    }

    const receiptResult = await query(
      `SELECT
         m.id,
         m.membership_number,
         m.start_date,
         m.end_date,
         m.price,
         m.discount,
         m.amount_paid,
         m.notes,
         m.created_at,
         c.client_code,
         c.first_name AS client_first_name,
         c.last_name AS client_last_name,
         mp.name AS plan_name,
         mp.tax_name,
         mp.tax_rate,
         u.username AS sold_by_username
       FROM memberships m
       INNER JOIN clients c ON c.id = m.client_id
       INNER JOIN membership_plans mp ON mp.id = m.plan_id
       LEFT JOIN users u ON u.id = m.sold_by_user_id
       WHERE m.id = $1
       LIMIT 1`,
      [membershipId]
    );

    if (receiptResult.rowCount === 0) {
      throw createHttpError(404, 'Membership not found');
    }

    const membership = receiptResult.rows[0];
    const total = Number(membership.price || 0) - Number(membership.discount || 0);
    const taxRate = Number(membership.tax_rate || 0);
    const subtotal = taxRate > 0 ? total / (1 + taxRate / 100) : total;
    const taxAmount = Math.max(total - subtotal, 0);

    const settingsResult = await query(
      `SELECT setting_key, setting_value
       FROM system_settings
       WHERE setting_key = ANY($1)
       ORDER BY setting_key ASC`,
      [['company_name']]
    );

    const settings = Object.fromEntries(settingsResult.rows.map((row) => [row.setting_key, row.setting_value]));
    const companyName = String(settings.company_name || '').trim() || 'RohiPOS';

    const doc = new PDFDocument({ margin: 34, size: [226.77, 470] });
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="recibo_membresia_${membership.membership_number || membership.id}.pdf"`
    );
    doc.pipe(response);

    doc.font('Helvetica-Bold').fontSize(13).text(companyName, { align: 'center' });
    doc.font('Helvetica').fontSize(9).text('Recibo de membresia', { align: 'center' });
    doc.moveDown(0.7);

    doc.fontSize(8);
    doc.text(`Membresia: ${membership.membership_number || membership.id}`);
    doc.text(`Fecha: ${new Date(membership.created_at).toLocaleString('es-NI')}`);
    doc.text(`Cliente: ${membership.client_code} - ${membership.client_first_name} ${membership.client_last_name}`);
    doc.text(`Plan: ${membership.plan_name}`);
    doc.text(`Inicio: ${membership.start_date ? new Date(membership.start_date).toLocaleDateString('es-NI') : '--'}`);
    doc.text(`Fin: ${membership.end_date ? new Date(membership.end_date).toLocaleDateString('es-NI') : '--'}`);
    doc.text(`Cajero: ${membership.sold_by_username || '--'}`);
    doc.moveDown(0.5);

    doc.moveTo(34, doc.y).lineTo(192, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.6);

    doc.font('Helvetica').fontSize(8.5);
    doc.text('Subtotal', 34, doc.y, { width: 110, align: 'left', lineBreak: false });
    doc.text(`C$${subtotal.toFixed(2)}`, 136, doc.y, { width: 56, align: 'right' });
    doc.moveDown(0.35);
    doc.text('Impuesto', 34, doc.y, { width: 110, align: 'left', lineBreak: false });
    doc.text(`C$${taxAmount.toFixed(2)}`, 136, doc.y, { width: 56, align: 'right' });
    doc.moveDown(0.35);
    doc.text('Descuento', 34, doc.y, { width: 110, align: 'left', lineBreak: false });
    doc.text(`C$${Number(membership.discount || 0).toFixed(2)}`, 136, doc.y, { width: 56, align: 'right' });
    doc.moveDown(0.35);
    doc.text('Pagado', 34, doc.y, { width: 110, align: 'left', lineBreak: false });
    doc.text(`C$${Number(membership.amount_paid || 0).toFixed(2)}`, 136, doc.y, { width: 56, align: 'right' });

    const balance = Math.max(total - Number(membership.amount_paid || 0), 0);
    doc.moveDown(0.35);
    doc.text('Saldo', 34, doc.y, { width: 110, align: 'left', lineBreak: false });
    doc.text(`C$${balance.toFixed(2)}`, 136, doc.y, { width: 56, align: 'right' });

    if (membership.notes) {
      doc.moveDown(0.6);
      doc.text(`Notas: ${membership.notes}`, 34, doc.y, { width: 158, align: 'left' });
    }

    doc.moveDown(0.8);
    doc.moveTo(34, doc.y).lineTo(192, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('TOTAL', 34, doc.y, { width: 110, align: 'left', lineBreak: false });
    doc.text(`C$${total.toFixed(2)}`, 136, doc.y, { width: 56, align: 'right' });

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8).text('Gracias por su compra', 34, doc.y, {
      width: 158,
      align: 'center'
    });

    doc.end();
  } catch (error) {
    next(error);
  }
});

export { membershipsRouter };
