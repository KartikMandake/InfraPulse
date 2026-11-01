/**
 * Distributed Trace Anomaly Normalizer
 */
export function normalizeTraceEvent(raw, options = {}) {
  if (!raw) throw new Error('Trace event payload cannot be empty.');
  const traceId = raw.traceId || raw.trace_id;
  if (!traceId) throw new Error('Missing required field: traceId');

  const rawTimestamp = raw.timestamp || raw.eventTimestamp || raw.startTime || raw.time;
  if (!rawTimestamp) throw new Error('Missing required field: timestamp');
  const eventTimestamp = new Date(rawTimestamp).toISOString();
  if (eventTimestamp === 'Invalid Date') throw new Error(`Invalid event timestamp: ${rawTimestamp}`);

  const serviceId = raw.serviceId || raw.service_id || raw.rootService || null;
  const sourceRefId = raw.id || raw.spanId || traceId;

  const durationMs = Number(raw.durationMs ?? raw.duration ?? 0);
  const isError = raw.status === 'ERROR' || raw.error === true || raw.httpStatusCode >= 500;

  let severity = 'info';
  if (isError && durationMs > 500) severity = 'critical';
  else if (isError || durationMs > 1000) severity = 'high';
  else if (durationMs > 250) severity = 'warning';

  const correlationIds = [traceId];
  if (raw.correlationId) correlationIds.push(raw.correlationId);
  if (Array.isArray(raw.correlationIds)) correlationIds.push(...raw.correlationIds);

  return {
    id: `evt-trc-${sourceRefId}`,
    eventType: 'trace_anomaly',
    sourceSystem: raw.sourceSystem || 'tempo_trace_collector',
    sourceRefId: String(sourceRefId),
    tenantId: raw.tenantId || options.tenantId || 'default_tenant',
    serviceId,
    serviceName: raw.serviceName || raw.service_name || serviceId,
    environment: raw.environment || 'production',
    eventTimestamp,
    ingestionTimestamp: new Date().toISOString(),
    severity,
    title: raw.title || `Trace ${traceId.slice(0, 8)}: ${durationMs}ms (${isError ? 'FAILED' : 'DEGRADED'})`,
    summary: raw.summary || `Trace span stalled for ${durationMs}ms in service "${serviceId}". Error state: ${isError ? 'true' : 'false'}.`,
    correlationIds: [...new Set(correlationIds)],
    relatedIncidentId: raw.relatedIncidentId || raw.incidentId || null,
    relatedDeploymentId: raw.relatedDeploymentId || raw.deploymentId || null,
    telemetryMode: raw.telemetryMode || (raw.isSimulated === false ? 'live' : 'simulated'),
    evidenceQuality: raw.evidenceQuality || 'good',
    normalizedAttributes: {
      traceId,
      spanId: raw.spanId || null,
      parentSpanId:raw.parentSpanId||raw.normalizedAttributes?.parentSpanId||null,
      durationMs,
      isError,
      httpStatusCode: raw.httpStatusCode || null,
      endpoint: raw.endpoint || raw.path || null,
      stalledSpan: raw.stalledSpan || null
    },
    originalSourceRef: {
      rawTimestamp,
      source: raw.source || 'trace_collector',
      rawPayload: raw
    }
  };
}

