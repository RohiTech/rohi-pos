import { Router } from 'express';
import multer from 'multer';
import { query, withTransaction } from '../config/db.js';
import { buildProductImageDataUrl, optimizeProductImage } from '../lib/product-images.js';
import {
  createHttpError,
  createPaginationMeta,
  parsePaginationParams,
  parsePositiveInteger
} from '../utils/http.js';
import {
  validateCreateProductPayload,
  validateInventoryAdjustmentPayload,
  validateUpdateProductPayload
} from '../utils/pos.js';

const productsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const baseProductSelect = `
  SELECT
    p.id,
    p.category_id,
    pc.name AS category_name,
    p.sku,
    p.name,
    p.description,
    p.sale_price,
    p.cost_price,
    p.tax_name,
    p.tax_rate,
    p.stock_quantity,
    p.minimum_stock,
    p.unit_label,
    p.barcode,
    p.image_blob,
    p.image_mime_type,
    p.image_size_bytes,
    p.is_active,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN product_categories pc ON pc.id = p.category_id
`;

function mapProductRow(row) {
  const image_data_url = buildProductImageDataUrl(row);

  return {
    ...row,
    has_image: Boolean(row.image_blob),
    image_data_url,
    image_blob: undefined
  };
}

function mapPostgresError(error) {
  if (error.code === '23505') {
    throw createHttpError(409, 'A product with the same unique value already exists');
  }

  if (error.code === '23503') {
    throw createHttpError(400, 'The selected category does not exist');
  }

  throw error;
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

productsRouter.get('/', async (request, response, next) => {
  try {
    const search = String(request.query.search || '').trim();
    const lowStock = request.query.low_stock === 'true';
    const onlyActive = request.query.active === 'true';
    const categoryId = parsePositiveInteger(request.query.category_id);
    const { page, limit, offset } = parsePaginationParams(request.query, {
      defaultLimit: 10,
      maxLimit: 100
    });
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(p.sku ILIKE $${params.length} OR p.name ILIKE $${params.length} OR COALESCE(p.barcode, '') ILIKE $${params.length} OR COALESCE(pc.name, '') ILIKE $${params.length})`
      );
    }

    if (lowStock) {
      conditions.push('p.stock_quantity <= p.minimum_stock');
    }

    if (onlyActive) {
      conditions.push('p.is_active = TRUE');
    }

    if (categoryId) {
      params.push(categoryId);
      conditions.push(`p.category_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       ${whereClause}`,
      params
    );

    const totalItems = countResult.rows[0]?.total || 0;
    const dataParams = [...params, limit, offset];

    const result = await query(
      `${baseProductSelect}
       ${whereClause}
       ORDER BY p.name ASC
       LIMIT $${dataParams.length - 1}
       OFFSET $${dataParams.length}`,
      dataParams
    );

    response.json({
      ok: true,
      count: result.rowCount,
      data: result.rows.map(mapProductRow),
      pagination: createPaginationMeta(totalItems, page, limit)
    });
  } catch (error) {
    next(error);
  }
});

productsRouter.get('/summary', async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*)::int AS total_products,
         COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_products,
         COUNT(*) FILTER (WHERE stock_quantity <= minimum_stock)::int AS low_stock_products,
         COALESCE(SUM(stock_quantity * cost_price), 0)::numeric(12,2) AS estimated_inventory_cost
       FROM products`
    );

    response.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

productsRouter.get('/:id', async (request, response, next) => {
  try {
    const productId = parsePositiveInteger(request.params.id);

    if (!productId) {
      throw createHttpError(400, 'Product id must be a positive integer');
    }

    const result = await query(`${baseProductSelect} WHERE p.id = $1`, [productId]);

    if (result.rowCount === 0) {
      throw createHttpError(404, 'Product not found');
    }

    response.json({ ok: true, data: mapProductRow(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

productsRouter.post('/', upload.single('image'), async (request, response, next) => {
  try {
    const payload = validateCreateProductPayload(request.body);
    const optimizedImage = await optimizeProductImage(request.file);

    const result = await query(
      `INSERT INTO products (
         category_id, sku, name, description, sale_price, cost_price, tax_name, tax_rate, stock_quantity,
         minimum_stock, unit_label, barcode, image_blob, image_mime_type, image_size_bytes, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, sku, name, sale_price, cost_price, tax_name, tax_rate, stock_quantity, image_blob, image_mime_type, image_size_bytes, created_at`,
      [
        payload.category_id,
        payload.sku,
        payload.name,
        payload.description,
        payload.sale_price,
        payload.cost_price,
        payload.tax_name,
        payload.tax_rate,
        payload.stock_quantity,
        payload.minimum_stock,
        payload.unit_label,
        payload.barcode,
        optimizedImage?.image_blob ?? null,
        optimizedImage?.image_mime_type ?? null,
        optimizedImage?.image_size_bytes ?? null,
        payload.is_active
      ]
    );

    response.status(201).json({
      ok: true,
      message: 'Product created successfully',
      data: mapProductRow(result.rows[0])
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

productsRouter.put('/:id', upload.single('image'), async (request, response, next) => {
  try {
    const productId = parsePositiveInteger(request.params.id);

    if (!productId) {
      throw createHttpError(400, 'Product id must be a positive integer');
    }

    const updates = validateUpdateProductPayload(request.body);
    const optimizedImage = await optimizeProductImage(request.file);

    if (optimizedImage) {
      updates.image_blob = optimizedImage.image_blob;
      updates.image_mime_type = optimizedImage.image_mime_type;
      updates.image_size_bytes = optimizedImage.image_size_bytes;
    }

    if (request.body.remove_image === 'true') {
      updates.image_blob = null;
      updates.image_mime_type = null;
      updates.image_size_bytes = null;
    }

    const keys = Object.keys(updates);
    const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);
    const values = keys.map((key) => updates[key]);

    const result = await query(
      `UPDATE products
       SET ${setClauses.join(', ')}
       WHERE id = $${keys.length + 1}
       RETURNING id, sku, name, sale_price, cost_price, tax_name, tax_rate, stock_quantity, image_blob, image_mime_type, image_size_bytes, updated_at`,
      [...values, productId]
    );

    if (result.rowCount === 0) {
      throw createHttpError(404, 'Product not found');
    }

    response.json({
      ok: true,
      message: 'Product updated successfully',
      data: mapProductRow(result.rows[0])
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

productsRouter.post('/inventory-adjustments', async (request, response, next) => {
  try {
    const payload = validateInventoryAdjustmentPayload(request.body);
    await ensureUserExists(payload.user_id);

    const result = await withTransaction(async (dbClient) => {
      const productResult = await dbClient.query(
        `SELECT id, name, stock_quantity FROM products WHERE id = $1 FOR UPDATE`,
        [payload.product_id]
      );

      if (productResult.rowCount === 0) {
        throw createHttpError(404, 'Product not found');
      }

      const product = productResult.rows[0];
      const previousStock = Number(product.stock_quantity);
      const direction = ['purchase', 'adjustment_in', 'return'].includes(payload.movement_type)
        ? 1
        : -1;
      const newStock = previousStock + direction * payload.quantity;

      if (newStock < 0) {
        throw createHttpError(400, 'The adjustment would leave the product with negative stock');
      }

      await dbClient.query(
        'UPDATE products SET stock_quantity = $1 WHERE id = $2',
        [newStock, payload.product_id]
      );

      const movementResult = await dbClient.query(
        `INSERT INTO inventory_movements (
           product_id, user_id, movement_type, quantity, previous_stock, new_stock, unit_cost, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, product_id, movement_type, quantity, previous_stock, new_stock, moved_at`,
        [
          payload.product_id,
          payload.user_id,
          payload.movement_type,
          payload.quantity,
          previousStock,
          newStock,
          payload.unit_cost,
          payload.notes
        ]
      );

      return movementResult.rows[0];
    });

    response.status(201).json({
      ok: true,
      message: 'Inventory movement registered successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

productsRouter.get('/:id/inventory-movements', async (request, response, next) => {
  try {
    const productId = parsePositiveInteger(request.params.id);
    const search = String(request.query.search || '').trim();
    const { page, limit, offset } = parsePaginationParams(request.query, {
      defaultLimit: 8,
      maxLimit: 100
    });

    if (!productId) {
      throw createHttpError(400, 'Product id must be a positive integer');
    }

    const params = [productId];
    let searchClause = '';

    if (search) {
      params.push(`%${search}%`);
      searchClause = `
        AND (
          movement_type ILIKE $${params.length}
          OR COALESCE(reference_type, '') ILIKE $${params.length}
          OR COALESCE(notes, '') ILIKE $${params.length}
          OR CAST(quantity AS TEXT) ILIKE $${params.length}
        )
      `;
    }

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM inventory_movements
       WHERE product_id = $1
       ${searchClause}`,
      params
    );

    const totalItems = countResult.rows[0]?.total || 0;
    const dataParams = [...params, limit, offset];

    const result = await query(
      `SELECT id, movement_type, quantity, previous_stock, new_stock, unit_cost, reference_type, reference_id, notes, moved_at
       FROM inventory_movements
       WHERE product_id = $1
       ${searchClause}
       ORDER BY moved_at DESC, id DESC
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

export { productsRouter };
