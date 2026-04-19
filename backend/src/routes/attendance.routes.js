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
const CURRENT_OCCUPANCY_WINDOW_MINUTES = 120;

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

async function resolveClientByCode(clientCode) {
  const normalizedCode = String(clientCode || '').trim();

  if (!normalizedCode) {
    throw createHttpError(400, 'client_code is required');
  }

  const result = await query(
    `SELECT id, client_code, first_name, last_name, is_active
     FROM clients
     WHERE LOWER(client_code) = LOWER($1)
     LIMIT 1`,
    [normalizedCode]
  );

  if (result.rowCount === 0) {
    throw createHttpError(404, 'Client code not found');
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

async function processAttendanceCheckin({
  clientId,
  checkedInByUserId,
  accessType,
  paymentMethod,
  dailyPassAmount,
  notes
}) {
  const client = await ensureClientExists(clientId);
  ensureClientIsActive(client);
  await ensureUserExists(checkedInByUserId);
  const settings = await getSystemSettings();

  return withTransaction(async (dbClient) => {
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

    const parsedDailyPassAmount = parsePositiveNumber(dailyPassAmount, 'daily_pass_amount');
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
        parsedDailyPassAmount,
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
      warning_message:
        membership?.effective_status === 'expired'
          ? 'La membresia esta expirada. Se registro ingreso por pago diario.'
          : null
    };
  });
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
      `WITH daily_counts AS (
         SELECT
           day::date AS calendar_day,
           COALESCE(COUNT(ch.id) FILTER (WHERE ch.status = 'allowed'), 0)::int AS allowed_count
         FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS day
         LEFT JOIN checkins ch
           ON ch.checked_in_at::date = day::date
         GROUP BY day
       ),
       recent_unique_clients AS (
         SELECT DISTINCT ON (ch.client_id)
           ch.client_id,
           ch.checked_in_at,
           ch.status
         FROM checkins ch
         WHERE ch.status = 'allowed'
           AND ch.checked_in_at >= NOW() - ($1::int * INTERVAL '1 minute')
         ORDER BY ch.client_id, ch.checked_in_at DESC, ch.id DESC
       ),
       today_hourly AS (
         SELECT
           hours.hour_of_day,
           COALESCE(COUNT(ch.id) FILTER (WHERE ch.status = 'allowed'), 0)::int AS total_checkins
         FROM generate_series(0, 23) AS hours(hour_of_day)
         LEFT JOIN checkins ch
           ON EXTRACT(HOUR FROM ch.checked_in_at) = hours.hour_of_day
           AND ch.checked_in_at::date = CURRENT_DATE
         GROUP BY hours.hour_of_day
       ),
       historical_days AS (
         SELECT generate_series(
           CURRENT_DATE - INTERVAL '28 days',
           CURRENT_DATE - INTERVAL '1 day',
           INTERVAL '1 day'
         )::date AS calendar_day
       ),
       historical_hour_counts AS (
         SELECT
           ch.checked_in_at::date AS calendar_day,
           EXTRACT(HOUR FROM ch.checked_in_at)::int AS hour_of_day,
           COUNT(*)::int AS total_checkins
         FROM checkins ch
         WHERE ch.status = 'allowed'
           AND ch.checked_in_at::date BETWEEN CURRENT_DATE - INTERVAL '28 days' AND CURRENT_DATE - INTERVAL '1 day'
         GROUP BY 1, 2
       ),
       historical_hourly AS (
         SELECT
           hours.hour_of_day,
           COALESCE(ROUND(AVG(COALESCE(historical_hour_counts.total_checkins, 0)), 1), 0)::numeric(10,1) AS average_checkins
         FROM generate_series(0, 23) AS hours(hour_of_day)
         CROSS JOIN historical_days
         LEFT JOIN historical_hour_counts
           ON historical_hour_counts.calendar_day = historical_days.calendar_day
           AND historical_hour_counts.hour_of_day = hours.hour_of_day
         GROUP BY hours.hour_of_day
       ),
       today_peak AS (
         SELECT
           hour_of_day,
           total_checkins
         FROM today_hourly
         ORDER BY total_checkins DESC, hour_of_day DESC
         LIMIT 1
       ),
       historical_peak AS (
         SELECT
           hour_of_day,
           average_checkins
         FROM historical_hourly
         ORDER BY average_checkins DESC, hour_of_day DESC
         LIMIT 1
       )
       SELECT
         COUNT(*) FILTER (WHERE checked_in_at::date = CURRENT_DATE)::int AS total_today,
         COUNT(*) FILTER (WHERE checked_in_at::date = CURRENT_DATE AND status = 'allowed')::int AS allowed_today,
         COUNT(*) FILTER (WHERE checked_in_at::date = CURRENT_DATE AND status = 'denied')::int AS denied_today,
         COALESCE((
           SELECT SUM(p.amount)
           FROM checkins ch2
           INNER JOIN payments p ON p.id = ch2.payment_id
           WHERE ch2.checked_in_at::date = CURRENT_DATE
             AND ch2.access_type = 'daily_pass'
         ), 0)::numeric(12,2) AS daily_pass_income_today,
         COALESCE((SELECT COUNT(*) FROM recent_unique_clients), 0)::int AS current_inside_estimate,
         COALESCE((SELECT ROUND(AVG(allowed_count), 1) FROM daily_counts), 0)::numeric(10,1) AS average_daily_last_7_days,
         (SELECT hour_of_day FROM today_peak)::int AS today_peak_hour,
         (SELECT total_checkins FROM today_peak)::int AS today_peak_checkins,
         (SELECT hour_of_day FROM historical_peak)::int AS historical_peak_hour,
         (SELECT average_checkins FROM historical_peak)::numeric(10,1) AS historical_peak_average_checkins,
         $1::int AS current_inside_window_minutes
       FROM checkins`,
      [CURRENT_OCCUPANCY_WINDOW_MINUTES]
    );

    response.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

attendanceRouter.get('/trends', async (request, response, next) => {
  try {
    const days = Math.min(parsePositiveInteger(request.query.days) || 7, 30);

    const dailySeriesResult = await query(
      `WITH day_series AS (
         SELECT generate_series(
           CURRENT_DATE - (($1::int - 1) * INTERVAL '1 day'),
           CURRENT_DATE,
           INTERVAL '1 day'
         )::date AS calendar_day
       )
       SELECT
         day_series.calendar_day,
         COALESCE(COUNT(ch.id) FILTER (WHERE ch.status = 'allowed'), 0)::int AS total_checkins
       FROM day_series
       LEFT JOIN checkins ch
         ON ch.checked_in_at::date = day_series.calendar_day
       GROUP BY day_series.calendar_day
       ORDER BY day_series.calendar_day ASC`,
      [days]
    );

    const previousDailySeriesResult = await query(
      `WITH day_series AS (
         SELECT generate_series(
           CURRENT_DATE - (($1::int * 2) * INTERVAL '1 day') + INTERVAL '1 day',
           CURRENT_DATE - ($1::int * INTERVAL '1 day'),
           INTERVAL '1 day'
         )::date AS calendar_day
       )
       SELECT
         day_series.calendar_day,
         COALESCE(COUNT(ch.id) FILTER (WHERE ch.status = 'allowed'), 0)::int AS total_checkins
       FROM day_series
       LEFT JOIN checkins ch
         ON ch.checked_in_at::date = day_series.calendar_day
       GROUP BY day_series.calendar_day
       ORDER BY day_series.calendar_day ASC`,
      [days]
    );

    const hourlySeriesResult = await query(
      `WITH hour_series AS (
         SELECT generate_series(0, 23) AS hour_of_day
       ),
       historical_days AS (
         SELECT generate_series(
           CURRENT_DATE - INTERVAL '28 days',
           CURRENT_DATE - INTERVAL '1 day',
           INTERVAL '1 day'
         )::date AS calendar_day
       ),
       historical_hour_counts AS (
         SELECT
           ch.checked_in_at::date AS calendar_day,
           EXTRACT(HOUR FROM ch.checked_in_at)::int AS hour_of_day,
           COUNT(*)::int AS total_checkins
         FROM checkins ch
         WHERE ch.status = 'allowed'
           AND ch.checked_in_at::date BETWEEN CURRENT_DATE - INTERVAL '28 days' AND CURRENT_DATE - INTERVAL '1 day'
         GROUP BY 1, 2
       )
       SELECT
         hour_series.hour_of_day,
         COALESCE(COUNT(ch.id) FILTER (WHERE ch.status = 'allowed' AND ch.checked_in_at::date = CURRENT_DATE), 0)::int AS total_checkins,
         COALESCE(COUNT(ch.id) FILTER (WHERE ch.status = 'allowed' AND ch.checked_in_at::date = CURRENT_DATE - INTERVAL '1 day'), 0)::int AS yesterday_checkins,
         COALESCE((
           SELECT ROUND(AVG(COALESCE(historical_hour_counts.total_checkins, 0)), 1)
           FROM historical_days
           LEFT JOIN historical_hour_counts
             ON historical_hour_counts.calendar_day = historical_days.calendar_day
             AND historical_hour_counts.hour_of_day = hour_series.hour_of_day
         ), 0)::numeric(10,1) AS historical_average_checkins
       FROM hour_series
       LEFT JOIN checkins ch
         ON EXTRACT(HOUR FROM ch.checked_in_at) = hour_series.hour_of_day
         AND ch.checked_in_at::date IN (CURRENT_DATE, CURRENT_DATE - INTERVAL '1 day')
       GROUP BY hour_series.hour_of_day
       ORDER BY hour_series.hour_of_day ASC`
    );

    response.json({
      ok: true,
      data: {
        days,
        daily: dailySeriesResult.rows,
        daily_previous: previousDailySeriesResult.rows,
        hourly_today: hourlySeriesResult.rows.map((row) => ({
          hour_of_day: row.hour_of_day,
          total_checkins: row.total_checkins
        })),
        hourly_yesterday: hourlySeriesResult.rows.map((row) => ({
          hour_of_day: row.hour_of_day,
          total_checkins: row.yesterday_checkins
        })),
        hourly_historical_average: hourlySeriesResult.rows.map((row) => ({
          hour_of_day: row.hour_of_day,
          total_checkins: row.historical_average_checkins
        }))
      }
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

    const result = await processAttendanceCheckin({
      clientId,
      checkedInByUserId,
      accessType,
      paymentMethod,
      dailyPassAmount: request.body.daily_pass_amount,
      notes
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

attendanceRouter.post('/checkins/by-code', async (request, response, next) => {
  try {
    const clientCode = String(request.body.client_code || '').trim();
    const checkedInByUserId = parsePositiveInteger(request.body.checked_in_by_user_id);
    const accessType = String(request.body.access_type || 'membership').trim();
    const paymentMethod = String(request.body.payment_method || 'cash').trim();
    const notes = String(request.body.notes || '').trim() || null;

    if (!clientCode) {
      throw createHttpError(400, 'client_code is required');
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

    const client = await resolveClientByCode(clientCode);
    const result = await processAttendanceCheckin({
      clientId: client.id,
      checkedInByUserId,
      accessType,
      paymentMethod,
      dailyPassAmount: request.body.daily_pass_amount,
      notes
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
