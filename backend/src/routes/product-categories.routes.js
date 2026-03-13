import { Router } from 'express';
import { query } from '../config/db.js';
import { createHttpError, parsePositiveInteger } from '../utils/http.js';
import {
  validateCreateCategoryPayload,
  validateUpdateCategoryPayload
} from '../utils/pos.js';

const productCategoriesRouter = Router();

function mapPostgresError(error) {
  if (error.code === '23505') {
    throw createHttpError(409, 'A product category with the same name already exists');
  }

  throw error;
}

productCategoriesRouter.get('/', async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT id, name, description, is_active, created_at, updated_at
       FROM product_categories
       ORDER BY name ASC`
    );

    response.json({ ok: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    next(error);
  }
});

productCategoriesRouter.post('/', async (request, response, next) => {
  try {
    const payload = validateCreateCategoryPayload(request.body);
    const result = await query(
      `INSERT INTO product_categories (name, description, is_active)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, is_active, created_at`,
      [payload.name, payload.description, payload.is_active]
    );

    response.status(201).json({
      ok: true,
      message: 'Product category created successfully',
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

productCategoriesRouter.put('/:id', async (request, response, next) => {
  try {
    const categoryId = parsePositiveInteger(request.params.id);

    if (!categoryId) {
      throw createHttpError(400, 'Category id must be a positive integer');
    }

    const updates = validateUpdateCategoryPayload(request.body);
    const keys = Object.keys(updates);
    const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);
    const values = keys.map((key) => updates[key]);

    const result = await query(
      `UPDATE product_categories
       SET ${setClauses.join(', ')}
       WHERE id = $${keys.length + 1}
       RETURNING id, name, description, is_active, updated_at`,
      [...values, categoryId]
    );

    if (result.rowCount === 0) {
      throw createHttpError(404, 'Product category not found');
    }

    response.json({
      ok: true,
      message: 'Product category updated successfully',
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

export { productCategoriesRouter };
