import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBlastRadius } from '../../backend/src/engine/blastRadiusEngine.js';
import { calculateDeploymentRisk } from '../../backend/src/engine/changeRiskEngine.js';
import { buildEvidenceContext } from '../../backend/src/services/aiContext.service.js';
import * as changeRepo from '../../backend/src/repositories/change.repository.js';
import { query } from '../../backend/src/db/connection.js';

// Deterministic mock services topology
const MOCK_SERVICES = [
  {
    id: 'payment-service',
    name: 'payment-service',
    tier: 0,
    dependencies: ['ledger-db-proxy', 'fraud-evaluator', 'redis-shared']
  },
  {
    id: 'checkout-api',
    name: 'checkout-api',
    tier: 0,
    dependencies: ['payment-service', 'inventory-mesh', 'redis-shared']
  },
  {
    id: 'edge-gateway',
    name: 'edge-gateway',
    tier: 0,
    dependencies: ['checkout-api']
  },
  {
    id: 'inventory-mesh',
    name: 'inventory-mesh',
    tier: 1,
    dependencies: []
  },
  {
    id: 'ledger-db-proxy',
    name: 'ledger-db-proxy',
    tier: 1,
    dependencies: []
  },
  {
    id: 'fraud-evaluator',
    name: 'fraud-evaluator',
    tier: 2,
    dependencies: []
  },
  {
    id: 'redis-shared',
    name: 'redis-shared',
    tier: 1,
    dependencies: []
  }
];

