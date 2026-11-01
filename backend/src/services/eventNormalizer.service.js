import crypto from 'node:crypto';
import {tenantContext} from '../security/tenantContext.js';
import * as eventsRepo from '../repositories/events.repository.js';
import { normalizeMetricEvent } from '../engine/normalizers/metricEventNormalizer.js';
import { normalizeLogEvent } from '../engine/normalizers/logEventNormalizer.js';
import { normalizeTraceEvent } from '../engine/normalizers/traceEventNormalizer.js';
import { normalizeAlertEvent } from '../engine/normalizers/alertEventNormalizer.js';
import { normalizeIncidentEvent } from '../engine/normalizers/incidentEventNormalizer.js';
import { normalizeDeploymentEvent } from '../engine/normalizers/deploymentEventNormalizer.js';
import { normalizeSloEvent } from '../engine/normalizers/sloEventNormalizer.js';
import { normalizeRunbookEvent } from '../engine/normalizers/runbookEventNormalizer.js';

export function normalizeEventPayload(raw, options = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Event payload must be a non-null object.');
  }

  const type = (raw.eventType || raw.type || '').toLowerCase();

  if (type === 'metric_anomaly' || raw.metric || raw.metricName) {
    return normalizeMetricEvent(raw, options);
  }
  if (type === 'log_error' || raw.logMessage || (raw.level && raw.message)) {
    return normalizeLogEvent(raw, options);
  }
  if (type === 'trace_anomaly' || raw.traceId || raw.trace_id) {
    return normalizeTraceEvent(raw, options);
  }
  if (type === 'alert_transition' || raw.ruleId || raw.alertId || raw.state === 'firing') {
    return normalizeAlertEvent(raw, options);
  }
  if (type === 'incident_transition' || (raw.id && String(raw.id).startsWith('INC-')) || raw.leadRole) {
    return normalizeIncidentEvent(raw, options);
  }
  if (type === 'deployment_change' || raw.deploymentStrategy || raw.commitSha || raw.newVersion) {
    return normalizeDeploymentEvent(raw, options);
  }
  if (type === 'slo_event' || raw.sloId || raw.sliValue !== undefined || raw.burnRate1h !== undefined) {
    return normalizeSloEvent(raw, options);
  }
  if (type === 'runbook_execution' || raw.executionMode || raw.runbookId) {
    return normalizeRunbookEvent(raw, options);
  }

  // Fallback: If unknown type but has timestamp and title, wrap canonically
  const rawTimestamp = raw.timestamp || raw.eventTimestamp || raw.time;
  if (!rawTimestamp) throw new Error('Cannot normalize event: Missing required event timestamp and recognized event fields.');

  const eventTimestamp = new Date(rawTimestamp).toISOString();
  if (eventTimestamp === 'Invalid Date') throw new Error(`Invalid event timestamp: ${rawTimestamp}`);

  const sourceRefId = raw.sourceRefId || raw.source_ref_id || raw.id || crypto.randomUUID();
  return {
    id: raw.id || `evt-gen-${sourceRefId}`,
    eventType: raw.eventType || type || 'generic_observability',
    sourceSystem: raw.sourceSystem || 'generic_adapter',
    sourceRefId: String(sourceRefId),
    tenantId: raw.tenantId || options.tenantId || 'default_tenant',
    serviceId: raw.serviceId || raw.service_id || null,
    serviceName: raw.serviceName || raw.service_name || raw.serviceId || null,
    environment: raw.environment || 'production',
    eventTimestamp,
    ingestionTimestamp: new Date().toISOString(),
    severity: raw.severity || 'info',
    title: raw.title || 'Observability Event',
    summary: raw.summary || raw.message || 'Generic observability signal recorded.',
    correlationIds: Array.isArray(raw.correlationIds) ? raw.correlationIds : [],
    relatedIncidentId: raw.relatedIncidentId || null,
    relatedDeploymentId: raw.relatedDeploymentId || null,
    telemetryMode: raw.telemetryMode || (raw.isSimulated === false ? 'live' : 'simulated'),
    evidenceQuality: raw.evidenceQuality || 'good',
    normalizedAttributes: raw.normalizedAttributes || raw.attributes || {},
    originalSourceRef: raw.originalSourceRef || { rawPayload: raw }
  };
}

export async function ingestEvent(raw, options = {}) {
  try {
    const normalized = normalizeEventPayload(raw, options);
    normalized.tenantId=tenantContext()?.tenantId||options.tenantId||normalized.tenantId||'default_tenant';
    normalized.normalizedAttributes={...(raw.normalizedAttributes||{}),...(normalized.normalizedAttributes||{})};
    normalized.sourceRefId=String(raw.sourceRefId||normalized.sourceRefId);
    normalized.id='evt-'+crypto.createHash('sha256').update(JSON.stringify([normalized.tenantId,normalized.environment,normalized.sourceSystem,normalized.eventType,normalized.sourceRefId])).digest('hex').slice(0,56);
    const saved = await eventsRepo.insertNormalizedEvent(normalized);
    return { success: true, event: saved };
  } catch (err) {
    const failureId = `fail-${crypto.randomUUID().substring(0, 8)}`;
    await eventsRepo.recordNormalizationFailure({
      id: failureId,
      sourceSystem: raw?.sourceSystem || 'unknown',
      rawPayload: raw,
      errorReason: err.message,
      tenantId: raw?.tenantId || options.tenantId || 'default_tenant'
    }).catch(() => {});

    return { success: false, error: err.message, failureId };
  }
}

export async function ingestBatch(events = [], options = {}) {
  if (!Array.isArray(events)) {
    throw new Error('Events payload must be an array.');
  }

  const results = {
    total: events.length,
    succeededCount: 0,
    failedCount: 0,
    events: [],
    errors: []
  };

  for (const raw of events) {
    const res = await ingestEvent(raw, options);
    if (res.success) {
      results.succeededCount += 1;
      results.events.push(res.event);
    } else {
      results.failedCount += 1;
      results.errors.push({ error: res.error, failureId: res.failureId });
    }
  }

  return results;
}

