import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];

  if (value === undefined || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true';
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseCsv(value, defaultValue = []) {
  if (value === undefined) {
    return defaultValue;
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRequiredNumber(name) {
  const value = requireEnv(name);
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }

  return parsed;
}

export const env = {
  appName: process.env.APP_NAME || 'RohiPOS API',
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseNumber(process.env.PORT, 3001),
  cors: {
    allowedOrigins: parseCsv(process.env.CORS_ALLOWED_ORIGINS, ['http://localhost:5173'])
  },
  db: {
    host: requireEnv('DB_HOST'),
    port: parseRequiredNumber('DB_PORT'),
    name: requireEnv('DB_NAME'),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    ssl: parseBoolean(process.env.DB_SSL, false)
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'rohipos_dev_secret_2026',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h'
  }
};
