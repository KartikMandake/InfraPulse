import { Router } from 'express';
import { checkConnection } from '../db/connection.js';

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

export default router;
