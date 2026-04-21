import { Router } from 'express';
import multer from 'multer';
import { query } from '../config/db.js';
import { optimizeBrandingImage } from '../lib/branding-images.js';
import { createHttpError } from '../utils/http.js';

const settingsRouter = Router();
const SYSTEM_CURRENCY = 'NIO';
const DEFAULT_TIME_ZONE = 'America/Managua';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const SETTINGS_KEYS = [
  'currency_code',
  'time_zone',
  'membership_expiry_alert_days',
  'routine_price',
  'tax_options',
  'company_name',
  'company_motto',
  'company_ruc',
  'company_phone',
  'company_email',
  'company_address',
  'company_legal_name',
  'company_logo_data_url',
  'login_background_data_url',
  'kiosk_logo_data_url',
  'kiosk_background_data_url'
];

const SETTINGS_DESCRIPTIONS = {
  currency_code: 'Codigo de moneda principal del sistema',
  time_zone: 'Zona horaria oficial del gimnasio para reportes y operaciones',
  membership_expiry_alert_days: 'Dias de anticipacion para avisar vencimiento de membresia',
  routine_price: 'Precio configurado para la rutina',
  tax_options: 'Listado de impuestos disponibles para productos en formato JSON',
  company_name: 'Nombre comercial de la empresa',
  company_motto: 'Lema de la empresa',
  company_ruc: 'RUC de la empresa',
  company_phone: 'Telefono de la empresa',
  company_email: 'Correo de la empresa',
  company_address: 'Direccion de la empresa',
  company_legal_name: 'Razon social o nombre legal de la empresa',
  company_logo_data_url: 'Logo principal mostrado en login',
  login_background_data_url: 'Imagen de fondo para la pantalla de login',
  kiosk_logo_data_url: 'Logo mostrado en modo kiosko QR',
  kiosk_background_data_url: 'Imagen de fondo para modo kiosko QR'
};

function isValidTimeZone(value) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch (_error) {
    return false;
  }
}

function mapSettingsResponse(settings) {
  const requestedTimeZone = String(settings.time_zone || '').trim();
  const timeZone = isValidTimeZone(requestedTimeZone) ? requestedTimeZone : DEFAULT_TIME_ZONE;

  let taxOptions = [
    { name: 'Exento', rate: 0 },
    { name: 'IVA', rate: 15 }
  ];

  try {
    const parsed = JSON.parse(String(settings.tax_options || '[]'));
    if (Array.isArray(parsed) && parsed.length > 0) {
      taxOptions = parsed
        .map((item) => ({
          name: String(item?.name || '').trim(),
          rate: Number(item?.rate)
        }))
        .filter((item) => item.name && Number.isFinite(item.rate) && item.rate >= 0 && item.rate <= 100);
    }
  } catch (_error) {
    // Keep default tax options when stored value is invalid JSON.
  }

  if (!taxOptions.length) {
    taxOptions = [
      { name: 'Exento', rate: 0 },
      { name: 'IVA', rate: 15 }
    ];
  }

  return {
    currency_code: settings.currency_code || SYSTEM_CURRENCY,
    time_zone: timeZone,
    membership_expiry_alert_days: Number(settings.membership_expiry_alert_days || 3),
    routine_price: Number(settings.routine_price || 0),
    tax_options: taxOptions,
    company_name: settings.company_name || 'RohiPOS',
    company_motto: settings.company_motto || '',
    company_ruc: settings.company_ruc || '',
    company_phone: settings.company_phone || '',
    company_email: settings.company_email || '',
    company_address: settings.company_address || '',
    company_legal_name: settings.company_legal_name || '',
    company_logo_data_url: settings.company_logo_data_url || null,
    login_background_data_url: settings.login_background_data_url || null,
    kiosk_logo_data_url: settings.kiosk_logo_data_url || null,
    kiosk_background_data_url: settings.kiosk_background_data_url || null
  };
}

