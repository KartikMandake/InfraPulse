const fs = require('fs');
const path = require('path');
const pgPath = path.resolve(__dirname, '../backend/node_modules/pg');
const { Pool } = require(pgPath);

async function applyMigrations() {
  const pool = new Pool({
    host: '127.0.0.1',
    port: 5434,
    user: 'postgres',
    password: 'postgres',
    database: 'infrapulse_ops_prod',
    ssl: false
  });

  const migrationsDir = path.resolve(__dirname, '../backend/src/db/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`[Deploy DB] Found ${files.length} migration files.`);
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    for (const file of files) {
      const check = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
      if (check.rows.length === 0) {
        console.log(`[Deploy DB] Applying ${file}...`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[Deploy DB] -> Applied ${file}`);
      } else {
        console.log(`[Deploy DB] Already applied ${file}`);
      }
    }

    const tables = await client.query(`
      SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'
    `);
    const fks = await client.query(`
      SELECT count(*) as count FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY'
    `);

    console.log(`[Deploy DB] Total tables in public schema: ${tables.rows[0].count}`);
    console.log(`[Deploy DB] Total foreign key constraints: ${fks.rows[0].count}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Deploy DB] Migration failure:`, err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigrations().catch(e => {
  console.error(e);
  process.exit(1);
});
