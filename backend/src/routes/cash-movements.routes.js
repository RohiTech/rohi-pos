import { Router } from 'express';
import { query } from '../config/db.js';
import { createPaginationMeta, parsePaginationParams } from '../utils/http.js';
import { validateCreateCashMovementPayload } from '../utils/pos.js';

const cashMovementsRouter = Router();

cashMovementsRouter.get('/', async (request, response, next) => {
  try {
    const search = String(request.query.search || '').trim();
    const movementType = String(request.query.movement_type || '').trim();
    const { page, limit, offset } = parsePaginationParams(request.query, {
      defaultLimit: 8,
      maxLimit: 100
    });

    const params = [];
    const conditions = [];

    if (movementType) {
      params.push(movementType);
      conditions.push(`cm.movement_type = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`COALESCE(cm.description, '') ILIKE $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM cash_movements cm
       ${whereClause}`,
      params
    );

    const totalItems = countResult.rows[0]?.total || 0;
    const dataParams = [...params, limit, offset];

    const result = await query(
      `SELECT
         cm.id,
         cm.user_id,
         u.username,
         cm.movement_type,
         cm.description,
         cm.amount,
         cm.created_at,
         cm.updated_at
       FROM cash_movements cm
       LEFT JOIN users u ON u.id = cm.user_id
       ${whereClause}
       ORDER BY cm.created_at DESC, cm.id DESC
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

cashMovementsRouter.get('/summary', async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE movement_type = 'income'), 0)::numeric(12,2) AS total_income,
         COALESCE(SUM(amount) FILTER (WHERE movement_type = 'expense'), 0)::numeric(12,2) AS total_expense,
         COALESCE(SUM(CASE WHEN movement_type = 'income' THEN amount ELSE -amount END), 0)::numeric(12,2) AS net_balance
       FROM cash_movements`
    );

    response.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

cashMovementsRouter.post('/', async (request, response, next) => {
  try {
    const payload = validateCreateCashMovementPayload(request.body);

    const result = await query(
      `INSERT INTO cash_movements (user_id, movement_type, description, amount)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, movement_type, description, amount, created_at`,
      [payload.user_id, payload.movement_type, payload.description, payload.amount]
    );

    response.status(201).json({
      ok: true,
      message: 'Cash movement created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

export { cashMovementsRouter };