async function upsertSetting(settingKey, settingValue) {
  await query(
    `INSERT INTO system_settings (setting_key, setting_value, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [settingKey, String(settingValue ?? ''), SETTINGS_DESCRIPTIONS[settingKey] || null]
  );
}

async function getSettingsMap() {
  const result = await query(
    `SELECT setting_key, setting_value
     FROM system_settings
     WHERE setting_key = ANY($1)
     ORDER BY setting_key ASC`,
    [SETTINGS_KEYS]
  );

  return Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value]));
}

settingsRouter.get('/', async (_request, response, next) => {
  try {
    const settings = await getSettingsMap();

    response.json({
      ok: true,
      data: mapSettingsResponse(settings)
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/', async (request, response, next) => {
  try {
    const alertDays = Number.parseInt(request.body.membership_expiry_alert_days, 10);
    const routinePrice = Number(request.body.routine_price);
    const companyName = String(request.body.company_name || '').trim();
    const companyMotto = String(request.body.company_motto || '').trim();
    const companyRuc = String(request.body.company_ruc || '').trim();
    const companyPhone = String(request.body.company_phone || '').trim();
    const companyEmail = String(request.body.company_email || '').trim();
    const companyAddress = String(request.body.company_address || '').trim();
    const companyLegalName = String(request.body.company_legal_name || '').trim();
    const timeZone = String(request.body.time_zone || DEFAULT_TIME_ZONE).trim();
    const rawTaxOptions = Array.isArray(request.body.tax_options) ? request.body.tax_options : [];

    const taxOptions = rawTaxOptions
      .map((item) => ({
        name: String(item?.name || '').trim(),
        rate: Number(item?.rate)
      }))
      .filter((item) => item.name && Number.isFinite(item.rate));

    if (!Number.isInteger(alertDays) || alertDays < 0 || alertDays > 30) {
      throw createHttpError(400, 'membership_expiry_alert_days must be between 0 and 30');
    }

    if (Number.isNaN(routinePrice) || routinePrice < 0) {
      throw createHttpError(400, 'routine_price must be greater than or equal to 0');
    }

    if (!companyName || companyName.length > 120) {
      throw createHttpError(400, 'company_name is required and must not exceed 120 characters');
    }

    if (companyMotto.length > 180) {
      throw createHttpError(400, 'company_motto must not exceed 180 characters');
    }

    if (companyRuc.length > 40) {
      throw createHttpError(400, 'company_ruc must not exceed 40 characters');
    }

    if (companyPhone.length > 30) {
      throw createHttpError(400, 'company_phone must not exceed 30 characters');
    }

    if (companyEmail.length > 120) {
      throw createHttpError(400, 'company_email must not exceed 120 characters');
    }

    if (companyAddress.length > 250) {
      throw createHttpError(400, 'company_address must not exceed 250 characters');
    }

    if (companyLegalName.length > 140) {
      throw createHttpError(400, 'company_legal_name must not exceed 140 characters');
    }

    if (!isValidTimeZone(timeZone)) {
      throw createHttpError(400, 'time_zone is invalid');
    }

    if (!taxOptions.length) {
      throw createHttpError(400, 'tax_options must include at least one option');
    }

    if (
      taxOptions.some(
        (item) => item.name.length > 60 || item.rate < 0 || item.rate > 100
      )
    ) {
      throw createHttpError(400, 'tax_options contains invalid values');
    }

    await upsertSetting('currency_code', SYSTEM_CURRENCY);
    await upsertSetting('time_zone', timeZone);
    await upsertSetting('membership_expiry_alert_days', String(alertDays));
    await upsertSetting('routine_price', String(routinePrice));
    await upsertSetting('tax_options', JSON.stringify(taxOptions));
    await upsertSetting('company_name', companyName);
    await upsertSetting('company_motto', companyMotto);
    await upsertSetting('company_ruc', companyRuc);
    await upsertSetting('company_phone', companyPhone);
    await upsertSetting('company_email', companyEmail);
    await upsertSetting('company_address', companyAddress);
    await upsertSetting('company_legal_name', companyLegalName);

    const settings = await getSettingsMap();

    response.json({
      ok: true,
      message: 'Settings updated successfully',
      data: mapSettingsResponse(settings)
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put(
  '/branding',
  upload.fields([
    { name: 'company_logo', maxCount: 1 },
    { name: 'login_background', maxCount: 1 },
    { name: 'kiosk_logo', maxCount: 1 },
    { name: 'kiosk_background', maxCount: 1 }
  ]),
  async (request, response, next) => {
    try {
      const files = request.files || {};
      const companyLogoFile = files.company_logo?.[0] || null;
      const loginBackgroundFile = files.login_background?.[0] || null;
      const kioskLogoFile = files.kiosk_logo?.[0] || null;
      const kioskBackgroundFile = files.kiosk_background?.[0] || null;

      if (companyLogoFile) {
        const optimized = await optimizeBrandingImage(companyLogoFile, 'logo');
        await upsertSetting('company_logo_data_url', optimized.dataUrl);
      }

      if (loginBackgroundFile) {
        const optimized = await optimizeBrandingImage(loginBackgroundFile, 'background');
        await upsertSetting('login_background_data_url', optimized.dataUrl);
      }

      if (kioskLogoFile) {
        const optimized = await optimizeBrandingImage(kioskLogoFile, 'logo');
        await upsertSetting('kiosk_logo_data_url', optimized.dataUrl);
      }

      if (kioskBackgroundFile) {
        const optimized = await optimizeBrandingImage(kioskBackgroundFile, 'background');
        await upsertSetting('kiosk_background_data_url', optimized.dataUrl);
      }

      if (request.body.remove_company_logo === 'true') {
        await upsertSetting('company_logo_data_url', '');
      }

      if (request.body.remove_login_background === 'true') {
        await upsertSetting('login_background_data_url', '');
      }

      if (request.body.remove_kiosk_logo === 'true') {
        await upsertSetting('kiosk_logo_data_url', '');
      }

      if (request.body.remove_kiosk_background === 'true') {
        await upsertSetting('kiosk_background_data_url', '');
      }

      const settings = await getSettingsMap();

      response.json({
        ok: true,
        message: 'Branding settings updated successfully',
        data: mapSettingsResponse(settings)
      });
    } catch (error) {
      next(error);
    }
  }
);

export { settingsRouter };
