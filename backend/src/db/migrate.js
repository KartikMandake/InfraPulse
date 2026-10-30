import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, withTransaction, closePool } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Ensures the migration tracking table exists.
 */
async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Runs all pending SQL migrations in alphabetical/version order.
 */
export async function runMigrations() {
  await ensureMigrationsTable();

  const appliedRes = await query('SELECT migration_name FROM schema_migrations;');
  const appliedSet = new Set(appliedRes.rows.map(r => r.migration_name));

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const appliedNow = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`[Migrations] Applying migration: ${file}...`);

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (migration_name) VALUES ($1);',
        [file]
      );
    });

    appliedNow.push(file);
    console.log(`[Migrations] Successfully applied: ${file}`);
  }

  return {
    totalMigrations: files.length,
    appliedNow
  };
}

// Direct CLI invocation
if (process.argv[1] === __filename) {
  runMigrations()
    .then((res) => {
      console.log(`[Migrations Complete] ${res.appliedNow.length} migration(s) applied.`);
      return closePool();
    })
    .catch((err) => {
      console.error('[Migrations Error]:', err);
      process.exit(1);
    });
}

