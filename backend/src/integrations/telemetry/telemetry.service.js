import {tenantContext} from '../../security/tenantContext.js';
import {query as databaseQuery} from '../../db/connection.js';
import { config } from '../../config/env.js';
import { getDatasourcesStatus } from './status.adapter.js';
import { queryPrometheus } from './metrics.adapter.js';
import { queryTempoTrace } from './traces.adapter.js';
import { queryLokiLogs } from './logs.adapter.js';
import { getTelemetryLogs, getTelemetryTraces } from '../../data/telemetry.js';

const tenantModes=new Map();
let currentMode = config.telemetryMode || 'demo'; // 'demo' | 'live'

export function getTelemetryMode() {
  return tenantContext()?tenantModes.get(tenantContext().tenantId)||config.telemetryMode:currentMode;
}

export function setTelemetryMode(mode) {
  if (mode !== 'demo' && mode !== 'live') {
    throw new Error('Invalid mode. Allowed values: "demo" or "live".');
  }
  if(tenantContext()){tenantModes.set(tenantContext().tenantId,mode);return mode;}
  currentMode = mode;
  return currentMode;
}

/**
 * Returns datasource status across all telemetry layers.
 */
export async function getStatus() {
  if(tenantContext())return {activeMode:getTelemetryMode(),source:'tenant_canonical_events'};
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
  if(tenantContext()){const {rows}=await databaseQuery("SELECT service_id,event_timestamp,normalized_attributes FROM normalized_events WHERE event_type='metric_anomaly' ORDER BY event_timestamp DESC LIMIT 1000");return {source:'tenant_canonical_events',query:query||'',resultType:'vector',result:rows.map(r=>({metric:{__name__:r.normalized_attributes.metric,service:r.service_id},value:[new Date(r.event_timestamp).getTime()/1000,String(r.normalized_attributes.currentValue)]}))};}
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
  if(tenantContext()){const {rows}=await databaseQuery("SELECT id,service_id,event_timestamp,normalized_attributes FROM normalized_events WHERE event_type='trace_anomaly' AND ($1::text IS NULL OR service_id=$1) AND ($2::text IS NULL OR normalized_attributes->>'traceId'=$2) ORDER BY event_timestamp DESC LIMIT 1000",[service||null,traceId||null]);const traces=rows.map(r=>({...r.normalized_attributes,id:r.id,service:r.service_id,serviceId:r.service_id,parentId:r.normalized_attributes.parentSpanId,status:r.normalized_attributes.hasError?'error':'ok',timestamp:r.event_timestamp}));return {source:'tenant_canonical_events',totalTraces:traces.length,traces};}
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
  if(tenantContext()){const {rows}=await databaseQuery("SELECT id,service_id,event_timestamp,summary,severity,normalized_attributes FROM normalized_events WHERE event_type='log_error' AND ($1::text IS NULL OR service_id=$1) ORDER BY event_timestamp DESC LIMIT 1000",[service||null]);const logs=rows.map(r=>({...r.normalized_attributes,id:r.id,service:r.service_id,serviceId:r.service_id,timestamp:r.event_timestamp,message:r.summary,level:String(r.normalized_attributes.severityText||r.normalized_attributes.logLevel||(['high','critical'].includes(r.severity)?'ERROR':'INFO')).toUpperCase()}));return {source:'tenant_canonical_events',totalLogs:logs.length,logs};}
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

