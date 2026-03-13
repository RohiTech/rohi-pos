import { createHttpError } from './http.js';

const ALLOWED_STATUSES = new Set(['pending', 'active', 'expired', 'cancelled']);

function normalizeNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
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

function normalizeDate(value, fieldName, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw createHttpError(400, `${fieldName} is required`);
    }

    return null;
  }

  const normalized = String(value).trim();
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid date`);
  }

  return normalized;
}

function normalizeStatus(value, defaultValue = 'pending') {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = normalizeNullableString(value);
  if (!normalized || !ALLOWED_STATUSES.has(normalized)) {
    throw createHttpError(400, 'status is invalid');
  }

  return normalized;
}

export function inferMembershipStatus(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (end < today) {
    return 'expired';
  }

  if (start > today) {
    return 'pending';
  }

  return 'active';
}

export function addDaysToDate(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function validateCreateMembershipPayload(payload) {
  const startDate = normalizeDate(payload.start_date, 'start_date', true);
  const endDate = normalizeDate(payload.end_date, 'end_date', false);

  if (endDate && new Date(endDate) < new Date(startDate)) {
    throw createHttpError(400, 'end_date must be greater than or equal to start_date');
  }

  const normalizedPrice = normalizeNonNegativeDecimal(payload.price, 'price', false);
  const discount = normalizeNonNegativeDecimal(payload.discount, 'discount', false) ?? 0;
  const amountPaid = normalizeNonNegativeDecimal(payload.amount_paid, 'amount_paid', false) ?? 0;

  if (normalizedPrice !== null && amountPaid > normalizedPrice - discount) {
    throw createHttpError(400, 'amount_paid cannot be greater than the total due');
  }

  const status = endDate
    ? normalizeStatus(payload.status, inferMembershipStatus(startDate, endDate))
    : normalizeStatus(payload.status, 'pending');

  return {
    client_id: normalizePositiveInteger(payload.client_id, 'client_id', true),
    plan_id: normalizePositiveInteger(payload.plan_id, 'plan_id', true),
    sold_by_user_id: normalizePositiveInteger(payload.sold_by_user_id, 'sold_by_user_id', false),
    membership_number: normalizeNullableString(payload.membership_number),
    start_date: startDate,
    end_date: endDate,
    status,
    price: normalizedPrice,
    discount,
    amount_paid: amountPaid,
    notes: normalizeNullableString(payload.notes)
  };
}

export function validateUpdateMembershipPayload(payload) {
  const updates = {};

  if ('start_date' in payload) {
    updates.start_date = normalizeDate(payload.start_date, 'start_date', true);
  }

  if ('end_date' in payload) {
    updates.end_date = normalizeDate(payload.end_date, 'end_date', true);
  }

  const nextStart = updates.start_date ?? null;
  const nextEnd = updates.end_date ?? null;
  if (nextStart && nextEnd && new Date(nextEnd) < new Date(nextStart)) {
    throw createHttpError(400, 'end_date must be greater than or equal to start_date');
  }

  if ('status' in payload) {
    updates.status = normalizeStatus(payload.status, 'pending');
  }

  if ('price' in payload) {
    updates.price = normalizeNonNegativeDecimal(payload.price, 'price', true);
  }

  if ('discount' in payload) {
    updates.discount = normalizeNonNegativeDecimal(payload.discount, 'discount', true);
  }

  if ('amount_paid' in payload) {
    updates.amount_paid = normalizeNonNegativeDecimal(payload.amount_paid, 'amount_paid', true);
  }

  if ('sold_by_user_id' in payload) {
    updates.sold_by_user_id = normalizePositiveInteger(payload.sold_by_user_id, 'sold_by_user_id');
  }

  if ('notes' in payload) {
    updates.notes = normalizeNullableString(payload.notes);
  }

  if ('membership_number' in payload) {
    updates.membership_number = normalizeNullableString(payload.membership_number);
    if (!updates.membership_number) {
      throw createHttpError(400, 'membership_number cannot be empty');
    }
  }

  if (Object.keys(updates).length === 0) {
    throw createHttpError(400, 'At least one field is required to update the membership');
  }

  return updates;
}
