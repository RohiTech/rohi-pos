import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { query, withTransaction } from '../config/db.js';
import { getOrCreateOpenCashSession } from './cash-register.routes.js';
import {
  createHttpError,
  createPaginationMeta,
  parsePaginationParams,
  parsePositiveInteger
} from '../utils/http.js';
import { validateCreateSalePayload, validateUpdateSaleReceiptPayload } from '../utils/pos.js';

const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'card', 'transfer', 'mobile', 'other']);

function parseDateFilter(value, fieldName) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw createHttpError(400, `${fieldName} must use format YYYY-MM-DD`);
  }

  return trimmed;
}

function parseNullablePositiveInteger(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = parsePositiveInteger(value);
  if (!parsed) {
    throw createHttpError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeNumber(value, fieldName) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw createHttpError(400, `${fieldName} must be a non-negative number`);
  }

  return parsed;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function parseDataUrlToBuffer(dataUrl) {
  const raw = String(dataUrl || '').trim();
  if (!raw.startsWith('data:')) {
    return null;
  }

  const base64Marker = ';base64,';
  const markerIndex = raw.indexOf(base64Marker);
  if (markerIndex < 0) {
    return null;
  }

  const base64Payload = raw.slice(markerIndex + base64Marker.length);
  if (!base64Payload) {
    return null;
  }

  try {
    return Buffer.from(base64Payload, 'base64');
  } catch (_error) {
    return null;
  }
}

function parseReceiptUpdatePayload(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    throw createHttpError(400, 'items must contain at least one product');
  }

  const normalizedItems = items.map((item, index) => {
    const productId = parseNullablePositiveInteger(item.product_id, `items[${index}].product_id`);
    if (!productId) {
      throw createHttpError(400, `items[${index}].product_id is required`);
    }

    const quantity = Number(item.quantity);
    if (Number.isNaN(quantity) || quantity <= 0) {
      throw createHttpError(400, `items[${index}].quantity must be a positive number`);
    }

    const discount = parseNonNegativeNumber(item.discount ?? 0, `items[${index}].discount`);

    return {
      product_id: productId,
      quantity,
      discount
    };
  });

  const paymentMethod = String(payload.payment_method || '').trim();
  if (!paymentMethod || !ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    throw createHttpError(400, 'payment_method is invalid');
  }

  return {
    client_id: parseNullablePositiveInteger(payload.client_id, 'client_id'),
    payment_method: paymentMethod,
    discount: parseNonNegativeNumber(payload.discount ?? 0, 'discount'),
    tax: parseNonNegativeNumber(payload.tax ?? 0, 'tax'),
    notes: payload.notes == null ? null : String(payload.notes).trim() || null,
    items: normalizedItems
  };
}

const salesRouter = Router();

const baseSaleSelect = `
  SELECT
    s.id,
    s.sale_number,
    s.client_id,
    c.client_code,
    c.first_name AS client_first_name,
    c.last_name AS client_last_name,
    s.cashier_user_id,
    u.username AS cashier_username,
    s.cash_register_session_id,
    s.sale_type,
    s.status,
    s.subtotal,
    s.discount,
    s.tax,
    s.total,
    s.notes,
    s.sold_at,
    s.created_at,
    s.updated_at
  FROM sales s
  LEFT JOIN clients c ON c.id = s.client_id
  INNER JOIN users u ON u.id = s.cashier_user_id
`;

async function ensureUserExists(userId) {
  const result = await query('SELECT id FROM users WHERE id = $1', [userId]);
  if (result.rowCount === 0) {
    throw createHttpError(404, 'Cashier user not found');
  }
}

async function ensureClientExists(clientId) {
  if (!clientId) {
    return;
  }

  const result = await query('SELECT id FROM clients WHERE id = $1', [clientId]);
  if (result.rowCount === 0) {
    throw createHttpError(404, 'Client not found');
  }
}

