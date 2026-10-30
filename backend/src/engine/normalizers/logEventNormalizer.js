/**
 * Log Error Pattern Normalizer
 */
export function normalizeLogEvent(raw, options = {}) {
  if (!raw) throw new Error('Log event payload cannot be empty.');
  const message = raw.message || raw.logMessage || raw.text;
  if (!message) throw new Error('Missing required field: message');

  const rawTimestamp = raw.timestamp || raw.eventTimestamp || raw.time;
  if (!rawTimestamp) throw new Error('Missing required field: timestamp');
  const eventTimestamp = new Date(rawTimestamp).toISOString();
  if (eventTimestamp === 'Invalid Date') throw new Error(`Invalid event timestamp: ${rawTimestamp}`);

  const serviceId = raw.serviceId || raw.service_id || null;
  const sourceRefId = raw.id || raw.logId || `log-${serviceId || 'unknown'}-${new Date(eventTimestamp).getTime()}`;

  let severity = (raw.severity || raw.level || 'info').toLowerCase();
  if (severity === 'fatal' || severity === 'crit' || severity === 'critical') severity = 'critical';
  else if (severity === 'err' || severity === 'error' || severity === 'high') severity = 'high';
  else if (severity === 'warn' || severity === 'warning') severity = 'warning';
  else severity = 'info';

  const correlationIds = [];
  if (raw.correlationId) correlationIds.push(raw.correlationId);
  if (raw.traceId) correlationIds.push(raw.traceId);
  if (Array.isArray(raw.correlationIds)) correlationIds.push(...raw.correlationIds);

  return {
    id: `evt-log-${sourceRefId}`,
    eventType: 'log_error',
    sourceSystem: raw.sourceSystem || 'loki_log_adapter',
    sourceRefId: String(sourceRefId),
    tenantId: raw.tenantId || options.tenantId || 'default_tenant',
    serviceId,
    serviceName: raw.serviceName || raw.service_name || serviceId,
    environment: raw.environment || 'production',
    eventTimestamp,
    ingestionTimestamp: new Date().toISOString(),
    severity,
    title: raw.title || `Log Pattern: ${String(message).slice(0, 80)}`,
    summary: String(message),
    correlationIds: [...new Set(correlationIds)],
    relatedIncidentId: raw.relatedIncidentId || raw.incidentId || null,
    relatedDeploymentId: raw.relatedDeploymentId || raw.deploymentId || null,
    telemetryMode: raw.telemetryMode || (raw.isSimulated === false ? 'live' : 'simulated'),
    evidenceQuality: raw.evidenceQuality || 'good',
    normalizedAttributes: {
      logLevel: raw.level || severity,
      stackTrace: raw.stackTrace || raw.stack || null,
      statusCode: raw.statusCode || raw.status || null,
      pattern: raw.pattern || null
    },
    originalSourceRef: {
      rawTimestamp,
      source: raw.source || 'log_stream',
      rawPayload: raw
    }
  };
}
