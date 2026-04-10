import { createHttpError } from './http.js';

export function validateCreateUserPayload(payload) {
  const first_name = String(payload.first_name || '').trim();
  const last_name = String(payload.last_name || '').trim();
  const email = String(payload.email || '').trim();
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  const role_id = Number(payload.role_id);
  const phone = payload.phone ? String(payload.phone).trim() : null;
  const is_active = payload.is_active === false ? false : true;

  if (!first_name) {
    throw createHttpError(400, 'first_name is required');
  }

  if (!last_name) {
    throw createHttpError(400, 'last_name is required');
  }

  if (!email) {
    throw createHttpError(400, 'email is required');
  }

  if (!username) {
    throw createHttpError(400, 'username is required');
  }

  if (!password || password.length < 6) {
    throw createHttpError(400, 'password is required and must be at least 6 characters long');
  }

  if (!Number.isInteger(role_id) || role_id <= 0) {
    throw createHttpError(400, 'role_id must be a positive integer');
  }

  return {
    first_name,
    last_name,
    email,
    username,
    password,
    role_id,
    phone,
    is_active
  };
}

export function validateUpdateUserPayload(payload) {
  const updates = {};

  if ('first_name' in payload) {
    const first_name = String(payload.first_name || '').trim();
    if (!first_name) {
      throw createHttpError(400, 'first_name is required');
    }
    updates.first_name = first_name;
  }

  if ('last_name' in payload) {
    const last_name = String(payload.last_name || '').trim();
    if (!last_name) {
      throw createHttpError(400, 'last_name is required');
    }
    updates.last_name = last_name;
  }

  if ('email' in payload) {
    const email = String(payload.email || '').trim();
    if (!email) {
      throw createHttpError(400, 'email is required');
    }
    updates.email = email;
  }

  if ('username' in payload) {
    const username = String(payload.username || '').trim();
    if (!username) {
      throw createHttpError(400, 'username is required');
    }
    updates.username = username;
  }

  if ('password' in payload) {
    const password = String(payload.password || '');
    if (!password || password.length < 6) {
      throw createHttpError(400, 'password must be at least 6 characters long');
    }
    updates.password = password;
  }

  if ('role_id' in payload) {
    const role_id = Number(payload.role_id);
    if (!Number.isInteger(role_id) || role_id <= 0) {
      throw createHttpError(400, 'role_id must be a positive integer');
    }
    updates.role_id = role_id;
  }

  if ('phone' in payload) {
    updates.phone = payload.phone ? String(payload.phone).trim() : null;
  }

  if ('is_active' in payload) {
    updates.is_active = payload.is_active === true;
  }

  if (!Object.keys(updates).length) {
    throw createHttpError(400, 'No valid user fields provided to update');
  }

  return updates;
}

export function mapUserPostgresError(error) {
  if (error.code === '23505') {
    if (error.constraint === 'users_email_key' || error.constraint === 'users_email_unique') {
      throw createHttpError(409, 'A user with this email already exists');
    }
    if (error.constraint === 'users_username_key' || error.constraint === 'users_username_unique') {
      throw createHttpError(409, 'A user with this username already exists');
    }
    throw createHttpError(409, 'A user with the same unique value already exists');
  }

  throw error;
}
