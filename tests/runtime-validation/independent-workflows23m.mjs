import http from 'node:http';
import { api, login, client, save } from './independent23m.mjs';
const results = [];
const db = client(); await db.connect();
const admin = await login('admin'), responder = await login('responder'), viewer = await login('viewer');
async function record(name, fn) {
  try { const data = await fn(); results.push({ name, ...data }); }
  catch (e) { results.push({ name, error: e.message, stack: e.stack }); }
  save('workflows.json', results); console.log(name, results.at(-1).error || 'recorded');
}
await record('health-and-auth', async () => ({
  live: await api('/api/health/live'), ready: await api('/api/health/ready'), diagnostics: await api('/api/health/diagnostics'),
  me: await api('/api/auth/me', { token: admin }), invalid: await api('/api/auth/me', { token: 'invalid-phase23m' }),
  usersViewer: await api('/api/auth/users', { token: viewer }), usersAdmin: { status: (await api('/api/auth/users', { token: admin })).status }
}));
await record('public-read-and-tenant-boundaries', async () => {
  const paths = ['/api/services', '/api/incidents', '/api/alerts', '/api/deployments', '/api/events', '/api/integrations', '/api/cloud/resources', '/api/sre-intelligence/overview'];
  const responses = [];
  for (const p of paths) { const r = await api(p); responses.push({ path: p, status: r.status, count: Array.isArray(r.data?.data) ? r.data.data.length : undefined }); }
  await db.query("INSERT INTO normalized_events(id,event_type,source_system,source_ref_id,tenant_id,event_timestamp,title,summary) VALUES ('phase23m-private-event','generic_observability','phase23m','private','phase23m-other-tenant',NOW(),'Private tenant sentinel','Synthetic isolation probe') ON CONFLICT DO NOTHING");
  return { responses, arbitraryTenant: await api('/api/events?tenantId=phase23m-other-tenant'), directId: await api('/api/events/phase23m-private-event') };
});
let fixtureMode = 'healthy';
const fixtureCalls = [];
const fixture = http.createServer((req, res) => {
  fixtureCalls.push({ method: req.method, url: req.url });
  if (fixtureMode === 'timeout') return;
  res.setHeader('Content-Type', 'application/json');
  if (fixtureMode === 'failure') { res.statusCode = 503; res.end(JSON.stringify({ message: 'controlled unavailable provider' })); return; }
  const p = req.url.split('?')[0];
  const data = p === '/api/v1' ? { kind: 'APIResourceList' } : p === '/api/v1/namespaces' ? { items: [{ metadata: { name: 'phase23m' } }] } : p === '/apis/apps/v1/deployments' ? { items: [{ metadata: { name: 'phase23m-api', namespace: 'phase23m' }, spec: { replicas: 2, template: { spec: { containers: [{ image: 'phase23m/api:v1' }] } } }, status: { readyReplicas: 2, updatedReplicas: 2 } }] } : p === '/api/v1/pods' ? { items: [{ metadata: { name: 'phase23m-api-1', namespace: 'phase23m', labels: { app: 'phase23m-api' } }, status: { phase: 'Running', containerStatuses: [{ ready: true, restartCount: 0 }] } }] } : { items: [] };
  res.end(JSON.stringify(data));
});
await new Promise(r => fixture.listen(0, '127.0.0.1', r));
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
let integrationId;
await record('workflow-A-integration-discovery', async () => {
  const created = await api('/api/integrations', { token: admin, method: 'POST', body: { provider: 'kubernetes', name: 'Phase 23M isolated Kubernetes HTTP fixture', config: { clusterUrl: fixtureUrl, environment: 'staging', timeoutMs: 250 }, credentials: { bearerToken: 'phase23m-fixture-only' } } });
  integrationId = created.data?.data?.id;
  const test = await api(`/api/integrations/${integrationId}/test`, { token: admin, method: 'POST', body: {} });
  const adminSync = await api(`/api/integrations/${integrationId}/sync`, { token: admin, method: 'POST', body: {} });
  const responderSync = await api(`/api/integrations/${integrationId}/sync`, { token: responder, method: 'POST', body: {} });
  const inventory = (await db.query("SELECT id, name, resource_type, metadata FROM cloud_resources WHERE id LIKE 'k8s-%phase23m%' ORDER BY id")).rows;
  fixtureMode = 'failure';
  const failedSync = await api(`/api/integrations/${integrationId}/sync`, { token: responder, method: 'POST', body: {} });
  const afterFailedSync = await api(`/api/integrations/${integrationId}`, { token: admin });
  const failedTest = await api(`/api/integrations/${integrationId}/test`, { token: admin, method: 'POST', body: {} });
  fixtureMode = 'healthy';
  const reconnected = await api(`/api/integrations/${integrationId}/test`, { token: admin, method: 'POST', body: {} });
  const disabled = await api(`/api/integrations/${integrationId}`, { token: admin, method: 'PATCH', body: { enabled: false } });
  const disabledSync = await api(`/api/integrations/${integrationId}/sync`, { token: responder, method: 'POST', body: {} });
  await api(`/api/integrations/${integrationId}`, { token: admin, method: 'PATCH', body: { enabled: true } });
  return { fixtureUrl, created, test, adminSync, responderSync, inventory, failedSync, afterFailedSync, failedTest, reconnected, disabled: disabled.status, disabledSync, fixtureCalls };
});
const nano = String(BigInt(Date.now()) * 1000000n);
const attrs = [{ key: 'service.name', value: { stringValue: 'payment-service' } }, { key: 'deployment.environment', value: { stringValue: 'staging' } }];
const metricBody = { resourceMetrics: [{ resource: { attributes: attrs }, scopeMetrics: [{ metrics: [{ name: 'error_rate', gauge: { dataPoints: [{ asDouble: 0.25, timeUnixNano: nano }] } }] }] }] };
const traceBody = { resourceSpans: [
  { resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout-api' } }] }, scopeSpans: [{ spans: [{ traceId: 'a'.repeat(32), spanId: '1'.repeat(16), name: 'checkout', startTimeUnixNano: nano, endTimeUnixNano: String(BigInt(nano) + 800000000n), status: { code: 2 } }] }] },
  { resource: { attributes: attrs }, scopeSpans: [{ spans: [{ traceId: 'a'.repeat(32), spanId: '2'.repeat(16), parentSpanId: '1'.repeat(16), name: 'payment', startTimeUnixNano: nano, endTimeUnixNano: String(BigInt(nano) + 750000000n), status: { code: 2 } }] }] }
] };
await record('workflow-B-public-OTLP-to-incident', async () => {
  const before = (await db.query("SELECT error_rate, status FROM services WHERE id='payment-service'")).rows;
  const countsBefore = (await db.query('SELECT (SELECT COUNT(*) FROM alerts) AS alerts, (SELECT COUNT(*) FROM incidents) AS incidents')).rows;
  const metric = await api('/api/integrations/otlp/v1/metrics?tenantId=phase23m-other-tenant', { method: 'POST', body: metricBody });
  const traces = await api('/api/integrations/otlp/v1/traces?tenantId=phase23m-other-tenant', { method: 'POST', body: traceBody });
  const duplicate = await api('/api/integrations/otlp/v1/traces?tenantId=phase23m-other-tenant', { method: 'POST', body: traceBody });
  const events = (await db.query("SELECT id,tenant_id,environment,source_ref_id,normalized_attributes FROM normalized_events WHERE source_system='opentelemetry'")).rows;
  const after = (await db.query("SELECT error_rate, status FROM services WHERE id='payment-service'")).rows;
  const countsAfter = (await db.query('SELECT (SELECT COUNT(*) FROM alerts) AS alerts, (SELECT COUNT(*) FROM incidents) AS incidents')).rows;
  return { before, metric, traces, duplicate, events, after, countsBefore, countsAfter, dependencies: (await db.query("SELECT * FROM service_observed_dependencies WHERE detection_source='distributed_trace'")).rows };
});
await record('OTLP-key-and-malformed-payload', async () => {
  const created = await api('/api/integrations', { token: admin, method: 'POST', body: { provider: 'opentelemetry', name: 'Phase 23M secure OTLP', config: {}, credentials: { ingestionKey: 'phase23m-correct-ingestion-key' } } });
  return { created, withValidKey: await api('/api/integrations/otlp/v1/metrics', { method: 'POST', headers: { 'x-otlp-key': 'phase23m-correct-ingestion-key' }, body: metricBody }), withBearerKey: await api('/api/integrations/otlp/v1/metrics', { method: 'POST', headers: { Authorization: 'Bearer phase23m-correct-ingestion-key' }, body: metricBody }), malformed: await api('/api/integrations/otlp/v1/traces?tenantId=phase23m-malformed', { method: 'POST', body: { resourceSpans: 'bad' } }) };
});
await record('workflow-B-controlled-alert-and-investigation', async () => {
  // Only synthetic service state in this isolated database is changed.
  await db.query("UPDATE services SET error_rate=0.4, latency_p99=2000, cpu_percent=98, status='critical' WHERE id='payment-service'");
  const evaluation = await api('/api/alerts/evaluate', { token: responder, method: 'POST', body: { mode: 'simulated', useDatabase: true } });
  const incidents = (await db.query("SELECT id,title,service_id,rca_confidence_level,rca_hypotheses FROM incidents ORDER BY created_at DESC LIMIT 5")).rows;
  const incidentId = incidents.find(i => i.service_id === 'payment-service')?.id || incidents[0].id;
  const investigation = await api(`/api/incidents/${incidentId}/investigation/run`, { token: responder, method: 'POST', body: {} });
  return { evaluation, incidents, investigation, timeline: await api(`/api/incidents/${incidentId}/timeline`, { token: responder }), correlation: await api(`/api/incidents/${incidentId}/correlation-summary`, { token: responder }) };
});
await record('workflow-C-controlled-RCA', async () => {
  const { runRcaAnalysis } = await import('../../backend/src/engine/rcaEngine.js');
  const services = [{ id: 'phase23m-caller', name: 'Caller', dependencies: ['phase23m-db'] }, { id: 'phase23m-db', name: 'Database', dependencies: [] }];
  const incident = { id: 'INC-PHASE23M', serviceId: 'phase23m-caller', startedAt: new Date().toISOString() };
  const alerts = [{ id: 'phase23m-timeout', serviceId: 'phase23m-caller', severity: 'critical', title: 'Downstream timeouts', metric: 'latency_p99' }, { id: 'phase23m-db-error', serviceId: 'phase23m-db', severity: 'critical', title: 'Database unavailable', metric: 'error_rate' }];
  const ranked = runRcaAnalysis({ incident, services, alerts });
  const symptomOnly = runRcaAnalysis({ incident, services, alerts: alerts.slice(0, 1), cloudResources: [{ id: 'phase23m-caller-container', name: 'phase23m-caller', resource_type: 'docker_container', current_state: 'crashed', metadata: { compose_service: 'phase23m-caller' } }] });
  return { services, alerts, ranked, symptomOnly };
});
await record('workflow-D-baseline-drift-preview', async () => {
  const baseline = await api('/api/cloud/baselines/init-inventory', { token: admin, method: 'POST', body: { environment: 'staging', name: 'Phase 23M isolated baseline' } });
  await db.query("UPDATE cloud_resources SET current_state='stopped' WHERE id='k8s-phase23m-phase23m-api'");
  const detection = await api('/api/cloud/drifts/detect', { token: responder, method: 'POST', body: { environment: 'staging' } });
  const list = await api('/api/cloud/drifts?environment=staging', { token: admin });
  const drifts = list.data.data || [];
  const selected = drifts.find(d => (d.resource_id || d.resourceId) === 'k8s-phase23m-phase23m-api') || drifts[0];
  const preview = selected ? await api('/api/cloud/reconciliations/preview', { token: responder, method: 'POST', body: { driftId: selected.id } }) : null;
  return { baseline, detection, list, preview, resourceAfter: (await db.query("SELECT current_state FROM cloud_resources WHERE id='k8s-phase23m-phase23m-api'")).rows, mutationRequests: fixtureCalls.filter(c => c.method !== 'GET') };
});
await record('workflow-E-recommendations-and-approval-guards', async () => {
  const { remediationRepository: repo } = await import('../../backend/src/repositories/remediation.repository.js');
  const id = (await db.query("SELECT id FROM incidents WHERE service_id='payment-service' LIMIT 1")).rows[0].id;
  await db.query("UPDATE incidents SET rca_confidence_level='STRONG_HYPOTHESIS', rca_hypotheses=$2::jsonb WHERE id=$1", [id, JSON.stringify([{ candidateServiceId: 'payment-service', score: 85, confidenceLevel: 'STRONG_HYPOTHESIS', supportingEvidence: [{ type: 'controlled_fixture', title: 'Synthetic container crash for safety validation' }] }])]);
  await db.query("UPDATE cloud_resources SET current_state='crashed' WHERE name LIKE '%payment%' AND provider='docker'");
  const generated = await api(`/api/remediation/incidents/${id}/recommendations`, { token: responder, method: 'POST', body: {} });
  const generatedPlan = (await db.query('SELECT * FROM remediation_plans ORDER BY created_at DESC LIMIT 1')).rows[0];
  const rec = generatedPlan ? null : await repo.createRecommendation({ tenantId: 'default_tenant', environment: 'staging', serviceId: 'payment-service', resourceId: 'k8s-phase23m-phase23m-api', detectedProblem: 'Synthetic crash', proposedAction: 'K8S_DEPLOYMENT_RESTART', expectedOutcome: 'Synthetic recovery', riskLevel: 'LOW' });
  const plan = generatedPlan || await repo.createPlan({ recommendationId: rec.id, tenantId: 'default_tenant', action: 'K8S_DEPLOYMENT_RESTART', targetResourceId: 'k8s-phase23m-phase23m-api', planHash: 'phase23m-hash' });
  const approval = await api(`/api/remediation/plans/${plan.id}/request-approval`, { token: responder, method: 'POST', body: {} });
  const aid = approval.data.data.id;
  const selfApproval = await api(`/api/remediation/approvals/${aid}/approve`, { token: responder, method: 'POST', body: { planHash: plan.plan_hash } });
  const tampered = await api(`/api/remediation/approvals/${aid}/approve`, { token: admin, method: 'POST', body: { planHash: 'tampered-hash' } });
  const valid = await api(`/api/remediation/approvals/${aid}/approve`, { token: admin, method: 'POST', body: { planHash: plan.plan_hash } });
  await db.query("UPDATE infra_remediation_approvals SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [aid]);
  const expired = await api(`/api/remediation/approvals/${aid}/approve`, { token: admin, method: 'POST', body: { planHash: plan.plan_hash } });
  const executionBlocked = await api(`/api/remediation/plans/${plan.id}/execute`, { token: admin, method: 'POST', body: { explicitConfirmation: true } });
  return { generated, fallbackPlanNeeded: !generatedPlan, plan, approval, selfApproval, tampered, valid, expired, executionBlocked, dryRun: await api(`/api/remediation/plans/${plan.id}/dry-run`, { token: admin, method: 'POST', body: {} }), executionCount: (await db.query('SELECT COUNT(*) FROM remediation_executions')).rows };
});
await record('workflow-F-SRE-intelligence', async () => {
  const responses = {};
  for (const route of ['overview', 'health', 'predictive-risks', 'slo-summary', 'capacity-optimization', 'recommendations']) responses[route] = await api('/api/sre-intelligence/' + route, { token: admin });
  const { sloBudgetService } = await import('../../backend/src/services/sre-intelligence/sloBudget.service.js');
  return { responses, arithmetic: sloBudgetService.evaluateSli({ sliType: 'availability', targetPercent: 99.9, totalEvents: 10000, goodEvents: 9950, badEvents: 50 }) };
});
await record('cross-instance-kill-switch', async () => {
  const enabled = await api('/api/cloud/kill-switch', { token: admin, method: 'POST', body: { enabled: true, reason: 'Phase 23M safety freeze' } });
  return { enabled, first: await api('/api/cloud/kill-switch', { token: admin }), second: await api('/api/cloud/kill-switch', { token: admin, base: 'http://127.0.0.1:5011' }) };
});
await new Promise(r => fixture.close(r)); await db.end();
const { closePool } = await import('../../backend/src/db/connection.js'); await closePool();
