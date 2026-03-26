import { Router } from 'express';
import { query } from '../config/db.js';
import { createHttpError } from '../utils/http.js';

const settingsRouter = Router();
const ALLOWED_CURRENCIES = new Set(['USD', 'NIO', 'EUR', 'MXN', 'COP']);

async function getSettingsMap() {
  const result = await query(
    `SELECT setting_key, setting_value
     FROM system_settings
     WHERE setting_key IN ('currency_code')
     ORDER BY setting_key ASC`
  );

  return Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value]));
}

settingsRouter.get('/', async (_request, response, next) => {
  try {
    const settings = await getSettingsMap();

    response.json({
      ok: true,
      data: {
        currency_code: settings.currency_code || 'USD'
      }
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/', async (request, response, next) => {
  try {
    const currencyCode = String(request.body.currency_code || '')
      .trim()
      .toUpperCase();

    if (!currencyCode) {
      throw createHttpError(400, 'currency_code is required');
    }

    if (!ALLOWED_CURRENCIES.has(currencyCode)) {
      throw createHttpError(400, 'currency_code is invalid');
    }

    await query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES ('currency_code', $1, 'Codigo de moneda principal del sistema')
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value`,
      [currencyCode]
    );

    response.json({
      ok: true,
      message: 'Settings updated successfully',
      data: {
        currency_code: currencyCode
      }
    });
  } catch (error) {
    next(error);
  }
});

export { settingsRouter };
