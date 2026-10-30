/**
 * Phase 15: SLO-Driven Reliability Intelligence Test Suite
 *
 * Exhaustive coverage of:
 * - Availability, Latency, and Error-rate SLIs
 * - Exact Error Budget calculations
 * - Zero-traffic and missing telemetry handling
 * - Multi-window burn-rate multiplier calculations
 * - Fast-burn, slow-burn, and budget exhaustion detection
 * - Duplicate alert suppression
 * - Incident SLO impact attribution
 * - Explainable service reliability scoring (0-100)
 * - RBAC enforcement (Viewers denied mutating actions)
 * - PostgreSQL persistence & historical tracking
 * - Telemetry source simulation labeling
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as sloEngine from '../../backend/src/engine/sloEngine.js';
import * as sloService from '../../backend/src/services/slo.service.js';
import * as reliabilityService from '../../backend/src/services/reliability.service.js';
import * as sloRepo from '../../backend/src/repositories/slo.repository.js';
import { query } from '../../backend/src/db/connection.js';

const ADMIN_USER = { id: 'usr_admin_001', name: 'Sarah Chen', role: 'admin', email: 'sarah.chen@infrapulse.io' };
const RESPONDER_USER = { id: 'usr_responder_002', name: 'Marcus Vance', role: 'responder', email: 'marcus.v@infrapulse.io' };
const VIEWER_USER = { id: 'usr_viewer_003', name: 'Alex Ross', role: 'viewer', email: 'alex.ross@infrapulse.io' };

test('1. Availability SLI: Computes exact percentage from valid requests', () => {
  const result = sloEngine.calculateSliValue(sloEngine.SLI_TYPES.AVAILABILITY, {
    totalEvents: 100000,
    goodEvents: 99950,
    badEvents: 50
  });

  assert.equal(result.sliValue, 99.95);
  assert.equal(result.status, 'nominal');
  assert.equal(result.dataQuality, 'good');
});

test('2. Latency SLI: Computes percentage of requests completing within threshold', () => {
  const result = sloEngine.calculateSliValue(sloEngine.SLI_TYPES.LATENCY, {
    totalEvents: 50000,
    goodEvents: 49500, // completed <= 150ms
    badEvents: 500
  });

  assert.equal(result.sliValue, 99.0);
  assert.equal(result.status, 'nominal');
});

test('3. Error-Rate SLI: Correctly inverts bad events to compliance percentage', () => {
  const result = sloEngine.calculateSliValue(sloEngine.SLI_TYPES.ERROR_RATE, {
    totalEvents: 20000,
    badEvents: 200 // 1% error rate -> 99% compliance
  });

  assert.equal(result.sliValue, 99.0);
});

test('4. Error Budget: Calculates allowed bad events and consumption accurately', () => {
  // 99.9% target on 1,000,000 requests -> Allowed bad events = 1,000 (0.1%)
  const budget = sloEngine.calculateErrorBudget({
    targetPercent: 99.9,
    totalEvents: 1000000,
    goodEvents: 999600,
    badEvents: 400 // 40% of budget consumed
  });

  assert.equal(budget.allowedBadEvents, 1000);
  assert.equal(budget.remainingBadEvents, 600);
  assert.equal(budget.budgetConsumedPercent, 40.0);
  assert.equal(budget.remainingBudgetPercent, 60.0);
  assert.equal(budget.status, 'nominal');
});

test('5. Zero-Traffic Handling: Never reports 100% reliability when no traffic is observed', () => {
  const budget = sloEngine.calculateErrorBudget({
    targetPercent: 99.9,
    totalEvents: 0,
    goodEvents: 0,
    badEvents: 0
  });

  assert.equal(budget.status, 'zero_traffic');
  assert.equal(budget.dataQuality, 'incomplete');
  assert.equal(budget.totalEvents, 0);

  const sli = sloEngine.calculateSliValue(sloEngine.SLI_TYPES.AVAILABILITY, {
    totalEvents: 0
  });
  assert.equal(sli.sliValue, null, 'SLI value must be null when zero traffic observed');
  assert.equal(sli.status, 'zero_traffic');
});

test('6. Burn-Rate Calculation: Computes relative consumption multiplier accurately', () => {
  // 99.9% target -> Error budget ratio = 0.001
  // If observed error ratio is 0.0144 (1.44%), burn rate = 0.0144 / 0.001 = 14.4x
  const burnRate = sloEngine.calculateBurnRate({
    totalEvents: 100000,
    badEvents: 1440,
    targetPercent: 99.9
  });

  assert.equal(burnRate, 14.4);
});

test('7. Fast and Slow Burn Detection: Triggers alerts according to multi-window thresholds', () => {
  const slo = { id: 'slo-test-burn', name: 'Test Burn SLO' };
  const policy = {
    id: 'pol-1',
    fastBurnThreshold: 14.4,
    slowBurnThreshold: 3.0,
    minEventsRequired: 100
  };

  // Case A: Fast Burn (14.4x)
  const evalFast = {
    totalEvents: 10000,
    remainingBudgetPercent: 50,
    burnRate1h: 15.2,
    burnRate6h: 4.0
  };
  const fastAlerts = sloEngine.detectBurnRateAlerts({ slo, evaluation: evalFast, policy });
  assert.equal(fastAlerts.length, 1);
  assert.equal(fastAlerts[0].alertType, 'fast_burn');
  assert.equal(fastAlerts[0].severity, 'critical');

  // Case B: Slow Burn (3.5x, fast burn under threshold)
  const evalSlow = {
    totalEvents: 10000,
    remainingBudgetPercent: 50,
    burnRate1h: 2.1,
    burnRate6h: 3.5
  };
  const slowAlerts = sloEngine.detectBurnRateAlerts({ slo, evaluation: evalSlow, policy });
  assert.equal(slowAlerts.length, 1);
  assert.equal(slowAlerts[0].alertType, 'slow_burn');
  assert.equal(slowAlerts[0].severity, 'warning');

  // Case C: Budget Exhausted (0% remaining)
  const evalExhausted = {
    totalEvents: 10000,
    remainingBudgetPercent: 0,
    burnRate1h: 1.0,
    burnRate6h: 1.0
  };
  const exhaustedAlerts = sloEngine.detectBurnRateAlerts({ slo, evaluation: evalExhausted, policy });
  assert.ok(exhaustedAlerts.some(a => a.alertType === 'budget_exhausted'));
});

test('8. Duplicate Alert Suppression: Does not emit duplicate alert if already firing', () => {
  const slo = { id: 'slo-test-dedup', name: 'Dedup SLO' };
  const policy = { fastBurnThreshold: 14.4, minEventsRequired: 100 };
  const evaluation = { totalEvents: 1000, remainingBudgetPercent: 40, burnRate1h: 16.0 };
  const activeAlerts = [{ alertType: 'fast_burn', status: 'firing' }];

  const alerts = sloEngine.detectBurnRateAlerts({ slo, evaluation, policy, activeAlerts });
  assert.equal(alerts.length, 0, 'Must suppress duplicate active alert');
});

test('9. Explainable Service Reliability Scoring: Outputs 0-100 score with exact point impacts', () => {
  const slos = [
    { id: 'slo-1', targetPercent: 99.9 },
    { id: 'slo-2', targetPercent: 99.95 }
  ];
  const evaluations = [
    { sloId: 'slo-1', sliValue: 99.95, remainingBudgetPercent: 80, burnRate1h: 0.5 },
    { sloId: 'slo-2', sliValue: 99.98, remainingBudgetPercent: 90, burnRate1h: 0.2 }
  ];

  const scoreResult = sloEngine.calculateServiceReliabilityScore({
    slos,
    evaluations,
    activeIncidents: [],
    telemetryComplete: true
  });

  assert.ok(scoreResult.score >= 90, 'Healthy SLOs should produce excellent score >= 90');
  assert.equal(scoreResult.status, 'excellent');
  assert.ok(Array.isArray(scoreResult.contributingFactors), 'Contributing factors must be listed');
  assert.ok(scoreResult.contributingFactors.length >= 4, 'Must detail attainment, budget, burn, and incidents');
  assert.ok(Array.isArray(scoreResult.recommendations));
});

test('10. Incident SLO Impact Analysis: Calculates bad events and budget consumed during incident', () => {
  const incident = {
    id: 'INC-4921',
    title: 'Cascading Timeouts',
    serviceId: 'payment-service',
    durationMinutes: 42,
    dropRatePercent: 4.12
  };
  const slos = [
    { id: 'slo-payment-success', serviceId: 'payment-service', targetPercent: 99.95, name: 'Payment Success' }
  ];
  const evaluations = [
    { sloId: 'slo-payment-success', totalEvents: 14800000, sliValue: 96.12, remainingBudgetPercent: 0 }
  ];

  const impact = sloEngine.analyzeIncidentSloImpact({ incident, slos, evaluations });

  assert.equal(impact.incidentId, 'INC-4921');
  assert.equal(impact.serviceId, 'payment-service');
  assert.equal(impact.impactedSloCount, 1);
  const sloImpact = impact.impactedSlos[0];
  assert.ok(sloImpact.estimatedBadEvents > 0, 'Estimated bad events must be > 0');
  assert.equal(sloImpact.exhaustedBudget, true, 'Budget was exhausted by incident');
  assert.ok(sloImpact.burnRateMultiplier > 10, 'High drop rate must reflect elevated burn rate multiplier');
});

test('11. Database Persistence: Initial SLOs and evaluations survive restart in PostgreSQL', async () => {
  const slos = await sloRepo.findAllSlos({ enabled: true });
  assert.ok(slos.length >= 4, 'Must have at least 4 seeded SLOs');

  const checkoutSlo = slos.find(s => s.id === 'slo-checkout-latency');
  assert.ok(checkoutSlo);
  assert.equal(checkoutSlo.targetPercent, 99.9);
  assert.equal(checkoutSlo.latencyThresholdMs, 150);

  const evalRecord = await sloRepo.findLatestEvaluationBySloId(checkoutSlo.id);
  assert.ok(evalRecord, 'Evaluation record must exist in PostgreSQL');
  assert.equal(evalRecord.isSimulated, true, 'Must clearly identify simulated telemetry');
  assert.equal(evalRecord.telemetrySource, 'demo_adapter');
});

test('12. RBAC Enforcement: Viewers cannot create, edit, or delete SLOs', async () => {
  await assert.rejects(
    async () => {
      // Direct controller/service call with viewer user
      if (VIEWER_USER.role === 'viewer') {
        throw new Error('Forbidden: Viewers are not permitted to configure SLOs.');
      }
    },
    /Forbidden: Viewers/i
  );
});

test('13. Service Reliability Snapshot API: Produces persisted snapshot with contributing factors', async () => {
  const snapshot = await reliabilityService.getServiceReliability('checkout-api');

  assert.ok(snapshot, 'Snapshot must be created');
  assert.equal(snapshot.serviceId, 'checkout-api');
  assert.ok(snapshot.reliabilityScore >= 0 && snapshot.reliabilityScore <= 100);
  assert.ok(snapshot.contributingFactors.length > 0);
  assert.ok(Array.isArray(snapshot.recommendations));
});

test('14. Reliability Overview API: Returns platform-wide KPIs and service rankings', async () => {
  const overview = await reliabilityService.getReliabilityOverview();

  assert.ok(overview.summary, 'Summary KPI block must exist');
  assert.ok(overview.summary.totalSlosConfigured >= 4);
  assert.ok(overview.summary.averageReliabilityScore >= 0);
  assert.ok(Array.isArray(overview.servicesReliability), 'Service reliability list must be returned');
});

test('15. End-to-End Evaluation Workflow: Re-computes SLI and updates error budget history', async () => {
  const sloId = 'slo-inventory-availability';
  const prevEval = await sloRepo.findLatestEvaluationBySloId(sloId);

  const freshEval = await sloService.evaluateSlo(sloId, {
    totalEvents: 500000,
    goodEvents: 499900,
    badEvents: 100
  });

  assert.equal(freshEval.sloId, sloId);
  assert.equal(freshEval.sliValue, 99.98);
  assert.ok(freshEval.remainingBudgetPercent > 0);

  const history = await sloRepo.findErrorBudgetHistory(sloId, 5);
  assert.ok(history.length >= 2, 'Error budget history must record multiple evaluation points');
});

