import dotenv from 'dotenv';

dotenv.config();

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

export const env = {
  appName: process.env.APP_NAME || 'RohiPOS API',
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseNumber(process.env.PORT, 3001),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseNumber(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'rohipos',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: parseBoolean(process.env.DB_SSL, false)
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'rohipos_dev_secret_2026',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h'
  }
};
