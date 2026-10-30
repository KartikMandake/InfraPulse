/**
 * Deployment & Change Event Normalizer
 */
export function normalizeDeploymentEvent(raw, options = {}) {
  if (!raw) throw new Error('Deployment event payload cannot be empty.');
  const changeId = raw.id || raw.changeId || raw.deploymentId;
  if (!changeId) throw new Error('Missing required field: changeId or deploymentId');

  const rawTimestamp = raw.deployedAt || raw.deployed_at || raw.timestamp || raw.eventTimestamp;
  if (!rawTimestamp) throw new Error('Missing required field: deployedAt or timestamp');
  const eventTimestamp = new Date(rawTimestamp).toISOString();
  if (eventTimestamp === 'Invalid Date') throw new Error(`Invalid event timestamp: ${rawTimestamp}`);

  const serviceId = raw.serviceId || raw.service_id || raw.serviceName || null;
  const sourceRefId = changeId;

  const status = raw.status || 'successful';
  let severity = 'info';
  if (status === 'failed' || status === 'unhealthy') severity = 'critical';
  else if (status === 'rolled_back') severity = 'warning';

  const correlationIds = [changeId];
  if (raw.commitSha || raw.commit_sha) correlationIds.push(raw.commitSha || raw.commit_sha);
  if (raw.idempotencyKey || raw.idempotency_key) correlationIds.push(raw.idempotencyKey || raw.idempotency_key);

  const version = raw.newVersion || raw.new_version || raw.version || 'unknown';

  return {
    id: `evt-dep-${sourceRefId}`,
    eventType: 'deployment_change',
    sourceSystem: raw.sourceSystem || 'change_intelligence',
    sourceRefId: String(sourceRefId),
    tenantId: raw.tenantId || options.tenantId || 'default_tenant',
    serviceId,
    serviceName: raw.serviceName || raw.service_name || serviceId,
    environment: raw.environment || 'production',
    eventTimestamp,
    ingestionTimestamp: new Date().toISOString(),
    severity,
    title: raw.title || `Deployment ${version} (${raw.deploymentStrategy || raw.deployment_strategy || 'rolling'})`,
    summary: raw.summary || `Deployed ${version} to service "${serviceId}" in ${raw.environment || 'production'}. Status: ${status}.`,
    correlationIds: [...new Set(correlationIds)],
    relatedIncidentId: raw.relatedIncidentId || null,
    relatedDeploymentId: String(sourceRefId),
    telemetryMode: raw.telemetryMode || (raw.isSimulated === false ? 'live' : 'simulated'),
    evidenceQuality: raw.evidenceQuality || 'good',
    normalizedAttributes: {
      changeId,
      previousVersion: raw.previousVersion || raw.previous_version || null,
      newVersion: version,
      deploymentStrategy: raw.deploymentStrategy || raw.deployment_strategy || 'rolling',
      status,
      commitSha: raw.commitSha || raw.commit_sha || null,
      actor: raw.actor || null,
      changedComponents: raw.changedComponents || raw.changed_components || []
    },
    originalSourceRef: {
      rawTimestamp,
      source: 'change_repository',
      rawPayload: raw
    }
  };
}

