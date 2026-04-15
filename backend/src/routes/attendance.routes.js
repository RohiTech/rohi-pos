import { Router } from 'express';
import { query, withTransaction } from '../config/db.js';
import {
  createHttpError,
  createPaginationMeta,
  parsePaginationParams,
  parsePositiveInteger
} from '../utils/http.js';
import { inferMembershipStatus } from '../utils/memberships.js';

const attendanceRouter = Router();
const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'card', 'transfer', 'mobile', 'other']);

function parsePositiveNumber(value, fieldName) {
  const parsed = Number(value);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} must be a positive number`);
  }

  return parsed;
}

async function ensureClientExists(clientId) {
  const result = await query(
    `SELECT id, client_code, first_name, last_name, is_active
     FROM clients
     WHERE id = $1`,
    [clientId]
  );

  if (result.rowCount === 0) {
    throw createHttpError(404, 'Client not found');
  }

  return result.rows[0];
}

function ensureClientIsActive(client) {
  if (!client.is_active) {
    throw createHttpError(409, 'El cliente esta inactivo y no puede marcar asistencia.');
  }
}

async function ensureUserExists(userId) {
  const result = await query('SELECT id FROM users WHERE id = $1', [userId]);

  if (result.rowCount === 0) {
    throw createHttpError(404, 'User not found');
  }
}

async function getSystemSettings() {
  const result = await query(
    `SELECT setting_key, setting_value
     FROM system_settings
     WHERE setting_key IN ('currency_code', 'membership_expiry_alert_days', 'routine_price')`
  );

  const settings = Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value]));

  return {
    currency_code: settings.currency_code || 'NIO',
    membership_expiry_alert_days: Number(settings.membership_expiry_alert_days || 3),
    routine_price: Number(settings.routine_price || 0)
  };
}

async function getLatestMembershipForClient(clientId, dbClient = null) {
  const executor = dbClient || { query };
  const result = await executor.query(
    `SELECT
       m.id,
       m.membership_number,
       m.client_id,
       m.plan_id,
       mp.name AS plan_name,
       m.start_date,
       m.end_date,
       m.status,
       m.price,
       m.discount,
       m.amount_paid
     FROM memberships m
     INNER JOIN membership_plans mp ON mp.id = m.plan_id
     WHERE m.client_id = $1
     ORDER BY m.end_date DESC, m.id DESC
     LIMIT 1`,
    [clientId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const membership = result.rows[0];
  const effectiveStatus =
    membership.status === 'cancelled'
      ? 'cancelled'
      : inferMembershipStatus(membership.start_date, membership.end_date);
  const today = new Date();
  const endDate = new Date(membership.end_date);
  const daysUntilExpiry = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

  return {
    ...membership,
    effective_status: effectiveStatus,
    days_until_expiry: daysUntilExpiry
  };
}

attendanceRouter.get('/clients', async (request, response, next) => {
  try {
    const search = String(request.query.search || '').trim();
    const { page, limit, offset } = parsePaginationParams(request.query, {
      defaultLimit: 8,
      maxLimit: 100
    });
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(c.client_code ILIKE $${params.length} OR c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length} OR COALESCE(c.phone, '') ILIKE $${params.length})`
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM clients c
       ${whereClause}`,
      params
    );

    const totalItems = countResult.rows[0]?.total || 0;
    const dataParams = [...params, limit, offset];

    const result = await query(
      `SELECT
         c.id,
         c.client_code,
         c.first_name,
         c.last_name,
        c.photo_url,
         c.phone,
         c.is_active,
         m.membership_number,
         m.start_date,
         m.end_date,
         m.status AS membership_status,
         mp.name AS plan_name
       FROM clients c
       LEFT JOIN LATERAL (
         SELECT *
         FROM memberships
         WHERE client_id = c.id
         ORDER BY end_date DESC, id DESC
         LIMIT 1
       ) m ON TRUE
        LEFT JOIN membership_plans mp ON mp.id = m.plan_id
        ${whereClause}
        ORDER BY c.first_name ASC, c.last_name ASC
        LIMIT $${dataParams.length - 1}
        OFFSET $${dataParams.length}`,
      dataParams
    );

    response.json({
      ok: true,
      count: result.rowCount,
      data: result.rows.map((row) => ({
        ...row,
        can_check_in_with_membership:
          row.membership_status && inferMembershipStatus(row.start_date, row.end_date) === 'active',
        membership_effective_status:
          row.membership_status === 'cancelled' || !row.end_date
            ? row.membership_status
            : inferMembershipStatus(row.start_date, row.end_date)
      })),
      pagination: createPaginationMeta(totalItems, page, limit)
    });
  } catch (error) {
    next(error);
  }
});

attendanceRouter.get('/summary', async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE checked_in_at::date = CURRENT_DATE)::int AS total_today,
         COUNT(*) FILTER (WHERE checked_in_at::date = CURRENT_DATE AND status = 'allowed')::int AS allowed_today,
         COUNT(*) FILTER (WHERE checked_in_at::date = CURRENT_DATE AND status = 'denied')::int AS denied_today,
         COALESCE((
           SELECT SUM(p.amount)
           FROM checkins ch2
           INNER JOIN payments p ON p.id = ch2.payment_id
           WHERE ch2.checked_in_at::date = CURRENT_DATE
             AND ch2.access_type = 'daily_pass'
         ), 0)::numeric(12,2) AS daily_pass_income_today
       FROM checkins`
    );

    response.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

