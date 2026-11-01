import crypto from 'node:crypto';
import { registry, processMeasurements, window, heartbeatAge } from '../observability/metrics.js';
import { observationSettings } from '../observability/settings.js';
import { getPoolStats, checkConnection, query } from '../db/connection.js';
import { evaluateSelfAlerts, evaluateSelfSlos, getWorkerHeartbeatInfo } from '../services/selfMonitoringAlerts.service.js';
import { config } from '../config/env.js';

export function verifyMetricsAccess(req) {
  const settings = observationSettings();
  if (!settings.token) {
    return true;
  }
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (match) {
    const provided = Buffer.from(match[1]);
    const expected = Buffer.from(settings.token);
    if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
      return true;
    }
  }
  if (req.user) {
    if (req.user.role === 'admin' || (settings.operators.length > 0 && settings.operators.includes(req.user.id))) {
      return true;
    }
  }
  return false;
}

/**
 * GET /metrics or GET /api/self-monitoring/metrics
 * Prometheus text format scrape endpoint.
 */
export async function getMetrics(req, res) {
  if (!verifyMetricsAccess(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="InfraPulse Self-Monitoring Metrics"');
    return res.status(401).send('# Unauthorized: valid scrape token required\n');
  }

  try {
    processMeasurements();
    getPoolStats();

    const workerInfo = getWorkerHeartbeatInfo();
    if (workerInfo.ageSeconds !== null) {
      try { heartbeatAge.set(workerInfo.ageSeconds); } catch {}
    }

    const metricsData = await registry.metrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.status(200).send(metricsData);
  } catch (err) {
    return res.status(500).send('# Error collecting metrics\n');
  }
}

/**
 * GET /api/self-monitoring/overview
 * Real-time operational telemetry and subsystem health matrix.
 */
export async function getOverview(req, res) {
  try {
    const measurements = processMeasurements();
    const poolStats = getPoolStats();
    const dbStatus = await checkConnection().catch(() => ({ connected: false, latencyMs: -1 }));
    const workerInfo = getWorkerHeartbeatInfo();
    const httpSummary = window.summary('http');
    const rcaSummary = window.summary('rca.investigation');
    const alertsResult = await evaluateSelfAlerts();
    const slosResult = evaluateSelfSlos();

    let deadLetterCount = 0;
    let recentIngestionCount = 0;
    try {
      const dlRes = await query('SELECT COUNT(*) FROM telemetry_dead_letter;');
      deadLetterCount = parseInt(dlRes.rows[0]?.count || '0', 10);
      const inRes = await query('SELECT COALESCE(SUM(events_ingested_count), 0) as total FROM integration_telemetry_stats;');
      recentIngestionCount = parseInt(inRes.rows[0]?.total || '0', 10);
    } catch {}

    const isCritical = alertsResult.alerts.some(a => a.status === 'FIRING' && a.severity === 'CRITICAL');
    const isWarning = alertsResult.alerts.some(a => a.status === 'FIRING' && a.severity === 'WARNING');
    const platformStatus = isCritical ? 'CRITICAL' : isWarning ? 'DEGRADED' : 'HEALTHY';

    const subsystems = {
      frontend: {
        id: 'frontend',
        name: 'Frontend Console (Vite/React)',
        status: 'HEALTHY',
        details: 'Serving SPA bundles with client-side error boundary telemetry.'
      },
      backend: {
        id: 'backend',
        name: 'Backend API Service',
        status: (httpSummary.errorPercent ?? 0) >= 5 ? 'DEGRADED' : 'HEALTHY',
        uptimeSeconds: Math.floor(measurements.uptimeSeconds),
        version: '2.4.0',
        pid: process.pid,
        activeRequests: httpSummary.total
      },
      database: {
        id: 'database',
        name: 'PostgreSQL Relational Storage',
        status: dbStatus.connected ? (poolStats.waitingCount > 0 ? 'DEGRADED' : 'HEALTHY') : 'CRITICAL',
        connected: dbStatus.connected,
        latencyMs: dbStatus.latencyMs,
        pool: {
          ...poolStats,
          max: config.db.max || 10
        }
      },
      worker: {
        id: 'worker',
        name: 'Standalone Background Worker',
        status: workerInfo.healthy && (workerInfo.ageSeconds ?? 0) <= 120 ? 'HEALTHY' : 'CRITICAL',
        heartbeatAgeSeconds: workerInfo.ageSeconds,
        pid: workerInfo.pid
      },
      notifications: {
        id: 'notifications',
        name: 'Notification Delivery Engine',
        status: 'HEALTHY',
        mockMode: config.notificationMockMode === true
      },
      rcaEngine: {
        id: 'rcaEngine',
        name: 'Deterministic RCA Engine',
        status: 'HEALTHY',
        investigationsExecuted: rcaSummary.total,
        p95DurationMs: rcaSummary.p95Ms
      },
      aiAssistant: {
        id: 'aiAssistant',
        name: 'AI Investigation Assistant',
        status: 'HEALTHY',
        mode: 'deterministic-augmented'
      },
      cloudLifecycle: {
        id: 'cloudLifecycle',
        name: 'Cloud Lifecycle & Discovery',
        status: 'HEALTHY',
        mutationsEnabled: config.awsLifecycleMutationsEnabled === true
      },
      scheduler: {
        id: 'scheduler',
        name: 'Autonomous Operations Scheduler',
        status: 'HEALTHY'
      },
      telemetryPipeline: {
        id: 'telemetryPipeline',
        name: 'Telemetry Ingestion & Drift Pipeline',
        status: deadLetterCount > 100 ? 'DEGRADED' : 'HEALTHY',
        totalIngestedEvents: recentIngestionCount,
        deadLetterQueueCount: deadLetterCount
      }
    };

    return res.status(200).json({
      success: true,
      data: {
        platformStatus,
        timestamp: new Date().toISOString(),
        subsystems,
        runtime: {
          uptimeSeconds: measurements.uptimeSeconds,
          rssBytes: measurements.rssBytes,
          heapUsedBytes: measurements.heapUsedBytes,
          heapLimitBytes: measurements.heapLimitBytes,
          heapUtilizationPercent: measurements.heapUtilizationPercent,
          cpuPercentOfOneCore: measurements.cpuPercentOfOneCore,
          eventLoopP95Ms: measurements.eventLoopP95Ms
        },
        httpPerformance: httpSummary,
        alerts: {
          firingCount: alertsResult.totalFiring,
          resolvedCount: alertsResult.totalResolved,
          items: alertsResult.alerts
        },
        slos: slosResult
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve self-monitoring overview'
    });
  }
}

/**
 * GET /api/self-monitoring/alerts
 * Operational self-alerts with cooldown and firing status.
 */
export async function getAlerts(req, res) {
  try {
    const result = await evaluateSelfAlerts();
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to evaluate self-monitoring alerts'
    });
  }
}

/**
 * GET /api/self-monitoring/slos
 * Platform SLO targets, current attainment, and error budget burn rates.
 */
export async function getSlos(req, res) {
  try {
    const slos = evaluateSelfSlos();
    return res.status(200).json({
      success: true,
      data: {
        slos,
        evaluatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to evaluate platform SLOs'
    });
  }
}