describe('Phase 16: Deployment Risk & Change Intelligence', () => {

  test('1. Dependency Graph Direction: Identifies callers as downstream impact targets', () => {
    // checkout-api calls payment-service. When payment-service changes, checkout-api is the direct downstream caller!
    const blast = calculateBlastRadius('payment-service', MOCK_SERVICES);

    assert.equal(blast.targetService.id, 'payment-service');
    assert.equal(blast.directDownstream.length, 1);
    assert.equal(blast.directDownstream[0].serviceId, 'checkout-api');
    assert.equal(blast.directDownstream[0].relationshipType, 'direct_downstream');
    assert.deepEqual(blast.directDownstream[0].dependencyPath, ['checkout-api', 'payment-service']);

    // ledger-db-proxy is an UPSTREAM dependency that payment-service calls, NOT a downstream caller
    assert.equal(blast.upstreamDependencies.some(d => d.serviceId === 'ledger-db-proxy'), true);
    assert.equal(blast.directDownstream.some(d => d.serviceId === 'ledger-db-proxy'), false);
  });

  test('2. Transitive Blast Radius: Traces multi-hop callers with decreasing confidence', () => {
    // edge-gateway calls checkout-api, which calls payment-service (2 hops)
    const blast = calculateBlastRadius('payment-service', MOCK_SERVICES);

    assert.equal(blast.transitiveDownstream.length, 1);
    const transitive = blast.transitiveDownstream[0];
    assert.equal(transitive.serviceId, 'edge-gateway');
    assert.equal(transitive.hops, 2);
    assert.equal(transitive.confidence, 0.85); // Confidence decays for transitive
    assert.deepEqual(transitive.dependencyPath, ['edge-gateway', 'checkout-api', 'payment-service']);
  });

  test('3. Shared Dependency Detection: Identifies shared stateful resources with callers', () => {
    // Both payment-service and checkout-api depend on redis-shared
    const blast = calculateBlastRadius('payment-service', MOCK_SERVICES);

    assert.equal(blast.sharedDependencies.length, 1);
    assert.equal(blast.sharedDependencies[0].serviceId, 'redis-shared');
    assert.equal(blast.sharedDependencies[0].sharedWithCallers.includes('checkout-api'), true);
  });

  test('4. Deterministic Risk Scoring: Computes exact 0-100 score and factor breakdown', () => {
    const proposal = {
      serviceId: 'payment-service',
      previousVersion: 'v1.8.2',
      newVersion: 'v2.0.0', // Major bump
      deploymentStrategy: 'recreate', // Outage risk
      changeType: 'schema_migration', // Schema migration
      changedComponents: ['db/migrations/20261030_v2.sql']
    };

    const context = {
      targetService: MOCK_SERVICES[0],
      allServices: MOCK_SERVICES,
      slos: [{ id: 'slo-pay', serviceId: 'payment-service', enabled: true }],
      sloEvaluations: [{ sloId: 'slo-pay', status: 'breached', remainingBudgetPercent: -5.0 }],
      activeIncidents: [{ id: 'INC-4921', serviceId: 'payment-service', status: 'investigating' }],
      activeAlerts: [{ id: 'ALT-1092', serviceId: 'payment-service', status: 'active', severity: 'critical' }],
      deploymentHistory: [
        { status: 'failed' }, { status: 'failed' }, { status: 'successful' }, { status: 'failed' }
      ], // 75% failure rate
      telemetryStatus: { isAvailable: true, quality: 'good', isSimulated: true }
    };

    const risk = calculateDeploymentRisk(proposal, context);

    assert.ok(risk.riskScore >= 75, `Expected high risk score, got: ${risk.riskScore}`);
    assert.equal(risk.riskCategory, 'critical');
    assert.equal(risk.recommendation, 'HIGH_RISK');
    assert.equal(risk.factorBreakdowns.changeScope.points, 15); // Maxed out (major + recreate + schema)
    assert.equal(risk.factorBreakdowns.serviceCriticality.points, 15); // Tier 0
    assert.equal(risk.factorBreakdowns.preDeploymentSlo.points, 10); // Breached
    assert.equal(risk.factorBreakdowns.errorBudget.points, 10); // Exhausted
    assert.equal(risk.factorBreakdowns.recentIncidents.points, 10); // Active incident
    assert.ok(risk.recommendedVerifications.length > 0);
  });

  test('5. Missing Evidence Behavior: Degrades confidence and flags uncertainty', () => {
    const proposal = {
      serviceId: 'inventory-mesh',
      previousVersion: 'v1.0.0',
      newVersion: 'v1.0.1'
    };

    const context = {
      targetService: MOCK_SERVICES[3], // Tier 1
      allServices: MOCK_SERVICES,
      slos: [],
      sloEvaluations: [],
      activeIncidents: [],
      activeAlerts: [],
      deploymentHistory: [], // Zero history
      telemetryStatus: { isAvailable: false, quality: 'missing_telemetry', isSimulated: false }
    };

    const risk = calculateDeploymentRisk(proposal, context);

    assert.equal(risk.confidence, 'low');
    assert.equal(risk.recommendation, 'INSUFFICIENT_EVIDENCE');
    assert.ok(risk.missingEvidence.some(m => m.includes('missing or disconnected')));
    assert.ok(risk.missingEvidence.some(m => m.includes('Insufficient historical deployment samples')));
  });

  test('6. Insufficient Historical Samples: Does not invent or fabricate failure rate', () => {
    const proposal = {
      serviceId: 'checkout-api',
      previousVersion: 'v3.1.0',
      newVersion: 'v3.1.1'
    };

    const context = {
      targetService: MOCK_SERVICES[1],
      allServices: MOCK_SERVICES,
      deploymentHistory: [{ status: 'successful' }, { status: 'successful' }] // N = 2 < 3
    };

    const risk = calculateDeploymentRisk(proposal, context);
    const hist = risk.factorBreakdowns.historicalFailureRate;

    assert.equal(hist.details.status, 'insufficient_data');
    assert.equal(hist.details.failureRatePercent, null); // Never fabricated
    assert.equal(hist.points, 4); // Neutral uncertainty baseline
    assert.equal(hist.details.sampleSize, 2);
  });

  test('7. Pre-Deployment SLO Health Integration: Healthy SLO produces 0 penalty points', () => {
    const proposal = {
      serviceId: 'inventory-mesh',
      previousVersion: 'v1.0.0',
      newVersion: 'v1.0.1'
    };

    const context = {
      targetService: MOCK_SERVICES[3],
      allServices: MOCK_SERVICES,
      slos: [{ id: 'slo-inv', serviceId: 'inventory-mesh', enabled: true }],
      sloEvaluations: [{ sloId: 'slo-inv', status: 'nominal', remainingBudgetPercent: 88.5 }],
      deploymentHistory: [{ status: 'successful' }, { status: 'successful' }, { status: 'successful' }]
    };

    const risk = calculateDeploymentRisk(proposal, context);

    assert.equal(risk.factorBreakdowns.preDeploymentSlo.points, 0);
    assert.equal(risk.factorBreakdowns.errorBudget.points, 0);
    assert.ok(risk.riskScore < 30);
    assert.equal(risk.recommendation, 'LOW_RISK');
  });

  test('8. Post-Deployment Regression Detection: Identifies latency and error rate shifts', async () => {
    const { evaluateDeploymentRegressions } = await import('../../backend/src/services/deploymentRegression.service.js');

    const result = await evaluateDeploymentRegressions('chg-1094', {
      currentLatency: 412,
      baselineLatency: 24,
      currentErrorRate: 4.12,
      baselineErrorRate: 0.02,
      observationWindowMinutes: 30
    });

    assert.equal(result.hasRegressions, true);
    assert.ok(result.regressionsDetectedCount >= 2);

    const latReg = result.regressions.find(r => r.metric_name === 'latency_p99' || r.metricName === 'latency_p99');
    assert.ok(latReg);
    assert.equal(latReg.regression_severity || latReg.regressionSeverity, 'critical');
    assert.ok(Number(latReg.delta_percent || latReg.deltaPercent) > 1000);
  });

  test('9. Temporal Correlation vs Causation: Explicitly labels temporal association without proving causality', async () => {
    const { evaluateDeploymentRegressions } = await import('../../backend/src/services/deploymentRegression.service.js');

    const result = await evaluateDeploymentRegressions('chg-1094', {
      currentLatency: 150,
      baselineLatency: 30
    });

    const reg = result.regressions[0];
    assert.equal(reg.temporal_association ?? reg.temporalAssociation, true);
    assert.equal(reg.causality_status || reg.causalityStatus, 'correlated_temporal');
    assert.ok(reg.explanation.includes('temporal correlation'));
    assert.ok(reg.explanation.includes('causal attribution requires'));
  });

  test('10. Controlled Webhook Ingestion: Rejects invalid tokens with 401 Unauthorized', async () => {
    const { handleDeploymentWebhook } = await import('../../backend/src/controllers/change.controller.js');

    let errorThrown = null;
    const req = {
      headers: { 'x-infrapulse-token': 'wrong-token' },
      body: { serviceId: 'payment-service', newVersion: 'v1.8.4' }
    };
    const res = {};
    const next = (err) => { errorThrown = err; };

    await handleDeploymentWebhook(req, res, next);

    assert.ok(errorThrown);
    assert.equal(errorThrown.statusCode, 401);
  });

  test('11. Idempotent Webhook Handling: Re-submitting same idempotency key returns existing record', async () => {
    const { registerChangeEvent } = await import('../../backend/src/services/changeIntelligence.service.js');

    const idempotencyKey = `test-idemp-${Date.now()}`;
    const payload = {
      serviceId: 'payment-service',
      newVersion: 'v1.8.9',
      idempotencyKey,
      actor: 'test-ci'
    };

    const first = await registerChangeEvent(payload);
    assert.equal(first.idempotent, false);
    assert.ok(first.changeEvent.id);

    // Re-run with same idempotency key
    const second = await registerChangeEvent(payload);
    assert.equal(second.idempotent, true);
    assert.equal(second.changeEvent.id, first.changeEvent.id);
  });

  test('12. AI Assistant Grounding: Incorporates change events and regressions into verifiable catalog', () => {
    const incident = {
      id: 'INC-4921',
      title: 'Cascading Timeouts',
      serviceId: 'payment-service',
      serviceName: 'payment-service'
    };

    const changes = [
      { id: '1094', service_id: 'payment-service', new_version: 'v1.8.3', environment: 'canary', status: 'failed' }
    ];

    const regressions = [
      { id: 'reg-01', service_id: 'payment-service', metric_name: 'latency_p99', delta_percent: 1616.7, explanation: 'p99 spike' }
    ];

    const context = buildEvidenceContext({
      incident,
      investigation: { hypotheses: [] },
      changes,
      regressions
    });

    assert.ok(context.evidenceCatalog.some(e => e.id === 'chg-1094' && e.type === 'change_event'));
    assert.ok(context.evidenceCatalog.some(e => e.id === 'reg-reg-01' && e.type === 'deployment_regression'));
    assert.ok(context.changesSummary.length > 0);
    assert.ok(context.regressionsSummary.length > 0);
  });

  test('13. Database Persistence: Initial changes and assessments survive in PostgreSQL', async () => {
    const change = await changeRepo.findChangeEventById('chg-1094');
    assert.ok(change);
    assert.equal(change.service_id, 'payment-service');
    assert.equal(change.new_version, 'v1.8.3');

    const assessment = await changeRepo.findAssessmentByChangeId('chg-1094');
    assert.ok(assessment);
    assert.equal(assessment.risk_score, 78);
    assert.equal(assessment.recommendation, 'HIGH_RISK');

    const regressions = await changeRepo.findRegressionsByChangeId('chg-1094');
    assert.ok(regressions.length >= 2);
    assert.ok(regressions.some(r => r.metric_name === 'latency_p99'));
  });

  test('14. Historical Change Intelligence: Computes DORA metrics across sufficient sample', async () => {
    const { getHistoricalChangeAnalytics } = await import('../../backend/src/services/deploymentHistory.service.js');

    const analytics = await getHistoricalChangeAnalytics();

    assert.equal(analytics.sampleSizeStatus, 'sufficient_sample');
    assert.ok(analytics.sampleSize >= 3);
    assert.ok(analytics.metrics.changeFailureRatePercent > 0);
    assert.ok(analytics.dateRange.timespanHours >= 1);
    assert.ok(analytics.metrics.byEnvironment.production);
    assert.ok(analytics.metrics.byEnvironment.canary);
  });

  test('15. Blast Radius Summary: Isolated leaf service reports 0 downstream callers', () => {
    // edge-gateway is at the front edge; no other service calls edge-gateway
    const blast = calculateBlastRadius('edge-gateway', MOCK_SERVICES);

    assert.equal(blast.directDownstream.length, 0);
    assert.equal(blast.transitiveDownstream.length, 0);
    assert.equal(blast.totalImpactedCount, 0);
    assert.ok(blast.summary.includes('0 downstream callers'));
  });
});