attendanceRouter.get('/checkins', async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT
         ch.id,
         ch.checked_in_at,
         ch.status,
         ch.access_type,
         ch.notes,
         c.client_code,
         c.first_name AS client_first_name,
         c.last_name AS client_last_name,
         m.membership_number,
         p.amount AS payment_amount,
         p.payment_method
       FROM checkins ch
       INNER JOIN clients c ON c.id = ch.client_id
       LEFT JOIN memberships m ON m.id = ch.membership_id
       LEFT JOIN payments p ON p.id = ch.payment_id
       WHERE ch.checked_in_at::date = CURRENT_DATE
       ORDER BY ch.checked_in_at DESC, ch.id DESC
       LIMIT 100`
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

attendanceRouter.post('/checkins', async (request, response, next) => {
  try {
    const clientId = parsePositiveInteger(request.body.client_id);
    const checkedInByUserId = parsePositiveInteger(request.body.checked_in_by_user_id);
    const accessType = String(request.body.access_type || 'membership').trim();
    const paymentMethod = String(request.body.payment_method || 'cash').trim();
    const notes = String(request.body.notes || '').trim() || null;

    if (!clientId) {
      throw createHttpError(400, 'client_id must be a positive integer');
    }

    if (!checkedInByUserId) {
      throw createHttpError(400, 'checked_in_by_user_id must be a positive integer');
    }

    if (!['membership', 'daily_pass'].includes(accessType)) {
      throw createHttpError(400, 'access_type is invalid');
    }

    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
      throw createHttpError(400, 'payment_method is invalid');
    }

    const client = await ensureClientExists(clientId);
    ensureClientIsActive(client);
    await ensureUserExists(checkedInByUserId);
    const settings = await getSystemSettings();

    const result = await withTransaction(async (dbClient) => {
      const membership = await getLatestMembershipForClient(clientId, dbClient);

      if (accessType === 'membership') {
        if (membership && membership.effective_status === 'active') {
          const checkinResult = await dbClient.query(
            `INSERT INTO checkins (
               client_id, membership_id, checked_in_by_user_id, status, access_type, notes
             )
             VALUES ($1, $2, $3, 'allowed', 'membership', $4)
             RETURNING id, checked_in_at, status, access_type`,
            [clientId, membership.id, checkedInByUserId, notes]
          );

          const warning =
            membership.days_until_expiry >= 0 &&
            membership.days_until_expiry <= settings.membership_expiry_alert_days
              ? `La membresia vence en ${membership.days_until_expiry} dia(s).`
              : null;

          return {
            ...checkinResult.rows[0],
            client,
            membership,
            warning_message: warning
          };
        }

        const deniedReason =
          membership && membership.effective_status === 'expired'
            ? 'La membresia esta expirada. Debe renovarla.'
            : membership && membership.effective_status === 'cancelled'
              ? 'La membresia del cliente esta cancelada.'
            : 'El cliente no tiene una membresia vigente.';
        throw createHttpError(409, deniedReason);
      }

      const dailyPassAmount = parsePositiveNumber(request.body.daily_pass_amount, 'daily_pass_amount');
      const paymentNumber = `DAY-${Date.now().toString().slice(-6)}`;

      const paymentResult = await dbClient.query(
        `INSERT INTO payments (
           payment_number,
           client_id,
           received_by_user_id,
           payment_method,
           amount,
           currency_code,
           notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, payment_number, amount, payment_method, paid_at`,
        [
          paymentNumber,
          clientId,
          checkedInByUserId,
          paymentMethod,
          dailyPassAmount,
          settings.currency_code,
          notes || 'Pago diario de acceso'
        ]
      );

      const checkinResult = await dbClient.query(
        `INSERT INTO checkins (
           client_id, membership_id, payment_id, checked_in_by_user_id, status, access_type, notes
         )
         VALUES ($1, $2, $3, $4, 'allowed', 'daily_pass', $5)
         RETURNING id, checked_in_at, status, access_type`,
        [clientId, membership?.id || null, paymentResult.rows[0].id, checkedInByUserId, notes]
      );

      return {
        ...checkinResult.rows[0],
        client,
        membership,
        payment: paymentResult.rows[0],
        warning_message: membership?.effective_status === 'expired'
          ? 'La membresia esta expirada. Se registro ingreso por pago diario.'
          : null
      };
    });

    response.status(201).json({
      ok: true,
      message: 'Check-in processed successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

export { attendanceRouter };
