import fs from 'node:fs';
import { observationSettings } from '../observability/settings.js';
import { window, heartbeatAge, queueGauge } from '../observability/metrics.js';
import { getPoolStats, query } from '../db/connection.js';
import { config } from '../config/env.js';

// In-memory state for self-monitoring operational alerts
const alertStates = new Map();

export function getWorkerHeartbeatInfo() {
  if (config.workerHealthFile && fs.existsSync(config.workerHealthFile)) {
    try {
      const content = fs.readFileSync(config.workerHealthFile, 'utf8');
      const state = JSON.parse(content);
      const at = Number(state.at);
      const ageMs = Number.isFinite(at) ? Math.max(0, Date.now() - at) : null;
      return {
        healthy: state.healthy === true,
        pid: state.pid || null,
        ageMs,
        ageSeconds: ageMs !== null ? Math.round(ageMs / 1000) : null
      };
    } catch {
      return { healthy: false, pid: null, ageMs: null, ageSeconds: null };
    }
  }
  return { healthy: true, pid: process.pid, ageMs: 0, ageSeconds: 0 };
}

/**
 * Evaluates internal operational alerts for InfraPulse platform components.
 */
export async function evaluateSelfAlerts(customSettings) {
  const settings = customSettings || observationSettings();
  const now = Date.now();
  const httpSummary = window.summary('http');
  const poolStats = getPoolStats();
  const maxPool = config.db?.max || 10;
  const activeRatio = (poolStats.activeCount / maxPool) * 100;
  const workerInfo = getWorkerHeartbeatInfo();

  let deadLetterCount = 0;
  let pendingNotificationCount = 0;
  try {
    const dlRes = await query('SELECT COUNT(*) FROM telemetry_dead_letter;');
    deadLetterCount = parseInt(dlRes.rows[0]?.count || '0', 10);
  } catch {}

  try {
    const notifRes = await query("SELECT COUNT(*) FROM notification_deliveries WHERE status = 'pending';");
    pendingNotificationCount = parseInt(notifRes.rows[0]?.count || '0', 10);
    try { queueGauge.set({ state: 'pending' }, pendingNotificationCount); } catch {}
  } catch {}

  // 1. Backend 5xx Error Rate Surge
  const errorPercent = httpSummary.errorPercent ?? 0;
  const errorSurgeFiring = (httpSummary.total >= settings.minEvents) && (errorPercent >= settings.errorRate);

  // 2. High API Latency P95
  const p95Latency = httpSummary.p95Ms ?? 0;
  const latencyFiring = (httpSummary.total >= settings.minEvents) && (p95Latency >= settings.latencyMs);

  // 3. PostgreSQL Pool Exhaustion
  const poolFiring = activeRatio >= settings.heapPercent || poolStats.waitingCount > 0;

  // 4. Worker Heartbeat Lost
  const heartbeatAgeMs = workerInfo.ageMs ?? 0;
  const heartbeatFiring = !workerInfo.healthy || heartbeatAgeMs >= settings.heartbeatMaxMs;

  // 5. Notification Queue Backlog
  const queueFiring = pendingNotificationCount >= settings.queueLimit;

  // 6. Telemetry Dead-Letter Queue Surge
  const deadLetterFiring = deadLetterCount >= 100;

  const rawAlerts = [
    {
      id: 'backend_5xx_surge',
      title: 'Backend 5xx Error Rate Surge',
      subsystem: 'backend',
      severity: 'CRITICAL',
      firing: errorSurgeFiring,
      currentValue: `${errorPercent.toFixed(2)}%`,
      threshold: `>= ${settings.errorRate}% (sample size ${settings.minEvents})`,
      message: errorSurgeFiring
        ? `Backend HTTP 5xx error rate (${errorPercent.toFixed(2)}%) exceeds threshold of ${settings.errorRate}% across ${httpSummary.total} requests.`
        : `Backend HTTP error rate (${errorPercent.toFixed(2)}%) is within normal operational limits.`
    },
    {
      id: 'high_api_latency',
      title: 'High API P95 Latency',
      subsystem: 'backend',
      severity: 'WARNING',
      firing: latencyFiring,
      currentValue: `${p95Latency}ms`,
      threshold: `>= ${settings.latencyMs}ms`,
      message: latencyFiring
        ? `API P95 response latency (${p95Latency}ms) exceeds the configured SLO target of ${settings.latencyMs}ms.`
        : `API P95 latency (${p95Latency}ms) is performing within targets.`
    },
    {
      id: 'database_pool_exhaustion',
      title: 'Database Connection Pool Exhaustion',
      subsystem: 'database',
      severity: 'CRITICAL',
      firing: poolFiring,
      currentValue: `${activeRatio.toFixed(1)}% active (${poolStats.waitingCount} waiting)`,
      threshold: `>= ${settings.heapPercent}% active or waiting > 0`,
      message: poolFiring
        ? `Database connection pool is near exhaustion (${poolStats.activeCount}/${maxPool} connections active, ${poolStats.waitingCount} waiting).`
        : `Database connection pool healthy (${poolStats.activeCount}/${maxPool} active, ${poolStats.idleCount} idle).`
    },
    {
      id: 'worker_heartbeat_lost',
      title: 'Notification Worker Heartbeat Lost',
      subsystem: 'worker',
      severity: 'CRITICAL',
      firing: heartbeatFiring,
      currentValue: `${Math.round(heartbeatAgeMs / 1000)}s age`,
      threshold: `>= ${Math.round(settings.heartbeatMaxMs / 1000)}s`,
      message: heartbeatFiring
        ? `Background worker heartbeat missed (${Math.round(heartbeatAgeMs / 1000)}s elapsed since last pulse). Worker may be unresponsive.`
        : `Background worker is actively dispatching and heartbeating normally.`
    },
    {
      id: 'notification_queue_growth',
      title: 'Notification Queue Stalled / Growth',
      subsystem: 'notifications',
      severity: 'WARNING',
      firing: queueFiring,
      currentValue: `${pendingNotificationCount} pending`,
      threshold: `>= ${settings.queueLimit} items`,
      message: queueFiring
        ? `Notification queue backlog (${pendingNotificationCount} pending items) exceeds backlog threshold of ${settings.queueLimit}.`
        : `Notification delivery queue is draining cleanly.`
    },
    {
      id: 'telemetry_dead_letter_surge',
      title: 'Telemetry Pipeline Dead-Letter Backlog',
      subsystem: 'telemetry',
      severity: 'WARNING',
      firing: deadLetterFiring,
      currentValue: `${deadLetterCount} dead letters`,
      threshold: '>= 100 items',
      message: deadLetterFiring
        ? `Telemetry dead-letter queue has accumulated ${deadLetterCount} unparseable or rejected records.`
        : `Telemetry pipeline ingestion is healthy with negligible rejected payloads.`
    }
  ];

  const processedAlerts = rawAlerts.map(alert => {
    let state = alertStates.get(alert.id);
    if (!state) {
      state = {
        status: alert.firing ? 'FIRING' : 'HEALTHY',
        firstTriggeredAt: alert.firing ? new Date(now).toISOString() : null,
        lastTriggeredAt: alert.firing ? new Date(now).toISOString() : null,
        resolvedAt: !alert.firing ? new Date(now).toISOString() : null,
        cooldownUntil: 0
      };
      alertStates.set(alert.id, state);
    } else {
      if (alert.firing) {
        if (state.status !== 'FIRING') {
          state.status = 'FIRING';
          state.firstTriggeredAt = new Date(now).toISOString();
        }
        state.lastTriggeredAt = new Date(now).toISOString();
        state.cooldownUntil = now + settings.cooldownMs;
      } else {
        if (state.status === 'FIRING') {
          state.status = 'RESOLVED';
          state.resolvedAt = new Date(now).toISOString();
        }
      }
    }

    return {
      id: alert.id,
      title: alert.title,
      subsystem: alert.subsystem,
      severity: alert.severity,
      status: state.status,
      currentValue: alert.currentValue,
      threshold: alert.threshold,
      message: alert.message,
      firstTriggeredAt: state.firstTriggeredAt,
      lastTriggeredAt: state.lastTriggeredAt,
      resolvedAt: state.resolvedAt,
      cooldownActive: now < state.cooldownUntil
    };
  });

  const firingCount = processedAlerts.filter(a => a.status === 'FIRING').length;
  const resolvedCount = processedAlerts.filter(a => a.status === 'RESOLVED').length;

  return {
    alerts: processedAlerts,
    totalFiring: firingCount,
    totalResolved: resolvedCount,
    evaluatedAt: new Date(now).toISOString()
  };
}

