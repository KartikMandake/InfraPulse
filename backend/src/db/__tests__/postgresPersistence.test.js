import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

import { config } from '../../config/env.js';
import { runMigrations } from '../migrate.js';
import { seedDatabase } from '../seed.js';
import { closePool, withTransaction, truncateAllTables } from '../connection.js';

import * as alertsRepo from '../../repositories/alerts.repository.js';
import * as alertRulesRepo from '../../repositories/alertRules.repository.js';
import * as incidentsRepo from '../../repositories/incidents.repository.js';
import * as servicesRepo from '../../repositories/services.repository.js';
import * as investigationsRepo from '../../repositories/investigations.repository.js';
import * as simulationsRepo from '../../repositories/simulations.repository.js';
import { evaluateAndCorrelateAlerts } from '../../services/alertCorrelation.service.js';

before(async () => {
  // Ensure we are operating safely against test database or isolated environment
  await runMigrations();
  await truncateAllTables();
  await seedDatabase();
});

test('1. Alerts survive simulated backend restart (re-fetched from PostgreSQL)', async () => {
  const testAlertId = `ALT-TEST-${Date.now()}`;
  await alertsRepo.createAlertRecord({
    id: testAlertId,
    title: 'PostgreSQL Disk Space Warning (>80%)',
    severity: 'warning',
    status: 'active',
    serviceId: 'payment-service',
    metric: 'disk_used_percent',
    operator: '>',
    threshold: '80',
    currentValue: '84.2%',
    observedValue: 84.2,
    firedAt: '15:00:00 UTC'
  });

  // Simulate process restart: query clean row directly from PostgreSQL
  const retrieved = await alertsRepo.findAlertById(testAlertId);
  assert.ok(retrieved, 'Alert must be retrievable from database after creation');
  assert.equal(retrieved.id, testAlertId);
  assert.equal(retrieved.status, 'active');
  assert.equal(retrieved.observedValue, 84.2);
});

test('2. Custom alert rules survive simulated backend restart', async () => {
  const testRuleId = `RULE-CUSTOM-${Date.now()}`;
  await alertRulesRepo.createAlertRuleRecord({
    id: testRuleId,
    name: 'Custom Memory Pressure Ceiling',
    description: 'Alert when container memory usage exceeds 90%',
    type: 'health_check',
    targetServiceId: 'payment-service',
    metric: 'memoryPercent',
    operator: '>',
    threshold: 90,
    severity: 'critical',
    enabled: true,
    cooldownMinutes: 10
  });

  // Simulate process restart
  const retrievedRule = await alertRulesRepo.findAlertRuleById(testRuleId);
  assert.ok(retrievedRule, 'Custom alert rule must persist in PostgreSQL');
  assert.equal(retrievedRule.id, testRuleId);
  assert.equal(retrievedRule.threshold, 90);
  assert.equal(retrievedRule.severity, 'critical');
});

test('3. Alert acknowledgement and resolution persist with timestamps', async () => {
  const alertId = `ALT-LIFECYCLE-${Date.now()}`;
  await alertsRepo.createAlertRecord({
    id: alertId,
    title: 'Transient GCS upload timeout',
    severity: 'warning',
    status: 'active',
    state: 'firing',
    serviceId: 'checkout-api',
    metric: 'gcs_upload_timeout_rate',
    threshold: '0.01',
    currentValue: '0.04'
  });

  // Acknowledge
  const ackTime = new Date().toISOString();
  await alertsRepo.updateAlertRecord(alertId, {
    status: 'acknowledged',
    state: 'acknowledged',
    acknowledgedAt: ackTime
  });

  const acked = await alertsRepo.findAlertById(alertId);
  assert.equal(acked.status, 'acknowledged');
  assert.equal(acked.state, 'acknowledged');
  assert.ok(acked.acknowledgedAt);

  // Resolve
  const resolveTime = new Date().toISOString();
  await alertsRepo.updateAlertRecord(alertId, {
    status: 'resolved',
    state: 'resolved',
    resolvedAt: resolveTime
  });

  const resolved = await alertsRepo.findAlertById(alertId);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.state, 'resolved');
  assert.ok(resolved.resolvedAt);
});

test('4. Duplicate evaluation does not create duplicate alerts (deduplication persisted)', async () => {
  const dedupeRuleId = `RULE-DEDUP-${Date.now()}`;
  await alertRulesRepo.createAlertRuleRecord({
    id: dedupeRuleId,
    name: 'High CPU on auth gateway',
    type: 'health_check',
    targetServiceId: 'auth-gateway-v2',
    metric: 'cpuPercent',
    operator: '>',
    threshold: 80,
    severity: 'critical',
    enabled: true
  });

  await servicesRepo.updateServiceRecord('auth-gateway-v2', { cpuPercent: 94 });

  // Run evaluation 1
  const report1 = await evaluateAndCorrelateAlerts({ mode: 'mock' });
  const allAlerts1 = await alertsRepo.findAllAlerts({ serviceId: 'auth-gateway-v2', status: 'active' });
  const count1 = allAlerts1.filter(a => a.ruleId === dedupeRuleId).length;
  assert.equal(count1, 1, 'First evaluation should create exactly 1 active alert');

  // Run evaluation 2
  const report2 = await evaluateAndCorrelateAlerts({ mode: 'mock' });
  const allAlerts2 = await alertsRepo.findAllAlerts({ serviceId: 'auth-gateway-v2', status: 'active' });
  const count2 = allAlerts2.filter(a => a.ruleId === dedupeRuleId).length;
  assert.equal(count2, 1, 'Repeated evaluation must not duplicate active alert in PostgreSQL');

  const dedupeEntry = report2.alertsDeduplicated.find(d => d.ruleId === dedupeRuleId);
  assert.ok(dedupeEntry, 'Report must log deduplication increment');
});

