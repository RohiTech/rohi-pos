import { createHttpError } from './http.js';

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

  throw createHttpError(400, 'is_active must be a boolean value');
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

function normalizeNonNegativeDecimal(value, fieldName, required = false) {
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

function normalizeTaxName(value, required = false) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    if (required) {
      throw createHttpError(400, 'tax_name is required');
    }
    return null;
  }

  return normalized;
}

function normalizeTaxRate(value, required = false) {
  const parsed = normalizeNonNegativeDecimal(value, 'tax_rate', required);
  if (parsed === null) {
    return null;
  }

  if (parsed > 100) {
    throw createHttpError(400, 'tax_rate must be between 0 and 100');
  }

  return parsed;
}

export function validateCreateMembershipPlanPayload(payload) {
  const name = normalizeNullableString(payload.name);

  if (!name) {
    throw createHttpError(400, 'name is required');
  }

  return {
    name,
    description: normalizeNullableString(payload.description),
    duration_days: normalizePositiveInteger(payload.duration_days, 'duration_days', true),
    base_price: normalizeNonNegativeDecimal(payload.base_price, 'base_price', true),
    tax_name: normalizeTaxName(payload.tax_name, true),
    tax_rate: normalizeTaxRate(payload.tax_rate, true),
    price: normalizeNonNegativeDecimal(payload.price, 'price', true),
    allows_multiple_checkins_per_day: normalizeBoolean(
      payload.allows_multiple_checkins_per_day,
      true
    ),
    is_active: normalizeBoolean(payload.is_active, true)
  };
}

export function validateUpdateMembershipPlanPayload(payload) {
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

  if ('duration_days' in payload) {
    updates.duration_days = normalizePositiveInteger(payload.duration_days, 'duration_days', true);
  }

  if ('price' in payload) {
    updates.price = normalizeNonNegativeDecimal(payload.price, 'price', true);
  }

  if ('base_price' in payload) {
    updates.base_price = normalizeNonNegativeDecimal(payload.base_price, 'base_price', true);
  }

  if ('tax_name' in payload) {
    updates.tax_name = normalizeTaxName(payload.tax_name, true);
  }

  if ('tax_rate' in payload) {
    updates.tax_rate = normalizeTaxRate(payload.tax_rate, true);
  }

  if ('allows_multiple_checkins_per_day' in payload) {
    updates.allows_multiple_checkins_per_day = normalizeBoolean(
      payload.allows_multiple_checkins_per_day,
      true
    );
  }

  if ('is_active' in payload) {
    updates.is_active = normalizeBoolean(payload.is_active, true);
  }

  if (Object.keys(updates).length === 0) {
    throw createHttpError(400, 'At least one field is required to update the plan');
  }

  return updates;
}
