import { Router } from 'express';
import { query } from '../config/db.js';
import { validateCreateClientPayload, validateUpdateClientPayload } from '../utils/clients.js';
import {
  createHttpError,
  createPaginationMeta,
  parsePaginationParams,
  parsePositiveInteger
} from '../utils/http.js';

const clientsRouter = Router();

const baseClientSelect = `
  SELECT
    id,
    client_code,
    first_name,
    last_name,
    email,
    phone,
    birth_date,
    gender,
    address,
    emergency_contact_name,
    emergency_contact_phone,
    photo_url,
    join_date,
    notes,
    is_active,
    created_at,
    updated_at
  FROM clients
`;

function mapPostgresError(error) {
  if (error.code === '23505') {
    throw createHttpError(409, 'A client with the same unique value already exists');
  }

  throw error;
}

clientsRouter.get('/', async (request, response, next) => {
  try {
    const search = String(request.query.search || '').trim();
    const activeFilter = String(request.query.active || '').trim();
    const { page, limit, offset } = parsePaginationParams(request.query, {
      defaultLimit: 8,
      maxLimit: 100
    });

    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(client_code ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR COALESCE(email, '') ILIKE $${params.length} OR COALESCE(phone, '') ILIKE $${params.length})`
      );
    }

    if (activeFilter === 'true' || activeFilter === 'false') {
      params.push(activeFilter === 'true');
      conditions.push(`is_active = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM clients
       ${whereClause}`,
      params
    );

    const totalItems = countResult.rows[0]?.total || 0;
    const dataParams = [...params, limit, offset];

    const result = await query(
      `${baseClientSelect}
       ${whereClause}
       ORDER BY id DESC
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

clientsRouter.get('/summary', async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*)::int AS total_clients,
         COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_clients,
         COUNT(*) FILTER (WHERE is_active = FALSE)::int AS inactive_clients
       FROM clients`
    );

    response.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

clientsRouter.get('/:id', async (request, response, next) => {
  try {
    const clientId = parsePositiveInteger(request.params.id);

    if (!clientId) {
      throw createHttpError(400, 'Client id must be a positive integer');
    }

    const result = await query(`${baseClientSelect} WHERE id = $1`, [clientId]);

    if (result.rowCount === 0) {
      throw createHttpError(404, 'Client not found');
    }

    response.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

clientsRouter.post('/', async (request, response, next) => {
  try {
    const payload = validateCreateClientPayload(request.body);

    const result = await query(
      `INSERT INTO clients (
         client_code,
         first_name,
         last_name,
         email,
         phone,
         birth_date,
         gender,
         address,
         emergency_contact_name,
         emergency_contact_phone,
         photo_url,
         join_date,
         notes,
         is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, CURRENT_DATE), $13, $14)
       RETURNING id, client_code, first_name, last_name, email, phone, is_active, join_date, created_at`,
      [
        payload.client_code,
        payload.first_name,
        payload.last_name,
        payload.email,
        payload.phone,
        payload.birth_date,
        payload.gender,
        payload.address,
        payload.emergency_contact_name,
        payload.emergency_contact_phone,
        payload.photo_url,
        payload.join_date,
        payload.notes,
        payload.is_active
      ]
    );

    response.status(201).json({
      ok: true,
      message: 'Client created successfully',
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

clientsRouter.put('/:id', async (request, response, next) => {
  try {
    const clientId = parsePositiveInteger(request.params.id);

    if (!clientId) {
      throw createHttpError(400, 'Client id must be a positive integer');
    }

    const updates = validateUpdateClientPayload(request.body);
    const keys = Object.keys(updates);

    const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);
    const values = keys.map((key) => updates[key]);

    const result = await query(
      `UPDATE clients
       SET ${setClauses.join(', ')}
       WHERE id = $${keys.length + 1}
       RETURNING id, client_code, first_name, last_name, email, phone, is_active, join_date, updated_at`,
      [...values, clientId]
    );

    if (result.rowCount === 0) {
      throw createHttpError(404, 'Client not found');
    }

    response.json({
      ok: true,
      message: 'Client updated successfully',
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

export { clientsRouter };