test('5. Incident creation and alert linking remain consistent within transactions', async () => {
  const incId = `INC-TX-${Date.now()}`;
  const alertId = `ALT-TX-${Date.now()}`;

  await withTransaction(async (client) => {
    // Create alert
    await alertsRepo.createAlertRecord(
      {
        id: alertId,
        title: 'Cascade Alert for Transaction Test',
        severity: 'critical',
        status: 'active',
        serviceId: 'payment-service',
        metric: 'errorRate',
        threshold: '5.0',
        currentValue: '8.2'
      },
      client
    );

    // Create incident
    await incidentsRepo.createIncidentRecord(
      {
        id: incId,
        title: 'Transaction Test Incident',
        severity: 'SEV-1',
        serviceId: 'payment-service',
        serviceName: 'payment-service',
        timeline: [
          { time: '12:00:00 UTC', title: 'Incident Declared', description: 'Testing atomic transaction.' }
        ]
      },
      client
    );

    // Link alert to incident
    await alertsRepo.updateAlertRecord(alertId, { incidentId: incId }, client);
  });

  const inc = await incidentsRepo.findIncidentById(incId);
  const alt = await alertsRepo.findAlertById(alertId);

  assert.ok(inc, 'Incident must be saved in transaction');
  assert.ok(alt, 'Alert must be saved in transaction');
  assert.equal(alt.incidentId, incId, 'Alert incidentId must be linked atomically');
});

test('6. Seeding can be rerun safely without creating duplicates or overwriting updates', async () => {
  const initialIncidents = await incidentsRepo.findAllIncidents();
  const initialCount = initialIncidents.length;

  // Modify an incident title
  const targetInc = initialIncidents[0];
  const customTitle = `Custom Modified Title [${Date.now()}]`;
  await incidentsRepo.updateIncidentRecord(targetInc.id, { title: customTitle });

  // Rerun seed process
  await seedDatabase();

  const afterSeedIncidents = await incidentsRepo.findAllIncidents();
  assert.equal(afterSeedIncidents.length, initialCount, 'Seed rerun must not create duplicate incidents');

  const reloadedInc = await incidentsRepo.findIncidentById(targetInc.id);
  assert.equal(reloadedInc.title, customTitle, 'Seed rerun must preserve user updates');
});

test('7. Investigation runs are saved and retrievable from PostgreSQL', async () => {
  const invRunId = `inv-test-${Date.now()}`;
  const incId = 'INC-4921';

  await investigationsRepo.createInvestigationRunRecord({
    id: invRunId,
    incidentId: incId,
    executedAt: new Date().toISOString(),
    hypotheses: [
      { candidateServiceId: 'payment-service', score: 94, rank: 1, summary: 'Pool lock timeout' }
    ],
    correlatedTraces: [
      { id: 'span-001', service: 'payment-service', durationMs: 412 }
    ],
    weights: { anomalySeverity: 30, deploymentCorrelation: 25 }
  });

  const latest = await investigationsRepo.findLatestInvestigationByIncidentId(incId);
  assert.ok(latest, 'Latest investigation must be retrievable from PostgreSQL');
  assert.equal(latest.topCandidateServiceId, 'payment-service');
  assert.equal(latest.topCandidateScore, 94);
  assert.ok(latest.hypotheses.length > 0);
});

test('8. Fault simulation results can be retrieved after restart', async () => {
  const simId = `sim-test-${Date.now()}`;
  await simulationsRepo.saveSimulationRecord({
    simulationId: simId,
    scenarioId: 'scenario-database-slowdown',
    targetServiceId: 'ledger-db-proxy',
    targetServiceName: 'ledger-db-proxy',
    faultType: 'database_slowdown',
    severity: 'high',
    expectedRootCauseServiceId: 'ledger-db-proxy',
    expectedDownstreamAffected: ['payment-service', 'checkout-api'],
    simulatedIncident: { id: 'INC-SIM-999', title: 'Database latency spike' },
    evaluation: { top1Accuracy: true, status: 'PASSED', investigationDurationMs: 12 }
  });

  const retrievedSim = await simulationsRepo.findSimulationById(simId);
  assert.ok(retrievedSim, 'Simulation record must persist in fault_simulations table');
  assert.equal(retrievedSim.targetServiceId, 'ledger-db-proxy');
  assert.equal(retrievedSim.evaluation.status, 'PASSED');
  assert.equal(retrievedSim.evaluation.top1Accuracy, true);
});

test('9. Database errors / constraint conflicts reject cleanly without false success', async () => {
  // Test foreign key violation or invalid SQL
  await assert.rejects(
    async () => {
      // Trying to link event to non-existent incident
      await incidentsRepo.addIncidentEvent('INC-DOES-NOT-EXIST-99999', {
        title: 'Orphan Event',
        time: '12:00:00 UTC'
      });
    },
    (err) => {
      assert.ok(err, 'Must reject with foreign key violation');
      return true;
    }
  );
});
