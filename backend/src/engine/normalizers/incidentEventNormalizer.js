/**
 * Incident Lifecycle Transition Normalizer
 */
export function normalizeIncidentEvent(raw, options = {}) {
  if (!raw) throw new Error('Incident event payload cannot be empty.');
  const incidentId = raw.id || raw.incidentId;
  if (!incidentId) throw new Error('Missing required field: incident id');

  const rawTimestamp = raw.startedAt || raw.timestamp || raw.eventTimestamp || raw.time || raw.createdAt;
  if (!rawTimestamp) throw new Error('Missing required field: startedAt or timestamp');
  const eventTimestamp = new Date(rawTimestamp).toISOString();
  if (eventTimestamp === 'Invalid Date') throw new Error(`Invalid event timestamp: ${rawTimestamp}`);

  const serviceId = raw.serviceId || raw.service_id || null;
  const sourceRefId = incidentId;

  const rawSev = (raw.severity || 'SEV-2').toUpperCase();
  let severity = 'high';
  if (rawSev === 'SEV-1' || rawSev === 'CRITICAL') severity = 'critical';
  else if (rawSev === 'SEV-2' || rawSev === 'HIGH') severity = 'high';
  else if (rawSev === 'SEV-3' || rawSev === 'WARNING') severity = 'warning';
  else severity = 'info';

  const correlationIds = [incidentId];
  if (raw.channel) correlationIds.push(raw.channel);

  return {
    id: `evt-inc-${sourceRefId}`,
    eventType: 'incident_transition',
    sourceSystem: raw.sourceSystem || 'incident_engine',
    sourceRefId: String(sourceRefId),
    tenantId: raw.tenantId || options.tenantId || 'default_tenant',
    serviceId,
    serviceName: raw.serviceName || raw.service_name || serviceId,
    environment: raw.environment || 'production',
    eventTimestamp,
    ingestionTimestamp: new Date().toISOString(),
    severity,
    title: raw.title || `Incident ${incidentId}: ${raw.severity || 'SEV-2'} Declared`,
    summary: raw.summary || `Incident ${incidentId} declared on service "${serviceId}". Status: ${raw.status || 'investigating'}.`,
    correlationIds: [...new Set(correlationIds)],
    relatedIncidentId: incidentId,
    relatedDeploymentId: raw.canaryVersion || raw.relatedDeploymentId || null,
    telemetryMode: raw.telemetryMode || (raw.isSimulated === false ? 'live' : 'simulated'),
    evidenceQuality: raw.evidenceQuality || 'good',
    normalizedAttributes: {
      incidentId,
      status: raw.status || 'investigating',
      severity: raw.severity || 'SEV-2',
      lead: raw.lead || null,
      sloBreached: Boolean(raw.sloBreached),
      sloCurrent: raw.sloCurrent || null,
      aiConfidencePercent: raw.aiConfidencePercent || null
    },
    originalSourceRef: {
      rawTimestamp,
      source: 'incidents_repository',
      rawPayload: raw
    }
  };
}

