import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function requireEnv(name) {
  const value = process.env[name];

  if (value === undefined || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseRequiredNumber(name) {
  const value = requireEnv(name);
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }

  return parsed;
}

const dbHost = requireEnv('DB_HOST');
const dbPort = parseRequiredNumber('DB_PORT');
const dbName = requireEnv('DB_NAME');
const dbUser = requireEnv('DB_USER');
const dbPassword = requireEnv('DB_PASSWORD');
const dbSsl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

const migrationFiles = [
  '../database/sql/009_create_cash_movements.sql',
  '../database/sql/010_add_sales_cancellation_tracking.sql',
  '../database/sql/011_translate_membership_plans_to_spanish.sql',
  '../database/sql/012_seed_clients_without_membership.sql',
  '../database/sql/013_add_product_tax_fields_and_tax_options_setting.sql',
  '../database/sql/014_add_membership_plan_tax_fields.sql'
];

const { Pool } = pg;

async function run() {
  const pool = new Pool({
    host: dbHost,
    port: dbPort,
    database: dbName,
    user: dbUser,
    password: dbPassword,
    ssl: dbSsl
  });

  try {
    for (const relativeFile of migrationFiles) {
      const filePath = path.resolve(projectRoot, relativeFile);
      const sql = await fs.readFile(filePath, 'utf8');
      await pool.query(sql);
      console.log(`Applied: ${relativeFile}`);
    }

    const verificationResult = await pool.query(`
      SELECT
        to_regclass('public.cash_movements') AS cash_movements_table,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'cancelled_at'
        ) AS has_cancelled_at,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales' AND column_name = 'cancelled_by_user_id'
        ) AS has_cancelled_by_user_id;
    `);

    console.log('Verification:', verificationResult.rows[0]);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