/**
 * Calculates platform SLO compliance and error-budget burn rates.
 */
export function evaluateSelfSlos(customSettings) {
  const settings = customSettings || observationSettings();
  const httpSummary = window.summary('http');
  const dbSummary = window.summary('db.query');
  const workerSummary = window.summary('worker.batch');

  // API Availability SLO (Target: 99.9%)
  const apiTotal = httpSummary.total;
  const apiFailed = httpSummary.failed;
  const apiAttainment = apiTotal === 0 ? 100 : Number(((apiTotal - apiFailed) / apiTotal * 100).toFixed(3));
  const allowedApiErrorRate = 100 - settings.targetPercent; // 0.1%
  const currentApiErrorRate = 100 - apiAttainment;
  const apiBudgetRemainingPercent = Math.max(0, Math.min(100, Number(((1 - (currentApiErrorRate / allowedApiErrorRate)) * 100).toFixed(2))));
  const apiBurnRate = Number((currentApiErrorRate / (allowedApiErrorRate || 0.001)).toFixed(2));

  // API Latency SLO (Target: 95% requests <= settings.latencyMs)
  const p95Latency = httpSummary.p95Ms ?? 0;
  const latencyCompliant = p95Latency <= settings.latencyMs;

  // DB Query Reliability SLO (Target: 99.9%)
  const dbTotal = dbSummary.total;
  const dbFailed = dbSummary.failed;
  const dbAttainment = dbTotal === 0 ? 100 : Number(((dbTotal - dbFailed) / dbTotal * 100).toFixed(3));

  // Worker Reliability SLO (Target: 99.5%)
  const workerTotal = workerSummary.total;
  const workerFailed = workerSummary.failed;
  const workerAttainment = workerTotal === 0 ? 100 : Number(((workerTotal - workerFailed) / workerTotal * 100).toFixed(3));

  return [
    {
      id: 'slo_api_availability',
      name: 'Core API Availability',
      targetPercent: settings.targetPercent,
      currentAttainmentPercent: apiAttainment,
      errorBudgetRemainingPercent: apiBudgetRemainingPercent,
      burnRate: apiBurnRate,
      status: apiAttainment >= settings.targetPercent ? 'COMPLIANT' : 'BREACHED',
      window: '5-minute rolling window',
      totalRequests: apiTotal,
      failedRequests: apiFailed
    },
    {
      id: 'slo_api_latency',
      name: 'Core API Latency P95',
      targetPercent: 95.0,
      targetThresholdMs: settings.latencyMs,
      currentValueMs: p95Latency,
      status: latencyCompliant ? 'COMPLIANT' : 'DEGRADED',
      window: '5-minute rolling window'
    },
    {
      id: 'slo_database_reliability',
      name: 'PostgreSQL Query Reliability',
      targetPercent: 99.9,
      currentAttainmentPercent: dbAttainment,
      status: dbAttainment >= 99.9 ? 'COMPLIANT' : 'BREACHED',
      window: '5-minute rolling window',
      totalQueries: dbTotal,
      failedQueries: dbFailed
    },
    {
      id: 'slo_worker_reliability',
      name: 'Background Dispatch Reliability',
      targetPercent: 99.5,
      currentAttainmentPercent: workerAttainment,
      status: workerAttainment >= 99.5 ? 'COMPLIANT' : 'BREACHED',
      window: '5-minute rolling window',
      totalBatches: workerTotal,
      failedBatches: workerFailed
    }
  ];
}

