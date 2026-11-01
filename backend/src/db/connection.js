import pg from 'pg';
import { config } from '../config/env.js';
import { tenantContext } from '../security/tenantContext.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '../utils/logger.js';
import { recordOperation, poolGauge } from '../observability/metrics.js';
import { performance } from 'node:perf_hooks';

const transactions = new AsyncLocalStorage();

const { Pool } = pg;

let pool = null;

/**
 * Initializes or returns the PostgreSQL connection pool.
 */
export function getPool() {
  if (!pool || pool.ended) {
    const poolConfig = {
      ...(config.db.connectionString ? { connectionString: config.db.connectionString } : {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password
      }),
      max: config.db.max,
      idleTimeoutMillis: config.db.idleTimeoutMillis,
      connectionTimeoutMillis: config.db.connectionTimeoutMillis,
      ...(config.db.sslMode === 'verify-full' ? { ssl: { rejectUnauthorized: true, ca: config.db.sslRootCert } } : {}),
      allowExitOnIdle: true
    };

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      logger.error('Unexpected idle database client error', { code: err.code });
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
  const start = performance.now();
  try {
    const context = tenantContext();
    const active = transactions.getStore();
    const res = active ? await active.query(text, params) : context ? await withTransaction(client => client.query(text, params)) : await p.query(text, params);
    const duration = performance.now() - start;
    try { recordOperation('db.query', duration, false); } catch {}
    if (process.env.DEBUG_SQL === 'true' && !config.productionLike) {
      console.log(`[SQL Query] (${Math.round(duration)}ms):`, text.replace(/\s+/g, ' ').trim());
    }
    return res;
  } catch (err) {
    const duration = performance.now() - start;
    try { recordOperation('db.query', duration, true); } catch {}
    logger.error('Database query failed', { code: err.code, ...(!config.productionLike ? { message: err.message } : {}) });
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
  if (transactions.getStore()) return callback(transactions.getStore());
  const start = performance.now();
  const p = getPool();
  const client = await p.connect();
  let pending = Promise.resolve();
  const serialClient = { query(...args) { const result = pending.then(() => client.query(...args)); pending = result.catch(() => {}); return result; } };
  try {
    await client.query('BEGIN');
    const context = tenantContext();
    if (context) {
      await client.query("SELECT set_config('infrapulse.tenant_id',$1,true)", [context.tenantId]);
      await client.query('SET LOCAL ROLE infrapulse_tenant_runtime');
    }
    const result = await transactions.run(serialClient, () => callback(serialClient));
    await pending;
    const committed = await client.query('COMMIT');
    if (committed.command === 'ROLLBACK') throw new Error('Database transaction was aborted before commit.');
    try { recordOperation('db.transaction', performance.now() - start, false); } catch {}
    return result;
  } catch (err) {
    await pending;
    await client.query('ROLLBACK');
    try { recordOperation('db.transaction', performance.now() - start, true); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retries checking the database connection with linear/exponential backoff.
 * Essential for container orchestration, staging cold starts, and resilience.
 *
 * @param {Object} options
 * @param {number} [options.retries=10] - Number of connection attempts before giving up
 * @param {number} [options.delayMs=2000] - Base delay between retries in milliseconds
 * @param {number} [options.factor=1.2] - Multiplier for backoff interval
 * @returns {Promise<{ connected: boolean, database: string, host: string, port: number, version?: string, latencyMs: number }>}
 */
export async function waitForConnection({ retries = 10, delayMs = 2000, factor = 1.2 } = {}) {
  let attempt = 0;
  let currentDelay = delayMs;
  let lastStatus = null;

  while (attempt < retries) {
    attempt++;
    lastStatus = await checkConnection();
    if (lastStatus.connected) {
      return lastStatus;
    }

    if (attempt < retries) {
      logger.warn('PostgreSQL connection attempt failed', { attempt, retries, retryDelayMs: Math.round(currentDelay), ...(!config.productionLike ? { reason: lastStatus.error } : {}) });
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * factor, 10000);
    }
  }

  return lastStatus || { connected: false, error: 'Connection attempts exhausted' };
}

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
      cloud_aws_discovery_runs,
      cloud_cost_estimates,
      cloud_schedules,
      cloud_lifecycle_operations,
      cloud_resources,
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

/**
 * Returns connection pool statistics for self-observability and readiness monitoring.
 */
export function getPoolStats() {
  if (!pool || pool.ended) {
    try {
      poolGauge.set({ state: 'active' }, 0);
      poolGauge.set({ state: 'idle' }, 0);
      poolGauge.set({ state: 'waiting' }, 0);
    } catch {}
    return {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      activeCount: 0
    };
  }
  const stats = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    activeCount: Math.max(0, pool.totalCount - pool.idleCount)
  };
  try {
    poolGauge.set({ state: 'active' }, stats.activeCount);
    poolGauge.set({ state: 'idle' }, stats.idleCount);
    poolGauge.set({ state: 'waiting' }, stats.waitingCount);
  } catch {}
  return stats;
}
