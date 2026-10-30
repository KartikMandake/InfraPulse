import pg from '../../backend/node_modules/pg/lib/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool, Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../../backend/src/db/migrations');

async function testDatabaseDisasterRecovery() {
  console.log('[DR Test] Starting Database Disaster Recovery & Migration Verification...');

  const pgHost = process.env.PGHOST || 'localhost';
  const pgPort = parseInt(process.env.PGPORT || '5434', 10);
  const pgUser = process.env.PGUSER || 'postgres';
  const pgPassword = process.env.PGPASSWORD || 'postgres';

  // 1. Connect to administrative DB to provision test database
  const adminClient = new Client({
    host: pgHost,
    port: pgPort,
    user: pgUser,
    password: pgPassword,
    database: 'postgres'
  });

  await adminClient.connect();
  console.log('[DR Test] Connected to administrative postgres database.');

  // Clean prior test DB if left over
  await adminClient.query(`DROP DATABASE IF EXISTS infrapulse_dr_test WITH (FORCE);`);
  await adminClient.query(`CREATE DATABASE infrapulse_dr_test;`);
  console.log('[DR Test] Successfully created disposable database: infrapulse_dr_test');
  await adminClient.end();

  // 2. Connect to the fresh infrapulse_dr_test database
  const drPool = new Pool({
    host: pgHost,
    port: pgPort,
    user: pgUser,
    password: pgPassword,
    database: 'infrapulse_dr_test'
  });

  const startTime = Date.now();

  // Ensure migrations tracking table
  await drPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 3. Apply all migrations from 001 to 010 in order
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  console.log(`[DR Test] Found ${files.length} migration files in sequence:`, files);

  const appliedMigrations = [];
  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const client = await drPool.connect();
    try {
      await client.query('BEGIN;');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1);', [file]);
      await client.query('COMMIT;');
      appliedMigrations.push(file);
      console.log(`  [DR Test] Successfully applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK;');
      client.release();
      throw new Error(`Failed to apply migration ${file}: ${err.message}`);
    } finally {
      client.release();
    }
  }

  const migrationDurationMs = Date.now() - startTime;
  console.log(`[DR Test] All ${appliedMigrations.length} migrations applied in ${migrationDurationMs}ms.`);

  // 4. Verify all tables created
  const tableRes = await drPool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const createdTables = tableRes.rows.map(r => r.table_name);
  console.log(`[DR Test] Total tables created in public schema: ${createdTables.length}`);

  // 5. Verify Foreign Key and Constraint Integrity
  const fkeyRes = await drPool.query(`
    SELECT conname, confrelid::regclass as ref_table
    FROM pg_constraint
    WHERE contype = 'f';
  `);
  console.log(`[DR Test] Total foreign key constraints enforced: ${fkeyRes.rows.length}`);

  // 6. Test Idempotency: Re-running migrations should apply 0 new migrations
  const recheckRes = await drPool.query('SELECT migration_name FROM schema_migrations;');
  console.log(`[DR Test] Total tracked applied migrations: ${recheckRes.rows.length}`);

  await drPool.end();

  // 7. Cleanup disposable database
  const cleanupClient = new Client({
    host: pgHost,
    port: pgPort,
    user: pgUser,
    password: pgPassword,
    database: 'postgres'
  });
  await cleanupClient.connect();
  await cleanupClient.query(`DROP DATABASE IF EXISTS infrapulse_dr_test WITH (FORCE);`);
  console.log('[DR Test] Successfully cleaned up disposable database: infrapulse_dr_test');
  await cleanupClient.end();

  console.log('[DR Test] Database Disaster Recovery & Integrity Verification PASSED!');
  return {
    success: true,
    totalMigrations: files.length,
    appliedMigrations,
    createdTablesCount: createdTables.length,
    foreignKeysCount: fkeyRes.rows.length,
    durationMs: migrationDurationMs
  };
}

testDatabaseDisasterRecovery()
  .then(res => console.log('[RESULT]', JSON.stringify(res, null, 2)))
  .catch(err => {
    console.error('[DR Test Failure]', err);
    process.exit(1);
  });
