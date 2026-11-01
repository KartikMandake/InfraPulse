import { Router } from 'express';
import { checkConnection, getPoolStats, query } from '../db/connection.js';

const router = Router();

/**
 * GET /api/health
 * General operational status (backward compatible).
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      version: '1.0.0',
      service: 'InfraPulse Telemetry & RCA Engine Backend'
    }
  });
});

/**
 * GET /api/health/live
 * Liveness probe: confirms the Node.js event loop and Express process are responsive.
 * Does not depend on external systems so temporary database blips do not cause container thrashing.
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'LIVE',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid
  });
});

/**
 * GET /api/health/ready
 * Readiness probe: checks essential dependencies (PostgreSQL).
 * Returns HTTP 200 when ready to receive production traffic, HTTP 503 if dependencies are down.
 * Never exposes SQL credentials, connection strings, or internal errors.
 */
router.get('/ready', async (req, res) => {
  if(req.app.locals.draining)return res.status(503).json({status:'DRAINING'});
  try {
    const dbStatus = await checkConnection();

    if (!dbStatus.connected) {
      return res.status(503).json({
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        dependencies: {
          database: 'UNAVAILABLE'
        },
        message: 'Database connection check failed.'
      });
    }

    return res.status(200).json({
      status: 'READY',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies: {
        database: 'CONNECTED',
        latencyMs: dbStatus.latencyMs
      }
    });
  } catch (err) {
    return res.status(503).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: 'UNAVAILABLE'
      },
      message: 'Service is not ready to serve traffic.'
    });
  }
});


/**
 * GET /api/health/diagnostics
 * Enterprise self-observability endpoint (Phase 23L):
 * Monitors internal Node.js process health, memory, database pool stats, and queue metrics.
 * Explicitly isolated from customer infrastructure health to prevent recursive alerting.
 */
router.get('/diagnostics', async (req, res) => {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const dbStatus = await checkConnection().catch(() => ({ connected: false, latencyMs: -1 }));
  const poolStats = getPoolStats();

  let deadLetterCount = 0;
  let recentIngestionCount = 0;
  try {
    const dlRes = await query('SELECT COUNT(*) FROM telemetry_dead_letter;');
    deadLetterCount = parseInt(dlRes.rows[0]?.count || '0', 10);
    const inRes = await query('SELECT COALESCE(SUM(events_ingested_count), 0) as total FROM integration_telemetry_stats;');
    recentIngestionCount = parseInt(inRes.rows[0]?.total || '0', 10);
  } catch (e) {
    // Gracefully handle if tables are unavailable
  }

  res.status(200).json({
    success: true,
    data: {
      service: 'infrapulse-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      pid: process.pid,
      process: {
        memoryMb: {
          rss: Math.round(mem.rss / (1024 * 1024)),
          heapUsed: Math.round(mem.heapUsed / (1024 * 1024)),
          heapTotal: Math.round(mem.heapTotal / (1024 * 1024)),
          external: Math.round(mem.external / (1024 * 1024))
        },
        cpuUsageUserMicroseconds: cpu.user,
        cpuUsageSystemMicroseconds: cpu.system
      },
      database: {
        connected: dbStatus.connected,
        latencyMs: dbStatus.latencyMs,
        pool: poolStats
      },
      telemetryPipeline: {
        totalIngestedEvents: recentIngestionCount,
        deadLetterQueueCount: deadLetterCount,
        status: deadLetterCount > 500 ? 'DEGRADED' : 'HEALTHY'
      }
    }
  });
});

export default router;
