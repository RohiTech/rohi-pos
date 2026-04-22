import { Router } from 'express';
import { query } from '../config/db.js';
import {
  validateCreateMembershipPlanPayload,
  validateUpdateMembershipPlanPayload
} from '../utils/membership-plans.js';
import {
  createHttpError,
  createPaginationMeta,
  parsePaginationParams,
  parsePositiveInteger
} from '../utils/http.js';

const membershipPlansRouter = Router();

const basePlanSelect = `
  SELECT
    id,
    name,
    description,
    duration_days,
    base_price,
    tax_name,
    tax_rate,
    price,
    allows_multiple_checkins_per_day,
    is_active,
    created_at,
    updated_at
  FROM membership_plans
`;

function mapPostgresError(error) {
  if (error.code === '23505') {
    throw createHttpError(409, 'A membership plan with the same unique value already exists');
  }

  throw error;
}

membershipPlansRouter.get('/', async (request, response, next) => {
  try {
    const onlyActive = request.query.active === 'true';
    const search = String(request.query.search || '').trim();
    const { page, limit, offset } = parsePaginationParams(request.query, {
      defaultLimit: 6,
      maxLimit: 100
    });
    const params = [];
    const conditions = [];

    if (onlyActive) {
      params.push(true);
      conditions.push(`is_active = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR COALESCE(description, '') ILIKE $${params.length} OR CAST(duration_days AS TEXT) ILIKE $${params.length} OR CAST(base_price AS TEXT) ILIKE $${params.length} OR CAST(price AS TEXT) ILIKE $${params.length} OR COALESCE(tax_name, '') ILIKE $${params.length} OR CAST(tax_rate AS TEXT) ILIKE $${params.length})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM membership_plans
       ${whereClause}`,
      params
    );

    const totalItems = countResult.rows[0]?.total || 0;
    const dataParams = [...params, limit, offset];

    const result = await query(
      `${basePlanSelect}
       ${whereClause}
       ORDER BY duration_days ASC, id DESC
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

membershipPlansRouter.get('/:id', async (request, response, next) => {
  try {
    const planId = parsePositiveInteger(request.params.id);

    if (!planId) {
      throw createHttpError(400, 'Plan id must be a positive integer');
    }

    const result = await query(`${basePlanSelect} WHERE id = $1`, [planId]);

    if (result.rowCount === 0) {
      throw createHttpError(404, 'Membership plan not found');
    }

    response.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

membershipPlansRouter.post('/', async (request, response, next) => {
  try {
    const payload = validateCreateMembershipPlanPayload(request.body);

    const result = await query(
      `INSERT INTO membership_plans (
         name,
         description,
         duration_days,
         base_price,
         tax_name,
         tax_rate,
         price,
         allows_multiple_checkins_per_day,
         is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, duration_days, base_price, tax_name, tax_rate, price, is_active, created_at`,
      [
        payload.name,
        payload.description,
        payload.duration_days,
        payload.base_price,
        payload.tax_name,
        payload.tax_rate,
        payload.price,
        payload.allows_multiple_checkins_per_day,
        payload.is_active
      ]
    );

    response.status(201).json({
      ok: true,
      message: 'Membership plan created successfully',
      data: result.rows[0]
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

membershipPlansRouter.put('/:id', async (request, response, next) => {
  try {
    const planId = parsePositiveInteger(request.params.id);

    if (!planId) {
      throw createHttpError(400, 'Plan id must be a positive integer');
    }

    const updates = validateUpdateMembershipPlanPayload(request.body);
    const keys = Object.keys(updates);
    const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);
    const values = keys.map((key) => updates[key]);

    const result = await query(
      `UPDATE membership_plans
       SET ${setClauses.join(', ')}
       WHERE id = $${keys.length + 1}
       RETURNING id, name, duration_days, base_price, tax_name, tax_rate, price, is_active, updated_at`,
      [...values, planId]
    );

    if (result.rowCount === 0) {
      throw createHttpError(404, 'Membership plan not found');
    }

    response.json({
      ok: true,
      message: 'Membership plan updated successfully',
      data: result.rows[0]
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

export { membershipPlansRouter };
