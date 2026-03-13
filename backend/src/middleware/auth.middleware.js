import { query } from '../config/db.js';
import { verifyAccessToken } from '../lib/auth.js';

export async function authenticateRequest(request, response, next) {
  try {
    const authorizationHeader = request.headers.authorization || '';

    if (!authorizationHeader.startsWith('Bearer ')) {
      return response.status(401).json({
        ok: false,
        message: 'Authentication required'
      });
    }

    const token = authorizationHeader.slice(7);
    const payload = verifyAccessToken(token);

    const result = await query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.username,
         u.is_active,
         r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [payload.sub]
    );

    if (result.rowCount === 0 || !result.rows[0].is_active) {
      return response.status(401).json({
        ok: false,
        message: 'User not authorized'
      });
    }

    request.user = result.rows[0];
    next();
  } catch (_error) {
    response.status(401).json({
      ok: false,
      message: 'Invalid or expired token'
    });
  }
}
