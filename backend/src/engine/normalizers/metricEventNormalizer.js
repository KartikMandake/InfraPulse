/**
 * Metric Anomaly Event Normalizer
 */
export function normalizeMetricEvent(raw, options = {}) {
  if (!raw) throw new Error('Metric event payload cannot be empty.');
  const metric = raw.metric || raw.metricName;
  if (!metric) throw new Error('Missing required field: metric or metricName');

  const rawTimestamp = raw.timestamp || raw.eventTimestamp || raw.time;
  if (!rawTimestamp) throw new Error('Missing required field: timestamp');
  const eventTimestamp = new Date(rawTimestamp).toISOString();
  if (eventTimestamp === 'Invalid Date') throw new Error(`Invalid event timestamp: ${rawTimestamp}`);

  const serviceId = raw.serviceId || raw.service_id || null;
  const sourceRefId = raw.id || raw.eventId || `${serviceId || 'unknown'}-${metric}-${new Date(eventTimestamp).getTime()}`;

  const currentValue = Number(raw.currentValue ?? raw.value ?? raw.observedValue ?? 0);
  const baselineValue = Number(raw.baselineValue ?? raw.baseline ?? 0);
  const deltaPercent = baselineValue > 0 ? ((currentValue - baselineValue) / baselineValue) * 100 : 0;

  let severity = raw.severity || 'info';
  if (Math.abs(deltaPercent) >= 200 || currentValue > baselineValue * 3) severity = 'critical';
  else if (Math.abs(deltaPercent) >= 50) severity = 'high';
  else if (Math.abs(deltaPercent) >= 20) severity = 'warning';

  return {
    id: `evt-met-${sourceRefId}`,
    eventType: 'metric_anomaly',
    sourceSystem: raw.sourceSystem || 'prometheus_metric_engine',
    sourceRefId: String(sourceRefId),
    tenantId: raw.tenantId || options.tenantId || 'default_tenant',
    serviceId,
    serviceName: raw.serviceName || raw.service_name || serviceId,
    environment: raw.environment || 'production',
    eventTimestamp,
    ingestionTimestamp: new Date().toISOString(),
    severity,
    title: raw.title || `Metric Anomaly: ${metric} shifted to ${currentValue}`,
    summary: raw.summary || `Observed ${metric} = ${currentValue} (baseline: ${baselineValue}, delta: ${deltaPercent.toFixed(1)}%) in service ${serviceId || 'unassigned'}.`,
    correlationIds: Array.isArray(raw.correlationIds) ? raw.correlationIds : (raw.correlationId ? [raw.correlationId] : []),
    relatedIncidentId: raw.relatedIncidentId || raw.incidentId || null,
    relatedDeploymentId: raw.relatedDeploymentId || raw.deploymentId || null,
    telemetryMode: raw.telemetryMode || (raw.isSimulated === false ? 'live' : 'simulated'),
    evidenceQuality: raw.evidenceQuality || 'good',
    normalizedAttributes: {
      metric,
      currentValue,
      baselineValue,
      deltaPercent: Number(deltaPercent.toFixed(2)),
      unit: raw.unit || 'ms',
      threshold: raw.threshold ?? null
    },
    originalSourceRef: {
      rawTimestamp,
      source: raw.source || 'metric_stream',
      rawPayload: raw
    }
  };
}

