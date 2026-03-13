import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role_name,
      username: user.username
    },
    env.auth.jwtSecret,
    {
      expiresIn: env.auth.jwtExpiresIn
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.auth.jwtSecret);
}
