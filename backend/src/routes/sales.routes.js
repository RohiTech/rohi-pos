import { Router } from 'express';
import { query, withTransaction } from '../config/db.js';
import { createHttpError, parsePositiveInteger } from '../utils/http.js';
import { validateCreateSalePayload } from '../utils/pos.js';

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
    `SELECT id, product_id, item_type, description, quantity, unit_price, discount, line_total, membership_id
     FROM sale_items
     WHERE sale_id = $1
     ORDER BY id ASC`,
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
    const limit = Math.min(Number.parseInt(request.query.limit, 10) || 50, 100);
    const result = await query(
      `${baseSaleSelect}
       ORDER BY s.sold_at DESC, s.id DESC
       LIMIT $1`,
      [limit]
    );

    response.json({ ok: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    next(error);
  }
});

salesRouter.get('/summary', async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*)::int AS total_sales,
         COALESCE(SUM(total), 0)::numeric(12,2) AS total_revenue,
         COALESCE(SUM(total) FILTER (WHERE sold_at::date = CURRENT_DATE), 0)::numeric(12,2) AS revenue_today,
         COUNT(*) FILTER (WHERE sold_at::date = CURRENT_DATE)::int AS sales_today
       FROM sales
       WHERE status = 'completed'`
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

salesRouter.post('/', async (request, response, next) => {
  try {
    const payload = validateCreateSalePayload(request.body);
    await ensureUserExists(payload.cashier_user_id);
    await ensureClientExists(payload.client_id);

    const saleId = await withTransaction(async (dbClient) => {
      const productSnapshots = [];

      for (const item of payload.items) {
        const productResult = await dbClient.query(
          `SELECT id, name, sale_price, stock_quantity, cost_price
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

        const unitPrice = Number(product.sale_price);
        const lineTotal = unitPrice * item.quantity - item.discount;

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

      const subtotal = productSnapshots.reduce((sum, item) => sum + item.line_total, 0);
      const total = subtotal - payload.discount + payload.tax;

      if (total <= 0) {
        throw createHttpError(400, 'Sale total must be greater than zero');
      }

      const timestampSuffix = Date.now().toString().slice(-6);
      const saleNumber = `SALE-${timestampSuffix}`;
      const paymentNumber = `PAY-${timestampSuffix}`;

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
          payload.cash_register_session_id,
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

export { salesRouter };
