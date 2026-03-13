import { Router } from 'express';
import { query } from '../config/db.js';
import {
  addDaysToDate,
  inferMembershipStatus,
  validateCreateMembershipPayload,
  validateUpdateMembershipPayload
} from '../utils/memberships.js';
import { createHttpError, parsePositiveInteger } from '../utils/http.js';

const membershipsRouter = Router();

const baseMembershipSelect = `
  SELECT
    m.id,
    m.membership_number,
    m.client_id,
    c.client_code,
    c.first_name AS client_first_name,
    c.last_name AS client_last_name,
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
    const limit = Math.min(Number.parseInt(request.query.limit, 10) || 50, 100);
    const status = String(request.query.status || '').trim();
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

    if (Number.isInteger(expiringInDays) && expiringInDays >= 0) {
      params.push(expiringInDays);
      conditions.push(
        `m.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + ($${params.length} * INTERVAL '1 day'))`
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);

    const result = await query(
      `${baseMembershipSelect}
       ${whereClause}
       ORDER BY m.end_date ASC, m.id DESC
       LIMIT $${params.length}`,
      params
    );

    response.json({
      ok: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

membershipsRouter.get('/summary', async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*)::int AS total_memberships,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active_memberships,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_memberships,
         COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_memberships,
         COUNT(*) FILTER (WHERE end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS expiring_in_7_days
       FROM memberships`
    );

    response.json({
      ok: true,
      data: result.rows[0]
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
    await ensureUserExists(payload.sold_by_user_id);

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

    const result = await query(
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
        payload.sold_by_user_id,
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

    const membership = await getMembershipById(result.rows[0].id);

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

export { membershipsRouter };
