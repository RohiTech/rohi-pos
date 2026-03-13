import { Router } from 'express';
import { query } from '../config/db.js';
import { comparePassword, signAccessToken } from '../lib/auth.js';
import { authenticateRequest } from '../middleware/auth.middleware.js';
import { createHttpError } from '../utils/http.js';

const authRouter = Router();

authRouter.post('/login', async (request, response, next) => {
  try {
    const usernameOrEmail = String(request.body.username || request.body.email || '').trim();
    const password = String(request.body.password || '');

    if (!usernameOrEmail || !password) {
      throw createHttpError(400, 'username and password are required');
    }

    const result = await query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.username,
         u.password_hash,
         u.is_active,
         r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.username = $1 OR u.email = $1
       LIMIT 1`,
      [usernameOrEmail]
    );

    if (result.rowCount === 0) {
      throw createHttpError(401, 'Invalid credentials');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw createHttpError(403, 'User account is inactive');
    }

    const isValidPassword = await comparePassword(password, user.password_hash);

    if (!isValidPassword) {
      throw createHttpError(401, 'Invalid credentials');
    }

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signAccessToken(user);

    response.json({
      ok: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          username: user.username,
          role_name: user.role_name
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', authenticateRequest, async (request, response) => {
  response.json({
    ok: true,
    data: request.user
  });
});

export { authRouter };
