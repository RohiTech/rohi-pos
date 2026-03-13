import { createHttpError } from './http.js';

const ALLOWED_GENDERS = new Set(['male', 'female', 'other', 'prefer_not_to_say']);

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

function validateDate(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = normalizeNullableString(value);
  if (normalized === null) {
    return null;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid date`);
  }

  return normalized;
}

export function validateCreateClientPayload(payload) {
  const clientCode = normalizeNullableString(payload.client_code);
  const firstName = normalizeNullableString(payload.first_name);
  const lastName = normalizeNullableString(payload.last_name);

  if (!clientCode) {
    throw createHttpError(400, 'client_code is required');
  }

  if (!firstName) {
    throw createHttpError(400, 'first_name is required');
  }

  if (!lastName) {
    throw createHttpError(400, 'last_name is required');
  }

  const gender = normalizeNullableString(payload.gender);
  if (gender && !ALLOWED_GENDERS.has(gender)) {
    throw createHttpError(400, 'gender is invalid');
  }

  return {
    client_code: clientCode,
    first_name: firstName,
    last_name: lastName,
    email: normalizeNullableString(payload.email),
    phone: normalizeNullableString(payload.phone),
    birth_date: validateDate(payload.birth_date, 'birth_date') ?? null,
    gender,
    address: normalizeNullableString(payload.address),
    emergency_contact_name: normalizeNullableString(payload.emergency_contact_name),
    emergency_contact_phone: normalizeNullableString(payload.emergency_contact_phone),
    photo_url: normalizeNullableString(payload.photo_url),
    join_date: validateDate(payload.join_date, 'join_date') ?? null,
    notes: normalizeNullableString(payload.notes),
    is_active: normalizeBoolean(payload.is_active, true)
  };
}

export function validateUpdateClientPayload(payload) {
  const allowedFields = [
    'client_code',
    'first_name',
    'last_name',
    'email',
    'phone',
    'birth_date',
    'gender',
    'address',
    'emergency_contact_name',
    'emergency_contact_phone',
    'photo_url',
    'join_date',
    'notes',
    'is_active'
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (!(field in payload)) {
      continue;
    }

    if (field === 'is_active') {
      updates[field] = normalizeBoolean(payload[field], true);
      continue;
    }

    if (field === 'birth_date' || field === 'join_date') {
      updates[field] = validateDate(payload[field], field) ?? null;
      continue;
    }

    updates[field] = normalizeNullableString(payload[field]);
  }

  if (Object.keys(updates).length === 0) {
    throw createHttpError(400, 'At least one field is required to update the client');
  }

  if ('first_name' in updates && !updates.first_name) {
    throw createHttpError(400, 'first_name cannot be empty');
  }

  if ('last_name' in updates && !updates.last_name) {
    throw createHttpError(400, 'last_name cannot be empty');
  }

  if ('client_code' in updates && !updates.client_code) {
    throw createHttpError(400, 'client_code cannot be empty');
  }

  if ('gender' in updates && updates.gender && !ALLOWED_GENDERS.has(updates.gender)) {
    throw createHttpError(400, 'gender is invalid');
  }

  return updates;
}
