import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const dbHost = process.env.DB_HOST ? process.env.DB_HOST : 'localhost';
const dbPort = Number(process.env.DB_PORT ? process.env.DB_PORT : '5432');
const dbName = process.env.DB_NAME ? process.env.DB_NAME : 'rohipos';
const dbUser = process.env.DB_USER ? process.env.DB_USER : 'postgres';
const dbPassword = process.env.DB_PASSWORD ? process.env.DB_PASSWORD : 'postgres';
const dbSsl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

const migrationFiles = [
  '../database/sql/009_create_cash_movements.sql',
  '../database/sql/010_add_sales_cancellation_tracking.sql',
  '../database/sql/011_translate_membership_plans_to_spanish.sql',
  '../database/sql/012_seed_clients_without_membership.sql'
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
