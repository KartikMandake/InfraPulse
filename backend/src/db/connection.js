import pg from 'pg';
import { config } from '../config/env.js';

const { Pool } = pg;

let pool = null;

/**
 * Initializes or returns the PostgreSQL connection pool.
 */
export function getPool() {
  if (!pool || pool.ended) {
    const poolConfig = config.db.connectionString
      ? { connectionString: config.db.connectionString, allowExitOnIdle: true }
      : {
          host: config.db.host,
          port: config.db.port,
          database: config.db.database,
          user: config.db.user,
          password: config.db.password,
          max: config.db.max,
          idleTimeoutMillis: 1000,
          connectionTimeoutMillis: config.db.connectionTimeoutMillis,
          allowExitOnIdle: true
        };

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]: Unexpected idle client error', err.message);
    });
  }
  return pool;
}

/**
 * Execute a parameterized query with connection pooling.
 *
 * @param {string} text - SQL query string with $1, $2 parameter placeholders
 * @param {Array} [params] - Parameter values
 * @returns {Promise<pg.QueryResult>} Query result object
 */
export async function query(text, params = []) {
  const p = getPool();
  const start = Date.now();
  try {
    const res = await p.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL === 'true') {
      console.log(`[SQL Query] (${duration}ms):`, text.replace(/\s+/g, ' ').trim());
    }
    return res;
  } catch (err) {
    console.error(`[SQL Error] in query: "${text.substring(0, 100)}...":`, err.message);
    throw err;
  }
}

/**
 * Executes a callback within a managed database transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 *
 * @param {Function} callback - async (client) => { ... }
 * @returns {Promise<any>} Result of callback
 */
export async function withTransaction(callback) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Probes the PostgreSQL database connection.
 *
 * @returns {Promise<{ connected: boolean, database: string, host: string, port: number, version?: string, latencyMs: number }>}
 */
export async function checkConnection() {
  const start = Date.now();
  try {
    const res = await query('SELECT version();');
    return {
      connected: true,
      database: config.db.database,
      host: config.db.host,
      port: config.db.port,
      version: res.rows[0]?.version?.split(' ')?.[1] || 'PostgreSQL',
      latencyMs: Date.now() - start
    };
  } catch (err) {
    return {
      connected: false,
      database: config.db.database,
      host: config.db.host,
      port: config.db.port,
      error: err.message,
      latencyMs: Date.now() - start
    };
  }
}

/**
 * Truncates all application tables for testing purposes.
 */
export async function truncateAllTables() {
  await query(`
    TRUNCATE
      notification_deliveries,
      notification_preferences,
      notification_channels,
      audit_logs,
      sessions,
      users,
      alerts,
      incident_events,
      incidents,
      alert_rules,
      deployments,
      services,
      investigation_runs,
      fault_simulations
    CASCADE;
  `);
}

/**
 * Gracefully shuts down the connection pool.
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
