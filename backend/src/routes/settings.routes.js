import { Router } from 'express';
import { query } from '../config/db.js';
import { createHttpError } from '../utils/http.js';

const settingsRouter = Router();
const ALLOWED_CURRENCIES = new Set(['USD', 'NIO', 'EUR', 'MXN', 'COP']);

async function getSettingsMap() {
  const result = await query(
    `SELECT setting_key, setting_value
     FROM system_settings
     WHERE setting_key IN ('currency_code', 'membership_expiry_alert_days')
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
        currency_code: settings.currency_code || 'USD',
        membership_expiry_alert_days: Number(settings.membership_expiry_alert_days || 3)
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
    const alertDays = Number.parseInt(request.body.membership_expiry_alert_days, 10);

    if (!currencyCode) {
      throw createHttpError(400, 'currency_code is required');
    }

    if (!ALLOWED_CURRENCIES.has(currencyCode)) {
      throw createHttpError(400, 'currency_code is invalid');
    }

    if (!Number.isInteger(alertDays) || alertDays < 0 || alertDays > 30) {
      throw createHttpError(400, 'membership_expiry_alert_days must be between 0 and 30');
    }

    await query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES ('currency_code', $1, 'Codigo de moneda principal del sistema')
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value`,
      [currencyCode]
    );

    await query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES (
         'membership_expiry_alert_days',
         $1,
         'Dias de anticipacion para avisar vencimiento de membresia'
       )
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value`,
      [String(alertDays)]
    );

    response.json({
      ok: true,
      message: 'Settings updated successfully',
      data: {
        currency_code: currencyCode,
        membership_expiry_alert_days: alertDays
      }
    });
  } catch (error) {
    next(error);
  }
});

export { settingsRouter };
