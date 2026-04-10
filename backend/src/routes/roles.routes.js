import { Router } from 'express';
import { query } from '../config/db.js';
import { createHttpError } from '../utils/http.js';

const rolesRouter = Router();

rolesRouter.get('/', async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT id, name, description, created_at, updated_at
       FROM roles
       ORDER BY id ASC`
    );

    response.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

rolesRouter.get('/:id', async (request, response, next) => {
  try {
    const roleId = Number(request.params.id);

    if (!Number.isInteger(roleId) || roleId <= 0) {
      throw createHttpError(400, 'Role id must be a positive integer');
    }

    const result = await query(
      `SELECT id, name, description, created_at, updated_at
       FROM roles
       WHERE id = $1`,
      [roleId]
    );

    if (result.rowCount === 0) {
      throw createHttpError(404, 'Role not found');
    }

    response.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

export { rolesRouter };
