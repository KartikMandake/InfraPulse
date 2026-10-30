/**
 * Alert Lifecycle Transition Normalizer
 */
export function normalizeAlertEvent(raw, options = {}) {
  if (!raw) throw new Error('Alert event payload cannot be empty.');
  const alertId = raw.id || raw.alertId;
  if (!alertId) throw new Error('Missing required field: alert id');

  const rawTimestamp = raw.firedAt || raw.triggeredAt || raw.timestamp || raw.eventTimestamp;
  if (!rawTimestamp) throw new Error('Missing required field: firedAt or timestamp');
  const eventTimestamp = new Date(rawTimestamp).toISOString();
  if (eventTimestamp === 'Invalid Date') throw new Error(`Invalid event timestamp: ${rawTimestamp}`);

  const serviceId = raw.serviceId || raw.service_id || null;
  const sourceRefId = alertId;

  let severity = (raw.severity || 'warning').toLowerCase();
  if (!['critical', 'high', 'warning', 'info'].includes(severity)) severity = 'warning';

  const correlationIds = [];
  if (raw.incidentId || raw.incident_id) correlationIds.push(raw.incidentId || raw.incident_id);
  if (raw.ruleId || raw.rule_id) correlationIds.push(`rule-${raw.ruleId || raw.rule_id}`);

  return {
    id: `evt-alt-${sourceRefId}`,
    eventType: 'alert_transition',
    sourceSystem: raw.sourceSystem || 'alert_manager',
    sourceRefId: String(sourceRefId),
    tenantId: raw.tenantId || options.tenantId || 'default_tenant',
    serviceId,
    serviceName: raw.serviceName || raw.service_name || serviceId,
    environment: raw.environment || 'production',
    eventTimestamp,
    ingestionTimestamp: new Date().toISOString(),
    severity,
    title: raw.title || `Alert: ${raw.metric || 'Rule'} Threshold Breach`,
    summary: raw.summary || `Alert "${raw.title || alertId}" is ${raw.state || raw.status || 'firing'} on service "${serviceId}".`,
    correlationIds: [...new Set(correlationIds)],
    relatedIncidentId: raw.incidentId || raw.incident_id || null,
    relatedDeploymentId: raw.relatedDeploymentId || null,
    telemetryMode: raw.telemetryMode || (raw.isSimulated === false ? 'live' : 'simulated'),
    evidenceQuality: raw.evidenceQuality || 'good',
    normalizedAttributes: {
      alertId,
      ruleId: raw.ruleId || raw.rule_id || null,
      metric: raw.metric || null,
      operator: raw.operator || '>',
      threshold: raw.threshold || null,
      currentValue: raw.currentValue || raw.current_value || null,
      status: raw.status || 'active',
      state: raw.state || 'firing'
    },
    originalSourceRef: {
      rawTimestamp,
      source: 'alert_repository',
      rawPayload: raw
    }
  };
}

