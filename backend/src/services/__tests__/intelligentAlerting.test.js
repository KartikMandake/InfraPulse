import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { resetAlerts, getAlerts, getAlertById, updateAlert } from '../../data/alerts.js';
import { resetIncidents, getIncidents, createIncident } from '../../data/incidents.js';
import { resetServices, getServices, updateService } from '../../data/services.js';
import { resetAlertRules, getAlertRules, createAlertRule, updateAlertRule } from '../alertRules.service.js';
import { evaluateAndCorrelateAlerts, checkTopologicalRelation } from '../alertCorrelation.service.js';
import { runRcaAnalysis } from '../../engine/rcaEngine.js';
import { getDeployments } from '../../data/deployments.js';
import { getLogs, getTraces } from '../../data/telemetry.js';

beforeEach(() => {
  resetAlerts();
  resetIncidents();
  resetServices();
  resetAlertRules();
});

test('1. A latency threshold produces an alert when breached', async () => {
  // Configure payment-service to breach latency rule (>300ms)
  updateService('payment-service', { latencyP99: 450, errorRate: 0.01, status: 'nominal' });

  // Clear existing active alerts for clean test
  const existing = getAlerts();
  existing.forEach(a => updateAlert(a.id, { status: 'resolved', state: 'resolved' }));

  const report = await evaluateAndCorrelateAlerts({ mode: 'mock', inMemory: true });

  const createdLatencyAlert = report.alertsCreated.find(
    a => a.serviceId === 'payment-service' && a.ruleId === 'RULE-LAT-01'
  );

  assert.ok(createdLatencyAlert, 'Latency threshold must trigger a new alert');
  assert.equal(createdLatencyAlert.status, 'active');
  assert.equal(createdLatencyAlert.severity, 'critical');
  assert.equal(createdLatencyAlert.observedValue, 450);
});

test('2. Healthy telemetry does not produce a false alert', async () => {
  // Set inventory-mesh to completely healthy nominal values
  updateService('inventory-mesh', {
    latencyP99: 15,
    errorRate: 0.0,
    status: 'nominal',
    rps: 3000
  });

  // Resolve existing inventory alerts
  getAlerts({ serviceId: 'inventory-mesh' }).forEach(a => updateAlert(a.id, { status: 'resolved' }));

  const report = await evaluateAndCorrelateAlerts({ mode: 'mock', inMemory: true });

  const falseAlert = report.alertsCreated.find(
    a => a.serviceId === 'inventory-mesh' && a.ruleId === 'RULE-LAT-01'
  );
  assert.equal(falseAlert, undefined, 'Healthy service must not produce false alert');
});

test('3. Repeated evaluation does not create duplicate alerts (deduplication)', async () => {
  updateService('payment-service', { latencyP99: 420 });

  // First evaluation creates or updates active alert
  const report1 = await evaluateAndCorrelateAlerts({ mode: 'mock' });
  const count1 = getAlerts({ serviceId: 'payment-service', status: 'active' }).length;

  // Second evaluation with same breaching condition
  const report2 = await evaluateAndCorrelateAlerts({ mode: 'mock' });
  const count2 = getAlerts({ serviceId: 'payment-service', status: 'active' }).length;

  assert.equal(count2, count1, 'Deduplication must prevent duplicate active alerts');
  assert.ok(report2.alertsDeduplicated.length > 0, 'Report must log deduplication events');
});

test('4. Acknowledging and resolving alerts updates their lifecycle correctly', async () => {
  const alerts = getAlerts();
  const alertToTest = alerts[0];

  // Acknowledge
  const acked = updateAlert(alertToTest.id, {
    status: 'acknowledged',
    state: 'acknowledged',
    acknowledgedAt: new Date().toISOString()
  });
  assert.equal(acked.status, 'acknowledged');
  assert.equal(acked.state, 'acknowledged');
  assert.ok(acked.acknowledgedAt);

  // Resolve
  const resolved = updateAlert(alertToTest.id, {
    status: 'resolved',
    state: 'resolved',
    resolvedAt: new Date().toISOString()
  });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.state, 'resolved');
  assert.ok(resolved.resolvedAt);
});

