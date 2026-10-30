import { config } from '../../config/env.js';
import { getDatasourcesStatus } from './status.adapter.js';
import { queryPrometheus } from './metrics.adapter.js';
import { queryTempoTrace } from './traces.adapter.js';
import { queryLokiLogs } from './logs.adapter.js';
import { getTelemetryLogs, getTelemetryTraces } from '../../data/telemetry.js';

let currentMode = config.telemetryMode || 'demo'; // 'demo' | 'live'

export function getTelemetryMode() {
  return currentMode;
}

export function setTelemetryMode(mode) {
  if (mode !== 'demo' && mode !== 'live') {
    throw new Error('Invalid mode. Allowed values: "demo" or "live".');
  }
  currentMode = mode;
  return currentMode;
}

/**
 * Returns datasource status across all telemetry layers.
 */
export async function getStatus() {
  const status = await getDatasourcesStatus();
  return {
    ...status,
    activeMode: currentMode
  };
}

/**
 * Returns metrics either from Prometheus (live mode) or normalized mock baseline (demo mode).
 */
export async function getMetrics(query) {
  if (currentMode === 'live') {
    return queryPrometheus(query || 'up');
  }

  // Demo mode: Return structured mock signals
  return {
    source: 'mock_demo',
    query: query || 'mock_baseline',
    resultType: 'vector',
    result: [
      {
        metric: { __name__: 'http_requests_total', service: 'payment-service', status: '504' },
        value: [Date.now() / 1000, '760']
      },
      {
        metric: { __name__: 'hikaricp_active_connections', service: 'payment-service' },
        value: [Date.now() / 1000, '100']
      },
      {
        metric: { __name__: 'p99_latency_ms', service: 'payment-service' },
        value: [Date.now() / 1000, '412']
      }
    ]
  };
}

/**
 * Returns traces either from Tempo (live mode) or normalized mock traces (demo mode).
 */
export async function getTraces(traceId, service) {
  if (currentMode === 'live' && traceId) {
    return queryTempoTrace(traceId);
  }

  let traces = getTelemetryTraces();
  if (service) {
    traces = traces.filter(t => t.service === service);
  }
  if (traceId) {
    traces = traces.filter(t => t.traceId === traceId);
  }

  return {
    source: currentMode === 'live' ? 'tempo_fallback' : 'mock_demo',
    totalTraces: traces.length,
    traces
  };
}

/**
 * Returns logs either from Loki (live mode) or normalized mock logs (demo mode).
 */
export async function getLogs(query, service) {
  if (currentMode === 'live' && query) {
    return queryLokiLogs(query);
  }

  let logs = getTelemetryLogs();
  if (service) {
    logs = logs.filter(l => l.serviceId === service || l.service === service);
  }

  return {
    source: currentMode === 'live' ? 'loki_fallback' : 'mock_demo',
    totalLogs: logs.length,
    logs
  };
}

