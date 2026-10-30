/**
 * SLO Breach & Error-Budget Event Normalizer
 */
export function normalizeSloEvent(raw, options = {}) {
  if (!raw) throw new Error('SLO event payload cannot be empty.');
  const sloId = raw.sloId || raw.slo_id || raw.id;
  if (!sloId) throw new Error('Missing required field: sloId');

  const rawTimestamp = raw.evaluatedAt || raw.evaluated_at || raw.timestamp || raw.eventTimestamp;
  if (!rawTimestamp) throw new Error('Missing required field: evaluatedAt or timestamp');
  const eventTimestamp = new Date(rawTimestamp).toISOString();
  if (eventTimestamp === 'Invalid Date') throw new Error(`Invalid event timestamp: ${rawTimestamp}`);

  const serviceId = raw.serviceId || raw.service_id || null;
  const status = raw.status || 'nominal';
  const sourceRefId = raw.id || `${sloId}-${new Date(eventTimestamp).getTime()}`;

  let severity = 'info';
  if (status === 'breached') severity = 'critical';
  else if (status === 'burn_warning') severity = 'high';

  const correlationIds = [sloId];
  if (raw.alertPolicyId) correlationIds.push(raw.alertPolicyId);

  const burnRate = Number(raw.burnRate1h || raw.burn_rate_1h || raw.burnRate || 1.0);
  const remainingBudget = Number(raw.remainingBudgetPercent || raw.remaining_budget_percent || 100.0);

  return {
    id: `evt-slo-${sourceRefId}`,
    eventType: 'slo_event',
    sourceSystem: raw.sourceSystem || 'slo_engine',
    sourceRefId: String(sourceRefId),
    tenantId: raw.tenantId || options.tenantId || 'default_tenant',
    serviceId,
    serviceName: raw.serviceName || raw.service_name || serviceId,
    environment: raw.environment || 'production',
    eventTimestamp,
    ingestionTimestamp: new Date().toISOString(),
    severity,
    title: raw.title || `SLO ${status.toUpperCase()}: ${sloId}`,
    summary: raw.summary || `SLO "${sloId}" for service "${serviceId}" entered status ${status}. Remaining budget: ${remainingBudget.toFixed(1)}%, 1h burn rate: ${burnRate.toFixed(1)}x.`,
    correlationIds: [...new Set(correlationIds)],
    relatedIncidentId: raw.relatedIncidentId || null,
    relatedDeploymentId: raw.relatedDeploymentId || null,
    telemetryMode: raw.telemetryMode || (raw.isSimulated === false ? 'live' : 'simulated'),
    evidenceQuality: raw.evidenceQuality || (raw.dataQuality || 'good'),
    normalizedAttributes: {
      sloId,
      status,
      burnRate1h: burnRate,
      remainingBudgetPercent: remainingBudget,
      budgetConsumedPercent: Number(raw.budgetConsumedPercent || raw.budget_consumed_percent || 0),
      sliValue: raw.sliValue !== undefined ? raw.sliValue : null,
      targetPercent: raw.targetPercent || null
    },
    originalSourceRef: {
      rawTimestamp,
      source: 'slo_evaluations',
      rawPayload: raw
    }
  };
}