async function getSaleById(saleId) {
  const saleResult = await query(`${baseSaleSelect} WHERE s.id = $1`, [saleId]);

  if (saleResult.rowCount === 0) {
    return null;
  }

  const itemsResult = await query(
    `SELECT si.id, si.product_id, si.item_type, si.description, si.quantity, si.unit_price, si.discount, si.line_total, si.membership_id,
            COALESCE(p.tax_rate, 0) AS product_tax_rate
     FROM sale_items si
     LEFT JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = $1
     ORDER BY si.id ASC`,
    [saleId]
  );

  const paymentsResult = await query(
    `SELECT id, payment_number, payment_method, amount, currency_code, reference, paid_at
     FROM payments
     WHERE sale_id = $1
     ORDER BY id ASC`,
    [saleId]
  );

  return {
    ...saleResult.rows[0],
    items: itemsResult.rows,
    payments: paymentsResult.rows
  };
}

salesRouter.get('/', async (request, response, next) => {
  try {
    const search = String(request.query.search || '').trim();
    const soldFrom = parseDateFilter(request.query.sold_from, 'sold_from');
    const soldTo = parseDateFilter(request.query.sold_to, 'sold_to');
    const { page, limit, offset } = parsePaginationParams(request.query, {
      defaultLimit: 5,
      maxLimit: 100
    });
    const params = [];
    const whereConditions = [];

    if (search) {
      params.push(`%${search}%`);
      const searchParamIndex = params.length;
      whereConditions.push(`(
        s.sale_number ILIKE $${searchParamIndex} OR
        COALESCE(c.client_code, '') ILIKE $${searchParamIndex} OR
        COALESCE(c.first_name, '') ILIKE $${searchParamIndex} OR
        COALESCE(c.last_name, '') ILIKE $${searchParamIndex} OR
        u.username ILIKE $${searchParamIndex} OR
        s.status ILIKE $${searchParamIndex}
      )`);
    }

    if (soldFrom) {
      params.push(soldFrom);
      whereConditions.push(`s.sold_at::date >= $${params.length}::date`);
    }

    if (soldTo) {
      params.push(soldTo);
      whereConditions.push(`s.sold_at::date <= $${params.length}::date`);
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM sales s
       LEFT JOIN clients c ON c.id = s.client_id
       INNER JOIN users u ON u.id = s.cashier_user_id
       ${whereClause}`,
      params
    );

    const totalItems = countResult.rows[0]?.total || 0;
    const dataParams = [...params, limit, offset];
    const result = await query(
      `${baseSaleSelect}
       ${whereClause}
       ORDER BY s.sold_at DESC, s.id DESC
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

salesRouter.get('/summary', async (_request, response, next) => {
  try {
    const result = await query(
      `WITH sales_base_per_sale AS (
         SELECT
           s.id,
           s.sold_at::date AS sold_date,
           COALESCE(s.discount, 0)::numeric(14,4) AS global_discount,
           COALESCE(
             SUM(
               CASE
                 WHEN si.item_type = 'product' AND COALESCE(p.tax_rate, 0) > 0
                   THEN si.line_total / (1 + COALESCE(p.tax_rate, 0) / 100.0)
                 ELSE si.line_total
               END
             ),
             0
           )::numeric(14,4) AS base_lines_total,
           COALESCE(SUM(si.line_total), 0)::numeric(14,4) AS gross_lines_total
         FROM sales s
         LEFT JOIN sale_items si ON si.sale_id = s.id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE s.status = 'completed'
         GROUP BY s.id, s.sold_at::date, s.discount
       ),
       sales_totals AS (
         SELECT
           COUNT(*)::int AS total_sales,
           COALESCE(
             SUM(
               GREATEST(
                 CASE
                   WHEN sb.gross_lines_total > 0
                     THEN sb.base_lines_total - (sb.global_discount * (sb.base_lines_total / sb.gross_lines_total))
                   ELSE sb.base_lines_total
                 END,
                 0
               )
             ),
             0
           )::numeric(12,2) AS total_revenue,
           COALESCE(
             SUM(
               GREATEST(
                 CASE
                   WHEN sb.gross_lines_total > 0
                     THEN sb.base_lines_total - (sb.global_discount * (sb.base_lines_total / sb.gross_lines_total))
                   ELSE sb.base_lines_total
                 END,
                 0
               )
             ) FILTER (WHERE sb.sold_date = CURRENT_DATE),
             0
           )::numeric(12,2) AS revenue_today,
           COUNT(*) FILTER (WHERE sb.sold_date = CURRENT_DATE)::int AS sales_today
         FROM sales_base_per_sale sb
       ),
       daily_pass_income AS (
         SELECT
           COALESCE(SUM(p.amount), 0)::numeric(12,2) AS total_income,
           COALESCE(SUM(p.amount) FILTER (WHERE p.paid_at::date = CURRENT_DATE), 0)::numeric(12,2) AS income_today
         FROM payments p
         WHERE p.payment_number LIKE 'DAY-%'
           AND p.sale_id IS NULL
           AND p.membership_id IS NULL
       ),
       memberships_income AS (
         SELECT
           COALESCE(SUM(m.amount_paid), 0)::numeric(12,2) AS total_income,
           COALESCE(SUM(m.amount_paid) FILTER (WHERE m.created_at::date = CURRENT_DATE), 0)::numeric(12,2) AS income_today
         FROM memberships m
         WHERE COALESCE(m.amount_paid, 0) > 0
       )
       SELECT
         st.total_sales,
         st.total_revenue,
         st.revenue_today,
         st.sales_today,
         dpi.income_today AS daily_pass_income_today,
         dpi.total_income AS daily_pass_income_total,
         mi.income_today AS memberships_income_today,
         mi.total_income AS memberships_income_total,
         (st.revenue_today + dpi.income_today + mi.income_today)::numeric(12,2) AS total_income_today,
         (st.total_revenue + dpi.total_income + mi.total_income)::numeric(12,2) AS total_income
       FROM sales_totals st
       CROSS JOIN daily_pass_income dpi
       CROSS JOIN memberships_income mi`
    );

    response.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

salesRouter.get('/:id', async (request, response, next) => {
  try {
    const saleId = parsePositiveInteger(request.params.id);
    if (!saleId) {
      throw createHttpError(400, 'Sale id must be a positive integer');
    }

    const sale = await getSaleById(saleId);
    if (!sale) {
      throw createHttpError(404, 'Sale not found');
    }

    response.json({ ok: true, data: sale });
  } catch (error) {
    next(error);
  }
});

salesRouter.get('/:id/voucher/pdf', async (request, response, next) => {
  try {
    const saleId = parsePositiveInteger(request.params.id);
    if (!saleId) {
      throw createHttpError(400, 'Sale id must be a positive integer');
    }

    const sale = await getSaleById(saleId);
    if (!sale) {
      throw createHttpError(404, 'Sale not found');
    }

    const companySettingsResult = await query(
      `SELECT setting_key, setting_value
       FROM system_settings
       WHERE setting_key = ANY($1)
       ORDER BY setting_key ASC`,
      [['company_name', 'company_logo_data_url']]
    );
    const companySettings = Object.fromEntries(
      companySettingsResult.rows.map((row) => [row.setting_key, row.setting_value])
    );
    const companyName = String(companySettings.company_name || '').trim() || 'RohiPOS';
    const companyLogoBuffer = parseDataUrlToBuffer(companySettings.company_logo_data_url);

    const itemRows = (sale.items || [])
      .filter((item) => item.item_type === 'product')
      .map((item) => {
        const rate = Number(item.product_tax_rate || 0);
        const unitPrice = Number(item.unit_price || 0);
        const quantity = Number(item.quantity || 0);
        const itemDiscount = Number(item.discount || 0);
        const grossLineTotal = roundMoney(unitPrice * quantity);
        const baseUnitPrice = rate > 0 ? roundMoney(unitPrice / (1 + rate / 100)) : unitPrice;
        const baseLineAmount = roundMoney(baseUnitPrice * quantity);
        const lineTaxAmount = roundMoney(grossLineTotal - baseLineAmount);

        return {
          ...item,
          base_unit_price: baseUnitPrice,
          base_line_amount: baseLineAmount,
          line_tax_amount: lineTaxAmount,
          line_discount_amount: itemDiscount
        };
      });
    const baseSubtotal = roundMoney(
      itemRows.reduce((sum, item) => sum + Number(item.base_line_amount || 0), 0)
    );
    const lineDiscountTotal = roundMoney(
      itemRows.reduce((sum, item) => sum + Number(item.line_discount_amount || 0), 0)
    );
    const globalDiscount = Number(sale.discount || 0);
    const discountTotal = roundMoney(lineDiscountTotal + globalDiscount);
    const lineTaxTotal = roundMoney(
      itemRows.reduce((sum, item) => sum + Number(item.line_tax_amount || 0), 0)
    );
    const additionalTax = Number(sale.tax || 0);
    const taxTotal = roundMoney(lineTaxTotal + additionalTax);
    const voucherTotal = roundMoney(baseSubtotal - discountTotal + taxTotal);
    const paymentRows = sale.payments || [];
    const paymentMethodLabel = {
      cash: 'Efectivo',
      card: 'Tarjeta',
      transfer: 'Transferencia',
      mobile: 'Movil',
      other: 'Otro'
    };

    const doc = new PDFDocument({ margin: 34, size: [226.77, 640] });
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="voucher_${sale.sale_number || sale.id}.pdf"`
    );
    doc.pipe(response);

    if (companyLogoBuffer) {
      try {
        doc.image(companyLogoBuffer, {
          fit: [96, 52],
          align: 'center'
        });
        doc.moveDown(0.25);
      } catch (_error) {
        // Keep voucher generation even if logo decoding fails.
      }
    }

    doc.font('Helvetica-Bold').fontSize(14).text(companyName, { align: 'center' });
    doc.font('Helvetica').fontSize(9).text('Comprobante de venta', { align: 'center' });
    doc.moveDown(0.6);

    doc.fontSize(8).text(`Recibo: ${sale.sale_number || sale.id}`);
    doc.text(`Fecha: ${new Date(sale.sold_at).toLocaleString('es-NI')}`);
    doc.text(`Cajero: ${sale.cashier_username || sale.cashier_user_id}`);
    doc.text(
      `Cliente: ${sale.client_first_name ? `${sale.client_first_name} ${sale.client_last_name || ''}`.trim() : 'Mostrador'}`
    );
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Producto', 34, doc.y, { width: 158, align: 'left' });
    doc.moveDown(0.45);
    const headerY = doc.y;
    doc.text('P.Base', 34, headerY, { width: 70, align: 'left', lineBreak: false });
    doc.text('Cant', 116, headerY, { width: 24, align: 'right', lineBreak: false });
    doc.text('Impte', 142, headerY, { width: 50, align: 'right' });
    doc.moveDown(0.7);
    doc.font('Helvetica').fontSize(8);

    if (!itemRows.length) {
      doc.text('Sin lineas de producto', { align: 'left' });
    } else {
      itemRows.forEach((item) => {
        doc.text(item.description || '-', 34, doc.y, { width: 158, align: 'left' });
        doc.moveDown(0.25);

        const valuesY = doc.y;
        doc.text(`C$${Number(item.base_unit_price || 0).toFixed(2)}`, 34, valuesY, {
          width: 70,
          align: 'left',
          lineBreak: false
        });
        doc.text(Number(item.quantity || 0).toFixed(2), 116, valuesY, {
          width: 24,
          align: 'right',
          lineBreak: false
        });
        doc.text(`C$${Number(item.base_line_amount || 0).toFixed(2)}`, 142, valuesY, {
          width: 50,
          align: 'right'
        });
        doc.moveDown(0.8);
      });
    }

    doc.moveDown(0.4);
    doc.moveTo(34, doc.y).lineTo(192, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(8);
    doc.text('Subtotal', 34, doc.y, { width: 120, align: 'left' });
    doc.text(`C$${baseSubtotal.toFixed(2)}`, 154, doc.y, { width: 38, align: 'right' });
    doc.moveDown(0.4);
    doc.text('Desc. total', 34, doc.y, { width: 120, align: 'left' });
    doc.text(`C$${discountTotal.toFixed(2)}`, 154, doc.y, { width: 38, align: 'right' });
    doc.moveDown(0.4);
    doc.text('Imp. total', 34, doc.y, { width: 120, align: 'left' });
    doc.text(`C$${taxTotal.toFixed(2)}`, 154, doc.y, { width: 38, align: 'right' });
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('TOTAL', 34, doc.y, { width: 120, align: 'left' });
    doc.text(`C$${voucherTotal.toFixed(2)}`, 154, doc.y, { width: 38, align: 'right' });
    doc.moveDown(0.7);

    doc.font('Helvetica').fontSize(8).text('Pagos', { align: 'left' });
    if (!paymentRows.length) {
      doc.text('Sin pagos asociados');
    } else {
      paymentRows.forEach((payment) => {
        const label = paymentMethodLabel[payment.payment_method] || payment.payment_method;
        doc.text(`${label}: C$${Number(payment.amount || 0).toFixed(2)}`);
      });
    }

    doc.moveDown(0.8);
    doc.fontSize(8).text('Gracias por su compra', 34, doc.y, { width: 158, align: 'center' });
    doc.text(companyName, 34, doc.y, { width: 158, align: 'center' });

    doc.end();
  } catch (error) {
    next(error);
  }
});

salesRouter.post('/', async (request, response, next) => {
  try {
    const payload = validateCreateSalePayload(request.body);
    await ensureUserExists(payload.cashier_user_id);
    await ensureClientExists(payload.client_id);

    const saleId = await withTransaction(async (dbClient) => {
      const productSnapshots = [];

      for (const item of payload.items) {
        const productResult = await dbClient.query(
          `SELECT id, name, sale_price, tax_rate, stock_quantity, cost_price
           FROM products
           WHERE id = $1 AND is_active = TRUE
           FOR UPDATE`,
          [item.product_id]
        );

        if (productResult.rowCount === 0) {
          throw createHttpError(404, `Product ${item.product_id} not found or inactive`);
        }

        const product = productResult.rows[0];
        const currentStock = Number(product.stock_quantity);

        if (currentStock < item.quantity) {
          throw createHttpError(400, `Insufficient stock for product ${product.name}`);
        }

        const unitPrice = roundMoney(
          Number(product.sale_price) * (1 + Number(product.tax_rate || 0) / 100)
        );
        const lineTotal = roundMoney(unitPrice * item.quantity - item.discount);

        if (lineTotal < 0) {
          throw createHttpError(400, `Invalid discount for product ${product.name}`);
        }

        productSnapshots.push({
          ...item,
          name: product.name,
          previous_stock: currentStock,
          new_stock: currentStock - item.quantity,
          unit_price: unitPrice,
          line_total: lineTotal
        });
      }

      const subtotal = roundMoney(productSnapshots.reduce((sum, item) => sum + item.line_total, 0));
      const total = roundMoney(subtotal - payload.discount + payload.tax);

      if (total <= 0) {
        throw createHttpError(400, 'Sale total must be greater than zero');
      }

      const timestampSuffix = Date.now().toString().slice(-6);
      const saleNumber = `SALE-${timestampSuffix}`;
      const paymentNumber = `PAY-${timestampSuffix}`;
      let cashSessionId = payload.cash_register_session_id;

      if (!cashSessionId) {
        const openSession = await getOrCreateOpenCashSession(payload.cashier_user_id, dbClient);
        cashSessionId = openSession.id;
      }

      const saleResult = await dbClient.query(
        `INSERT INTO sales (
           sale_number, client_id, cashier_user_id, cash_register_session_id, sale_type,
           status, subtotal, discount, tax, total, notes
         )
         VALUES ($1, $2, $3, $4, 'product', 'completed', $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          saleNumber,
          payload.client_id,
          payload.cashier_user_id,
          cashSessionId,
          subtotal,
          payload.discount,
          payload.tax,
          total,
          payload.notes
        ]
      );

      const saleId = saleResult.rows[0].id;

      for (const item of productSnapshots) {
        await dbClient.query(
          `INSERT INTO sale_items (
             sale_id, product_id, item_type, description, quantity, unit_price, discount, line_total
           )
           VALUES ($1, $2, 'product', $3, $4, $5, $6, $7)`,
          [
            saleId,
            item.product_id,
            item.description || item.name,
            item.quantity,
            item.unit_price,
            item.discount,
            item.line_total
          ]
        );

        await dbClient.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [
          item.new_stock,
          item.product_id
        ]);

        await dbClient.query(
          `INSERT INTO inventory_movements (
             product_id, user_id, movement_type, quantity, previous_stock, new_stock,
             unit_cost, reference_type, reference_id, notes
           )
           VALUES ($1, $2, 'sale', $3, $4, $5, $6, 'sale', $7, $8)`,
          [
            item.product_id,
            payload.cashier_user_id,
            item.quantity,
            item.previous_stock,
            item.new_stock,
            null,
            saleId,
            `Automatic stock output for sale ${saleNumber}`
          ]
        );
      }

      await dbClient.query(
        `INSERT INTO payments (
           payment_number, client_id, sale_id, received_by_user_id, payment_method, amount, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          paymentNumber,
          payload.client_id,
          saleId,
          payload.cashier_user_id,
          payload.payment_method,
          total,
          payload.notes
        ]
      );

      return saleId;
    });

    const sale = await getSaleById(saleId);

    response.status(201).json({
      ok: true,
      message: 'Sale created successfully',
      data: sale
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.put('/:id', async (request, response, next) => {
  try {
    const saleId = parsePositiveInteger(request.params.id);
    if (!saleId) {
      throw createHttpError(400, 'Sale id must be a positive integer');
    }

    const updates = validateUpdateSaleReceiptPayload(request.body);

    if ('client_id' in updates) {
      await ensureClientExists(updates.client_id);
    }

    await withTransaction(async (dbClient) => {
      const lockResult = await dbClient.query(
        `SELECT id FROM sales WHERE id = $1 FOR UPDATE`,
        [saleId]
      );

      if (lockResult.rowCount === 0) {
        throw createHttpError(404, 'Sale not found');
      }

      const saleSetClauses = [];
      const saleValues = [];

      if ('client_id' in updates) {
        saleValues.push(updates.client_id);
        saleSetClauses.push(`client_id = $${saleValues.length}`);
      }

      if ('notes' in updates) {
        saleValues.push(updates.notes);
        saleSetClauses.push(`notes = $${saleValues.length}`);
      }

      if (saleSetClauses.length > 0) {
        await dbClient.query(
          `UPDATE sales
           SET ${saleSetClauses.join(', ')}
           WHERE id = $${saleValues.length + 1}`,
          [...saleValues, saleId]
        );
      }

      const paymentSetClauses = [];
      const paymentValues = [];

      if ('client_id' in updates) {
        paymentValues.push(updates.client_id);
        paymentSetClauses.push(`client_id = $${paymentValues.length}`);
      }

      if ('payment_method' in updates) {
        paymentValues.push(updates.payment_method);
        paymentSetClauses.push(`payment_method = $${paymentValues.length}`);
      }

      if (paymentSetClauses.length > 0) {
        await dbClient.query(
          `UPDATE payments
           SET ${paymentSetClauses.join(', ')}
           WHERE sale_id = $${paymentValues.length + 1}`,
          [...paymentValues, saleId]
        );
      }
    });

    const sale = await getSaleById(saleId);

    response.json({
      ok: true,
      message: 'Receipt updated successfully',
      data: sale
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.put('/:id/receipt', async (request, response, next) => {
  try {
    const saleId = parsePositiveInteger(request.params.id);
    if (!saleId) {
      throw createHttpError(400, 'Sale id must be a positive integer');
    }

    const payload = parseReceiptUpdatePayload(request.body);
    await ensureClientExists(payload.client_id);

    await withTransaction(async (dbClient) => {
      const saleResult = await dbClient.query(
        `SELECT id, sale_number, status, cashier_user_id
         FROM sales
         WHERE id = $1
         FOR UPDATE`,
        [saleId]
      );

      if (saleResult.rowCount === 0) {
        throw createHttpError(404, 'Sale not found');
      }

      const sale = saleResult.rows[0];
      if (sale.status === 'cancelled') {
        throw createHttpError(409, 'Cannot edit a cancelled receipt');
      }

      const oldItemsResult = await dbClient.query(
        `SELECT product_id, quantity
         FROM sale_items
         WHERE sale_id = $1
           AND item_type = 'product'
           AND product_id IS NOT NULL`,
        [saleId]
      );

      const oldByProduct = new Map();
      oldItemsResult.rows.forEach((row) => {
        const key = Number(row.product_id);
        oldByProduct.set(key, (oldByProduct.get(key) || 0) + Number(row.quantity || 0));
      });

      const newByProduct = new Map();
      payload.items.forEach((item) => {
        newByProduct.set(
          item.product_id,
          (newByProduct.get(item.product_id) || 0) + Number(item.quantity || 0)
        );
      });

      const productIds = new Set([...oldByProduct.keys(), ...newByProduct.keys()]);
      const productSnapshots = new Map();

      for (const productId of productIds) {
        const productResult = await dbClient.query(
          `SELECT id, name, sale_price, tax_rate, stock_quantity
           FROM products
           WHERE id = $1
           FOR UPDATE`,
          [productId]
        );

        if (productResult.rowCount === 0) {
          throw createHttpError(404, `Product ${productId} not found`);
        }

        productSnapshots.set(productId, productResult.rows[0]);
      }

      const preparedItems = payload.items.map((item) => {
        const product = productSnapshots.get(item.product_id);
        const unitPrice = roundMoney(
          Number(product.sale_price) * (1 + Number(product.tax_rate || 0) / 100)
        );
        const lineTotal = roundMoney(unitPrice * Number(item.quantity) - Number(item.discount));

        if (lineTotal < 0) {
          throw createHttpError(400, `Invalid discount for product ${product.name}`);
        }

        return {
          ...item,
          name: product.name,
          unit_price: unitPrice,
          line_total: lineTotal
        };
      });

      for (const [productId, product] of productSnapshots) {
        const oldQty = Number(oldByProduct.get(productId) || 0);
        const newQty = Number(newByProduct.get(productId) || 0);
        const reconciledStock = Number(product.stock_quantity) + oldQty - newQty;

        if (reconciledStock < 0) {
          throw createHttpError(400, `Insufficient stock to update receipt for product ${product.name}`);
        }

        await dbClient.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [
          reconciledStock,
          productId
        ]);
      }

      await dbClient.query('DELETE FROM sale_items WHERE sale_id = $1', [saleId]);

      for (const item of preparedItems) {
        await dbClient.query(
          `INSERT INTO sale_items (
             sale_id, product_id, item_type, description, quantity, unit_price, discount, line_total
           )
           VALUES ($1, $2, 'product', $3, $4, $5, $6, $7)`,
          [
            saleId,
            item.product_id,
            item.name,
            item.quantity,
            item.unit_price,
            item.discount,
            item.line_total
          ]
        );
      }

      const subtotal = roundMoney(preparedItems.reduce((sum, item) => sum + Number(item.line_total), 0));
      const total = roundMoney(subtotal - Number(payload.discount) + Number(payload.tax));

      if (total <= 0) {
        throw createHttpError(400, 'Sale total must be greater than zero');
      }

      await dbClient.query(
        `UPDATE sales
         SET client_id = $1, subtotal = $2, discount = $3, tax = $4, total = $5, notes = $6
         WHERE id = $7`,
        [
          payload.client_id,
          subtotal,
          payload.discount,
          payload.tax,
          total,
          payload.notes,
          saleId
        ]
      );

      await dbClient.query(
        `UPDATE payments
         SET client_id = $1, payment_method = $2, amount = $3, notes = $4
         WHERE sale_id = $5`,
        [payload.client_id, payload.payment_method, total, payload.notes, saleId]
      );
    });

    const sale = await getSaleById(saleId);
    response.json({
      ok: true,
      message: 'Receipt updated successfully',
      data: sale
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.post('/:id/cancel', async (request, response, next) => {
  try {
    const saleId = parsePositiveInteger(request.params.id);
    if (!saleId) {
      throw createHttpError(400, 'Sale id must be a positive integer');
    }

    const cancelledByUserId = Number(request.user?.id);
    if (!Number.isInteger(cancelledByUserId) || cancelledByUserId <= 0) {
      throw createHttpError(401, 'User session is invalid');
    }

    const reason = String(request.body?.reason || '').trim();

    await withTransaction(async (dbClient) => {
      const saleResult = await dbClient.query(
        `SELECT id, status, notes
         FROM sales
         WHERE id = $1
         FOR UPDATE`,
        [saleId]
      );

      if (saleResult.rowCount === 0) {
        throw createHttpError(404, 'Sale not found');
      }

      const sale = saleResult.rows[0];
      if (sale.status === 'cancelled') {
        throw createHttpError(409, 'Receipt is already cancelled');
      }

      const itemsResult = await dbClient.query(
        `SELECT product_id, quantity
         FROM sale_items
         WHERE sale_id = $1
           AND item_type = 'product'
           AND product_id IS NOT NULL`,
        [saleId]
      );

      for (const row of itemsResult.rows) {
        const productResult = await dbClient.query(
          `SELECT id, stock_quantity
           FROM products
           WHERE id = $1
           FOR UPDATE`,
          [row.product_id]
        );

        if (productResult.rowCount === 0) {
          continue;
        }

        await dbClient.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [
          Number(productResult.rows[0].stock_quantity || 0) + Number(row.quantity || 0),
          row.product_id
        ]);
      }

      const cancellationNote = [
        String(sale.notes || '').trim(),
        `[ANULADO ${new Date().toISOString()}] ${reason || 'Sin motivo especifico'}`
      ]
        .filter(Boolean)
        .join(' | ');

      await dbClient.query(
        `UPDATE sales
         SET status = 'cancelled', notes = $1, cancelled_at = NOW(), cancelled_by_user_id = $2
         WHERE id = $3`,
        [cancellationNote, cancelledByUserId, saleId]
      );

      await dbClient.query(
        `UPDATE payments
         SET notes = COALESCE(notes, '') || $1
         WHERE sale_id = $2`,
        [` | [ANULADO ${new Date().toISOString()}]`, saleId]
      );
    });

    const sale = await getSaleById(saleId);
    response.json({
      ok: true,
      message: 'Receipt cancelled successfully',
      data: sale
    });
  } catch (error) {
    next(error);
  }
});

export { salesRouter };
