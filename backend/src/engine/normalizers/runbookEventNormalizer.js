/**
 * Runbook Execution Event Normalizer
 */
export function normalizeRunbookEvent(raw, options = {}) {
  if (!raw) throw new Error('Runbook event payload cannot be empty.');
  const executionId = raw.id || raw.executionId;
  if (!executionId) throw new Error('Missing required field: executionId');

  const rawTimestamp = raw.createdAt || raw.created_at || raw.executedAt || raw.timestamp || raw.eventTimestamp;
  if (!rawTimestamp) throw new Error('Missing required field: createdAt or timestamp');
  const eventTimestamp = new Date(rawTimestamp).toISOString();
  if (eventTimestamp === 'Invalid Date') throw new Error(`Invalid event timestamp: ${rawTimestamp}`);

  const serviceId = raw.targetServiceId || raw.target_service_id || raw.serviceId || null;
  const sourceRefId = executionId;
  const status = raw.status || 'DRAFT';

  let severity = 'info';
  if (status === 'FAILED') severity = 'high';
  else if (status === 'APPROVED' || status === 'RUNNING') severity = 'warning';
  else if (status === 'SUCCEEDED') severity = 'info';

  const correlationIds = [executionId];
  if (raw.runbookId || raw.runbook_id) correlationIds.push(raw.runbookId || raw.runbook_id);
  if (raw.incidentId || raw.incident_id) correlationIds.push(raw.incidentId || raw.incident_id);

  return {
    id: `evt-rb-${sourceRefId}`,
    eventType: 'runbook_execution',
    sourceSystem: raw.sourceSystem || 'runbook_orchestrator',
    sourceRefId: String(sourceRefId),
    tenantId: raw.tenantId || options.tenantId || 'default_tenant',
    serviceId,
    serviceName: raw.serviceName || raw.service_name || serviceId,
    environment: raw.environment || 'production',
    eventTimestamp,
    ingestionTimestamp: new Date().toISOString(),
    severity,
    title: raw.title || `Runbook ${raw.runbookId || 'RB'}: ${status}`,
    summary: raw.summary || `Runbook execution ${executionId} (${raw.executionMode || 'diagnostic'}) on service "${serviceId}" status: ${status}.`,
    correlationIds: [...new Set(correlationIds)],
    relatedIncidentId: raw.incidentId || raw.incident_id || null,
    relatedDeploymentId: null,
    telemetryMode: raw.telemetryMode || (raw.isSimulated === false ? 'live' : 'simulated'),
    evidenceQuality: raw.evidenceQuality || 'good',
    normalizedAttributes: {
      executionId,
      runbookId: raw.runbookId || raw.runbook_id || null,
      status,
      executionMode: raw.executionMode || raw.execution_mode || 'diagnostic',
      riskLevel: raw.riskLevel || raw.risk_level || 'low',
      preconditionsMet: raw.preconditionsMet ?? true
    },
    originalSourceRef: {
      rawTimestamp,
      source: 'runbook_executions',
      rawPayload: raw
    }
  };
}

