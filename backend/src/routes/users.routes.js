import { Router } from 'express';
import { query } from '../config/db.js';
import { hashPassword } from '../lib/auth.js';
import { createHttpError, createPaginationMeta, parsePaginationParams, parsePositiveInteger } from '../utils/http.js';
import { validateCreateUserPayload, validateUpdateUserPayload, mapUserPostgresError } from '../utils/users.js';

const usersRouter = Router();

const baseUserSelect = `
  SELECT
    u.id,
    u.role_id,
    r.name AS role_name,
    u.first_name,
    u.last_name,
    u.email,
    u.username,
    u.phone,
    u.is_active,
    u.created_at,
    u.updated_at
  FROM users u
  INNER JOIN roles r ON r.id = u.role_id
`;

usersRouter.get('/', async (request, response, next) => {
  try {
    const search = String(request.query.search || '').trim();
    const activeFilter = String(request.query.active || '').trim();
    const { page, limit, offset } = parsePaginationParams(request.query, {
      defaultLimit: 10,
      maxLimit: 100
    });

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.username ILIKE $${params.length} OR COALESCE(u.phone, '') ILIKE $${params.length} OR r.name ILIKE $${params.length})`
      );
    }

    if (activeFilter === 'true' || activeFilter === 'false') {
      params.push(activeFilter === 'true');
      conditions.push(`u.is_active = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       ${whereClause}`,
      params
    );

    const totalItems = countResult.rows[0]?.total || 0;
    const dataParams = [...params, limit, offset];

    const result = await query(
      `${baseUserSelect}
       ${whereClause}
       ORDER BY u.id DESC
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

usersRouter.post('/', async (request, response, next) => {
  try {
    const payload = validateCreateUserPayload(request.body);
    const passwordHash = await hashPassword(payload.password);

    const result = await query(
      `INSERT INTO users (
         role_id,
         first_name,
         last_name,
         email,
         username,
         password_hash,
         phone,
         is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, role_id, first_name, last_name, email, username, phone, is_active, created_at, updated_at`,
      [
        payload.role_id,
        payload.first_name,
        payload.last_name,
        payload.email,
        payload.username,
        passwordHash,
        payload.phone,
        payload.is_active
      ]
    );

    response.status(201).json({
      ok: true,
      message: 'User created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    try {
      mapUserPostgresError(error);
    } catch (mappedError) {
      next(mappedError);
      return;
    }
    next(error);
  }
});

usersRouter.put('/:id', async (request, response, next) => {
  try {
    const userId = parsePositiveInteger(request.params.id);

    if (!userId) {
      throw createHttpError(400, 'User id must be a positive integer');
    }

    const updates = validateUpdateUserPayload(request.body);
    const keys = Object.keys(updates);
    const values = await Promise.all(
      keys.map(async (key) => {
        if (key === 'password') {
          return hashPassword(updates.password);
        }

        return updates[key];
      })
    );

    const setClauses = keys.map((key, index) => {
      if (key === 'password') {
        return `password_hash = $${index + 1}`;
      }
      return `${key} = $${index + 1}`;
    });

    const result = await query(
      `UPDATE users
       SET ${setClauses.join(', ')}
       WHERE id = $${keys.length + 1}
       RETURNING id, role_id, first_name, last_name, email, username, phone, is_active, created_at, updated_at`,
      [...values, userId]
    );

    if (result.rowCount === 0) {
      throw createHttpError(404, 'User not found');
    }

    response.json({
      ok: true,
      message: 'User updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    try {
      mapUserPostgresError(error);
    } catch (mappedError) {
      next(mappedError);
      return;
    }
    next(error);
  }
});

export { usersRouter };
