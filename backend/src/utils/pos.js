import { createHttpError } from './http.js';

const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'card', 'transfer', 'mobile', 'other']);
const ALLOWED_MOVEMENT_TYPES = new Set([
  'purchase',
  'sale',
  'adjustment_in',
  'adjustment_out',
  'return'
]);

function normalizeNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function normalizeBoolean(value, defaultValue = true) {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw createHttpError(400, 'Boolean field is invalid');
}

function normalizePositiveInteger(value, fieldName, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw createHttpError(400, `${fieldName} is required`);
    }

    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function normalizePositiveNumber(value, fieldName, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw createHttpError(400, `${fieldName} is required`);
    }

    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} must be a positive number`);
  }

  return parsed;
}

function normalizeNonNegativeNumber(value, fieldName, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw createHttpError(400, `${fieldName} is required`);
    }

    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw createHttpError(400, `${fieldName} must be a non-negative number`);
  }

  return parsed;
}

export function validateCreateCategoryPayload(payload) {
  const name = normalizeNullableString(payload.name);

  if (!name) {
    throw createHttpError(400, 'name is required');
  }

  return {
    name,
    description: normalizeNullableString(payload.description),
    is_active: normalizeBoolean(payload.is_active, true)
  };
}

export function validateUpdateCategoryPayload(payload) {
  const updates = {};

  if ('name' in payload) {
    updates.name = normalizeNullableString(payload.name);
    if (!updates.name) {
      throw createHttpError(400, 'name cannot be empty');
    }
  }

  if ('description' in payload) {
    updates.description = normalizeNullableString(payload.description);
  }

  if ('is_active' in payload) {
    updates.is_active = normalizeBoolean(payload.is_active, true);
  }

  if (Object.keys(updates).length === 0) {
    throw createHttpError(400, 'At least one field is required to update the category');
  }

  return updates;
}

export function validateCreateProductPayload(payload) {
  const sku = normalizeNullableString(payload.sku);
  const name = normalizeNullableString(payload.name);

  if (!sku) {
    throw createHttpError(400, 'sku is required');
  }

  if (!name) {
    throw createHttpError(400, 'name is required');
  }

  return {
    category_id: normalizePositiveInteger(payload.category_id, 'category_id'),
    sku,
    name,
    description: normalizeNullableString(payload.description),
    sale_price: normalizeNonNegativeNumber(payload.sale_price, 'sale_price', true),
    cost_price: normalizeNonNegativeNumber(payload.cost_price, 'cost_price', false) ?? 0,
    stock_quantity: normalizeNonNegativeNumber(payload.stock_quantity, 'stock_quantity', false) ?? 0,
    minimum_stock: normalizeNonNegativeNumber(payload.minimum_stock, 'minimum_stock', false) ?? 0,
    unit_label: normalizeNullableString(payload.unit_label) || 'unit',
    barcode: normalizeNullableString(payload.barcode),
    image_url: normalizeNullableString(payload.image_url),
    is_active: normalizeBoolean(payload.is_active, true)
  };
}

export function validateUpdateProductPayload(payload) {
  const updates = {};
  const textFields = ['sku', 'name', 'description', 'unit_label', 'barcode', 'image_url'];

  for (const field of textFields) {
    if (field in payload) {
      updates[field] = normalizeNullableString(payload[field]);
    }
  }

  if ('sku' in updates && !updates.sku) {
    throw createHttpError(400, 'sku cannot be empty');
  }

  if ('name' in updates && !updates.name) {
    throw createHttpError(400, 'name cannot be empty');
  }

  if ('category_id' in payload) {
    updates.category_id = normalizePositiveInteger(payload.category_id, 'category_id');
  }

  if ('sale_price' in payload) {
    updates.sale_price = normalizeNonNegativeNumber(payload.sale_price, 'sale_price', true);
  }

  if ('cost_price' in payload) {
    updates.cost_price = normalizeNonNegativeNumber(payload.cost_price, 'cost_price', true);
  }

  if ('stock_quantity' in payload) {
    updates.stock_quantity = normalizeNonNegativeNumber(payload.stock_quantity, 'stock_quantity', true);
  }

  if ('minimum_stock' in payload) {
    updates.minimum_stock = normalizeNonNegativeNumber(payload.minimum_stock, 'minimum_stock', true);
  }

  if ('is_active' in payload) {
    updates.is_active = normalizeBoolean(payload.is_active, true);
  }

  if (Object.keys(updates).length === 0) {
    throw createHttpError(400, 'At least one field is required to update the product');
  }

  return updates;
}

export function validateInventoryAdjustmentPayload(payload) {
  const productId = normalizePositiveInteger(payload.product_id, 'product_id', true);
  const quantity = normalizePositiveNumber(payload.quantity, 'quantity', true);
  const movementType = normalizeNullableString(payload.movement_type);

  if (!movementType || !ALLOWED_MOVEMENT_TYPES.has(movementType)) {
    throw createHttpError(400, 'movement_type is invalid');
  }

  if (!['purchase', 'adjustment_in', 'adjustment_out', 'return'].includes(movementType)) {
    throw createHttpError(400, 'movement_type is not allowed for manual inventory adjustments');
  }

  return {
    product_id: productId,
    user_id: normalizePositiveInteger(payload.user_id, 'user_id'),
    quantity,
    movement_type: movementType,
    unit_cost: normalizeNonNegativeNumber(payload.unit_cost, 'unit_cost', false),
    notes: normalizeNullableString(payload.notes)
  };
}

export function validateCreateSalePayload(payload) {
  const cashierUserId = normalizePositiveInteger(payload.cashier_user_id, 'cashier_user_id', true);
  const clientId = normalizePositiveInteger(payload.client_id, 'client_id');
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (items.length === 0) {
    throw createHttpError(400, 'items must contain at least one product');
  }

  const normalizedItems = items.map((item, index) => {
    const productId = normalizePositiveInteger(item.product_id, `items[${index}].product_id`, true);
    const quantity = normalizePositiveNumber(item.quantity, `items[${index}].quantity`, true);
    const discount = normalizeNonNegativeNumber(item.discount, `items[${index}].discount`, false) ?? 0;

    return {
      product_id: productId,
      quantity,
      discount,
      description: normalizeNullableString(item.description)
    };
  });

  const paymentMethod = normalizeNullableString(payload.payment_method) || 'cash';
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    throw createHttpError(400, 'payment_method is invalid');
  }

  return {
    client_id: clientId,
    cashier_user_id: cashierUserId,
    cash_register_session_id: normalizePositiveInteger(
      payload.cash_register_session_id,
      'cash_register_session_id'
    ),
    payment_method: paymentMethod,
    tax: normalizeNonNegativeNumber(payload.tax, 'tax', false) ?? 0,
    discount: normalizeNonNegativeNumber(payload.discount, 'discount', false) ?? 0,
    notes: normalizeNullableString(payload.notes),
    items: normalizedItems
  };
}