test('5. Related alerts link to one incident based on dependency topology', async () => {
  // Clear all incidents to test grouping from clean state
  const services = getServices();
  const checkoutDep = checkTopologicalRelation('checkout-api', 'payment-service', services);
  assert.ok(checkoutDep.related, 'checkout-api must depend on payment-service');

  // Trigger alerts on both checkout-api and payment-service
  updateService('payment-service', { latencyP99: 550, errorRate: 5.0, status: 'critical' });
  updateService('checkout-api', { latencyP99: 350, errorRate: 3.5, status: 'critical' });

  const report = await evaluateAndCorrelateAlerts({ mode: 'mock', inMemory: true });

  // Check if both alerts share the same incidentId
  const payAlert = getAlerts({ serviceId: 'payment-service', status: 'active' })[0];
  const checkAlert = getAlerts({ serviceId: 'checkout-api', status: 'active' })[0];

  assert.ok(payAlert && checkAlert, 'Both alerts must be active');
  assert.ok(payAlert.incidentId, 'payment-service alert must have incidentId');
  assert.equal(
    payAlert.incidentId,
    checkAlert.incidentId,
    'Topologically correlated alerts must link to the same incident'
  );
});

test('6. Unrelated alerts remain separate and do not cross-merge', async () => {
  const services = getServices();
  const topo = checkTopologicalRelation('notification-worker', 'payment-service', services);
  assert.equal(topo.related, false, 'notification-worker must not be connected to payment-service');

  // Active incident on payment-service
  const openInc = getIncidents().find(i => i.id === 'INC-4921');
  assert.equal(openInc.serviceId, 'payment-service');

  // Notification worker alert
  const notifAlert = getAlerts({ serviceId: 'notification-worker' })[0];
  assert.notEqual(
    notifAlert.incidentId,
    openInc.id,
    'Unrelated service alert must not be merged into payment-service incident'
  );
});

test('7. Existing incidents are reused where appropriate without creating duplicates', async () => {
  const openIncident = getIncidents().find(i => i.id === 'INC-4921');
  const initialIncidentsForPayment = getIncidents().filter(i => i.serviceId === 'payment-service').length;

  // New alert on payment-service
  updateService('payment-service', { errorRate: 8.5 });

  // Ensure rule triggers specifically on payment-service
  await createAlertRule({
    name: 'Severe 5xx Spike',
    type: 'error_rate',
    targetServiceId: 'payment-service',
    metric: 'errorRate',
    operator: '>',
    threshold: 8.0,
    severity: 'critical'
  });

  const report = await evaluateAndCorrelateAlerts({ mode: 'mock', inMemory: true });

  // Verify no second incident was declared for payment-service
  const paymentIncidents = getIncidents().filter(i => i.serviceId === 'payment-service');
  assert.equal(
    paymentIncidents.length,
    initialIncidentsForPayment,
    'Should link to existing open incident INC-4921 rather than creating duplicate incident for payment-service'
  );

  const linked = report.incidentsLinked.find(l => l.incidentId === openIncident.id);
  assert.ok(linked, 'Report must register link to existing incident INC-4921');
});

test('8. Insufficient or stale telemetry is handled safely without false alerts', async () => {
  // Service with missing/undefined metrics
  await createAlertRule({
    name: 'Ghost Rule',
    type: 'latency_spike',
    targetServiceId: 'custom-ghost-service',
    metric: 'latencyP99',
    operator: '>',
    threshold: 100,
    severity: 'critical'
  });

  const report = await evaluateAndCorrelateAlerts({ mode: 'mock', inMemory: true });
  const ghostAlert = report.alertsCreated.find(a => a.serviceId === 'custom-ghost-service');
  assert.equal(ghostAlert, undefined, 'Missing telemetry must not trigger alert');

  const skipEntry = report.alertsSkipped.find(s => s.serviceId === 'custom-ghost-service');
  assert.ok(skipEntry, 'Must log skipped alert due to missing metric/service');
});

test('9. The RCA engine receives the correct evidence from intelligent alerting', async () => {
  const incident = getIncidents().find(i => i.id === 'INC-4921');
  const services = getServices();
  const alerts = getAlerts();
  const deployments = getDeployments();
  const logs = getLogs();
  const traces = getTraces();

  const hypotheses = runRcaAnalysis({
    incident,
    services,
    alerts,
    deployments,
    logs,
    traces
  });

  assert.ok(hypotheses.length > 0, 'RCA engine must return ranked hypotheses');
  const topCandidate = hypotheses[0];
  assert.equal(topCandidate.candidateServiceId, 'payment-service', 'Top candidate must be payment-service');
  assert.ok(topCandidate.score >= 70, 'Top candidate must have high confidence score');

  // Verify that active alerts are present in observedAnomalies
  assert.ok(topCandidate.observedAnomalies.length > 0, 'RCA hypothesis observedAnomalies must include correlated alerts');
  const hasPoolOrLatencyAlert = topCandidate.observedAnomalies.some(a => a.serviceId === 'payment-service');
  assert.ok(hasPoolOrLatencyAlert, 'Alerts for payment-service must be correlated in RCA');
});
