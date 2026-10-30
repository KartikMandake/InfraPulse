import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRecurringPatterns,
  PATTERN_CATEGORIES
} from '../../backend/src/engine/failurePatternEngine.js';
import {
  calculateServiceRiskProfile,
  rankServicesByRisk,
  RISK_CATEGORIES
} from '../../backend/src/engine/serviceRiskEngine.js';
import {
  detectEarlyWarnings,
  EARLY_WARNING_CATEGORIES
} from '../../backend/src/engine/earlyWarningEngine.js';
import {
  preventiveRecommendationService,
  RECOMMENDATION_STATUS
} from '../../backend/src/services/preventiveRecommendation.service.js';
import { operationalIntelligenceService } from '../../backend/src/services/operationalIntelligence.service.js';
import { operationalTrendsService } from '../../backend/src/services/operationalTrends.service.js';
import { operationalIntelligenceRepository } from '../../backend/src/repositories/operationalIntelligence.repository.js';
import { query } from '../../backend/src/db/connection.js';

describe('Phase 18: Operational Intelligence & Predictive Incident Prevention', () => {

  test('1. Failure Pattern Engine: Requires >= 2 occurrences to label recurring pattern', () => {
    // Single isolated incident should NOT produce a recurring pattern
    const singleIncident = [{
      id: 'INC-ISO-01',
      service_id: 'payment-service',
      title: 'Database connection pool timeout in payment-service',
      description: 'Single isolated pool exhaustion incident',
      createdAt: new Date().toISOString()
    }];

    const isolatedPatterns = detectRecurringPatterns({ incidents: singleIncident });
    assert.equal(isolatedPatterns.length, 0, 'Single occurrence must not be declared a recurring pattern');

    // Two occurrences must produce a confirmed recurring pattern
    const recurringIncidents = [
      ...singleIncident,
      {
        id: 'INC-ISO-02',
        service_id: 'payment-service',
        title: 'Recurrent database connection starvation',
        description: 'Second occurrence of pool exhaustion',
        createdAt: new Date().toISOString()
      }
    ];

    const patterns = detectRecurringPatterns({ incidents: recurringIncidents });
    assert.equal(patterns.length, 1, 'Two occurrences must yield exactly 1 confirmed pattern');
    assert.equal(patterns[0].category, PATTERN_CATEGORIES.DATABASE_POOL_SATURATION);
    assert.equal(patterns[0].occurrenceCount, 2);
    assert.equal(patterns[0].sampleSize, 2);
    assert.ok(patterns[0].affectedServices.includes('payment-service'));
  });

  test('2. Failure Pattern Engine: Detects all 8 canonical failure patterns', () => {
    const mockIncidents = [
      // 1. db pool saturation (2 occurrences)
      { id: 'inc-1', service_id: 'payment-service', title: 'Database connection pool exhausted', createdAt: '2026-10-01T00:00:00Z' },
      { id: 'inc-2', service_id: 'payment-service', title: 'DB connection starvation during batch', createdAt: '2026-10-02T00:00:00Z' },
      // 2. timeout propagation (2 occurrences)
      { id: 'inc-3', service_id: 'auth-gateway-v2', title: '504 gateway timeout waiting for auth', createdAt: '2026-10-03T00:00:00Z' },
      { id: 'inc-4', service_id: 'auth-gateway-v2', title: 'Cascading timeout to upstream callers', createdAt: '2026-10-04T00:00:00Z' },
      // 4. latency degradation (2 occurrences)
      { id: 'inc-5', service_id: 'checkout-api', title: 'P99 latency spike to 800ms', createdAt: '2026-10-05T00:00:00Z' },
      { id: 'inc-6', service_id: 'checkout-api', title: 'Slow response times on checkout endpoint', createdAt: '2026-10-06T00:00:00Z' },
      // 5. repeated 5xx (2 occurrences)
      { id: 'inc-7', service_id: 'inventory-mesh', title: 'HTTP 5xx server error surge', createdAt: '2026-10-07T00:00:00Z' },
      { id: 'inc-8', service_id: 'inventory-mesh', title: '500 internal server error spike', createdAt: '2026-10-08T00:00:00Z' },
      // 7. resource pressure (2 occurrences)
      { id: 'inc-9', service_id: 'cart-service', title: 'Container OOM crashloop', createdAt: '2026-10-09T00:00:00Z' },
      { id: 'inc-10', service_id: 'cart-service', title: 'CPU saturation and memory leak', createdAt: '2026-10-10T00:00:00Z' },
      // 8. multi-hop path failure (2 occurrences)
      { id: 'inc-11', service_id: 'checkout-api', affected_services: ['checkout-api', 'payment-service'], title: 'Multi-service cascade', createdAt: '2026-10-11T00:00:00Z' },
      { id: 'inc-12', service_id: 'checkout-api', affected_services: ['checkout-api', 'payment-service'], title: 'Second multi-service cascade', createdAt: '2026-10-12T00:00:00Z' }
    ];

    // 3. deployment regression (2 occurrences)
    const mockRegressions = [
      { id: 'reg-1', service_id: 'payment-service', release_version: 'v1.8.3', detected_at: '2026-10-13T00:00:00Z' },
      { id: 'reg-2', service_id: 'payment-service', release_version: 'v1.8.4', detected_at: '2026-10-14T00:00:00Z' }
    ];

    // 6. repeated slo exhaustion (2 occurrences)
    const mockSloAlerts = [
      { id: 'slo-1', service_id: 'payment-service', slo_name: 'Availability', triggered_at: '2026-10-15T00:00:00Z' },
      { id: 'slo-2', service_id: 'payment-service', slo_name: 'Latency', triggered_at: '2026-10-16T00:00:00Z' }
    ];

    const detected = detectRecurringPatterns({
      incidents: mockIncidents,
      regressions: mockRegressions,
      sloAlerts: mockSloAlerts
    });

    const categoriesFound = new Set(detected.map(p => p.category));
    assert.ok(categoriesFound.has(PATTERN_CATEGORIES.DATABASE_POOL_SATURATION), 'Missing db pool pattern');
    assert.ok(categoriesFound.has(PATTERN_CATEGORIES.DEPENDENCY_TIMEOUT_PROPAGATION), 'Missing timeout pattern');
    assert.ok(categoriesFound.has(PATTERN_CATEGORIES.DEPLOYMENT_ASSOCIATED_REGRESSION), 'Missing regression pattern');
    assert.ok(categoriesFound.has(PATTERN_CATEGORIES.REPEATED_LATENCY_DEGRADATION), 'Missing latency pattern');
    assert.ok(categoriesFound.has(PATTERN_CATEGORIES.REPEATED_5XX_INCIDENTS), 'Missing 5xx pattern');
    assert.ok(categoriesFound.has(PATTERN_CATEGORIES.REPEATED_SLO_EXHAUSTION), 'Missing slo exhaustion pattern');
    assert.ok(categoriesFound.has(PATTERN_CATEGORIES.RESOURCE_PRESSURE), 'Missing resource pressure pattern');
    assert.ok(categoriesFound.has(PATTERN_CATEGORIES.RECURRING_DEPENDENCY_PATH_FAILURE), 'Missing multi-hop pattern');
    assert.equal(categoriesFound.size, 8, 'Must detect all 8 canonical pattern categories');
  });

  test('3. Service Risk Engine: Computes explainable 0-100 score and factor breakdown', () => {
    const mockService = { id: 'payment-service', name: 'payment-service' };
    const mockTelemetry = {
      incidents: [
        { id: 'inc-1', created_at: '2026-10-01T00:00:00Z', resolved_at: '2026-10-01T00:45:00Z' },
        { id: 'inc-2', created_at: '2026-10-02T00:00:00Z', resolved_at: '2026-10-02T00:35:00Z' },
        { id: 'inc-3', created_at: '2026-10-03T00:00:00Z', resolved_at: '2026-10-03T00:50:00Z' }
      ],
      regressions: [
        { id: 'reg-1', release_version: 'v1.8.3' },
        { id: 'reg-2', release_version: 'v1.8.4' }
      ],
      slos: [
        { remaining_error_budget_percent: 15, current_attainment_percent: 98.5 }
      ],
      alerts: [
        { id: 'alt-1' }, { id: 'alt-2' }, { id: 'alt-3' }
      ]
    };

    const profile = calculateServiceRiskProfile(mockService, mockTelemetry);
    assert.ok(profile.riskScore >= 0 && profile.riskScore <= 100, 'Score must be bounded 0-100');
    assert.ok(profile.riskScore >= 60, 'High frequency, regressions, and low budget should result in high risk');
    assert.equal(profile.riskCategory, RISK_CATEGORIES.HIGH);
    assert.ok(profile.contributingFactors.incident_frequency.points > 0);
    assert.ok(profile.contributingFactors.mttr.points > 0);
    assert.ok(profile.contributingFactors.deployment_regressions.points > 0);
    assert.ok(profile.contributingFactors.slo_budget_exhaustion.points > 0);
    assert.equal(profile.sampleSize, 6);
    assert.equal(profile.confidence, 'high');
  });

  test('4. Service Risk Engine: Discloses insufficient samples without fabricating scores', () => {
    const isolatedService = { id: 'new-microservice', name: 'new-microservice' };
    const telemetry = {
      incidents: [],
      regressions: [],
      slos: [],
      alerts: []
    };

    const profile = calculateServiceRiskProfile(isolatedService, telemetry);
    assert.equal(profile.riskScore, 0);
    assert.equal(profile.riskCategory, RISK_CATEGORIES.LOW);
    assert.equal(profile.sampleSize, 0);
    assert.equal(profile.confidence, 'low', 'Sample size < 3 must be flagged with low confidence');
    assert.equal(profile.contributingFactors.mttr.explanation, 'Insufficient resolved incident samples for MTTR calculation');
  });

  test('5. Early-Warning Engine: Detects deterministic leading indicators', () => {
    const services = [
      {
        id: 'payment-service',
        name: 'payment-service',
        latencyBaseline: 25,
        latencyP99: 110, // > 3x baseline creep
        errorRate: 1.2,
        cpuPercent: 88
      }
    ];

    const slos = [
      {
        service_id: 'payment-service',
        name: 'Payment Availability',
        burn_rate_1h: 14.4, // accelerating budget burn
        remaining_error_budget_percent: 18,
        target_percentage: 99.9
      }
    ];

    const regressions = [
      { service_id: 'payment-service', release_version: 'v1.8.3' },
      { service_id: 'payment-service', release_version: 'v1.8.4' }
    ];

    const warnings = detectEarlyWarnings({ services, slos, regressions, alerts: [] });
    assert.ok(warnings.length >= 2, 'Should detect multiple distinct leading indicators');

    const burnWarning = warnings.find(w => w.category === EARLY_WARNING_CATEGORIES.ACCELERATING_BUDGET_BURN);
    assert.ok(burnWarning, 'Must identify accelerating error budget burn');
    assert.equal(burnWarning.severity, 'critical');
    assert.ok(burnWarning.recommendedInvestigation.includes('RB-LATENCY-01'));

    const creepWarning = warnings.find(w => w.category === EARLY_WARNING_CATEGORIES.LATENCY_CREEP_EARLY_WARNING);
    assert.ok(creepWarning, 'Must detect sub-threshold latency creep');
  });

  test('6. Early-Warning Engine: Grounding check enforces bounded deterministic terminology', () => {
    const services = [{ id: 'svc-test', name: 'svc-test', latencyBaseline: 20, latencyP99: 80, errorRate: 0.5 }];
    const warnings = detectEarlyWarnings({ services, slos: [], regressions: [], alerts: [] });

    for (const w of warnings) {
      assert.ok(!w.historicalComparison.includes('AI predicts outage'), 'Must not claim blackbox outage prediction');
      assert.ok(!w.recommendedInvestigation.includes('Magic fix'), 'Actions must be grounded');
      assert.ok(w.indicators.length > 0, 'Indicators must be explicit deterministic statements');
    }
  });

  test('7. Preventive Recommendations: Complete Lifecycle State Machine', async () => {
    const user = { id: 'usr_responder_002', role: 'responder' };

    // 1. Create OPEN recommendation
    const rec = await preventiveRecommendationService.createRecommendation({
      title: 'Tune Postgres Pool Lease Timeouts',
      explanation: 'Decrease connection acquisition lease timeout to avoid long thread blocks',
      serviceId: 'payment-service',
      serviceName: 'payment-service',
      priority: 'P1',
      verificationMethod: 'Run 1000 concurrent load test queries and confirm lease timeouts < 50ms'
    }, user);

    assert.ok(rec.id);
    assert.equal(rec.status, RECOMMENDATION_STATUS.OPEN);

    // 2. Transition OPEN -> ACKNOWLEDGED
    const acked = await preventiveRecommendationService.transitionStatus(rec.id, {
      status: RECOMMENDATION_STATUS.ACKNOWLEDGED
    }, user);
    assert.equal(acked.status, RECOMMENDATION_STATUS.ACKNOWLEDGED);

    // 3. Transition ACKNOWLEDGED -> IN_PROGRESS
    const inProgress = await preventiveRecommendationService.transitionStatus(rec.id, {
      status: RECOMMENDATION_STATUS.IN_PROGRESS
    }, user);
    assert.equal(inProgress.status, RECOMMENDATION_STATUS.IN_PROGRESS);

    // 4. Transition IN_PROGRESS -> VERIFIED (Verification Gate requires valid notes)
    const verified = await preventiveRecommendationService.transitionStatus(rec.id, {
      status: RECOMMENDATION_STATUS.VERIFIED,
      verificationNotes: 'Completed load test with 1000 simulated clients; 0 connection starvation alerts triggered.'
    }, user);
    assert.equal(verified.status, RECOMMENDATION_STATUS.VERIFIED);
    assert.ok(verified.verificationNotes.includes('1000 simulated clients'));

    // 5. Transition VERIFIED -> CLOSED
    const closed = await preventiveRecommendationService.transitionStatus(rec.id, {
      status: RECOMMENDATION_STATUS.CLOSED
    }, user);
    assert.equal(closed.status, RECOMMENDATION_STATUS.CLOSED);
  });

  test('8. Verification Gate: Rejects transition to VERIFIED with empty verification notes', async () => {
    const user = { id: 'usr_responder_002', role: 'responder' };

    const rec = await preventiveRecommendationService.createRecommendation({
      title: 'Add Gateway Token Cache',
      explanation: 'Cache tokens locally to handle Redis latency spikes',
      serviceId: 'auth-gateway-v2',
      serviceName: 'auth-gateway-v2',
      priority: 'P1',
      verificationMethod: 'Inject Redis latency and verify token cache hits'
    }, user);

    await preventiveRecommendationService.transitionStatus(rec.id, { status: RECOMMENDATION_STATUS.ACKNOWLEDGED }, user);
    await preventiveRecommendationService.transitionStatus(rec.id, { status: RECOMMENDATION_STATUS.IN_PROGRESS }, user);

    // Attempting to mark VERIFIED without notes MUST be rejected
    await assert.rejects(
      async () => {
        await preventiveRecommendationService.transitionStatus(rec.id, {
          status: RECOMMENDATION_STATUS.VERIFIED,
          verificationNotes: ''
        }, user);
      },
      (err) => {
        assert.ok(err.message.includes('Verification Gate Violation'));
        return true;
      }
    );

    // Attempting to mark VERIFIED with notes < 10 chars MUST also be rejected
    await assert.rejects(
      async () => {
        await preventiveRecommendationService.transitionStatus(rec.id, {
          status: RECOMMENDATION_STATUS.VERIFIED,
          verificationNotes: 'fixed it'
        }, user);
      },
      (err) => {
        assert.ok(err.message.includes('minimum 10 characters'));
        return true;
      }
    );
  });

  test('9. Lifecycle Defense: Rejects illegal state jumps (e.g. IN_PROGRESS -> CLOSED)', async () => {
    const user = { id: 'usr_responder_002', role: 'responder' };

    const rec = await preventiveRecommendationService.createRecommendation({
      title: 'Upgrade Connection Driver',
      explanation: 'Upgrade database driver to fix pool leak',
      serviceId: 'ledger-db-proxy',
      serviceName: 'ledger-db-proxy',
      priority: 'P2',
      verificationMethod: 'Run soak test for 24h'
    }, user);

    await preventiveRecommendationService.transitionStatus(rec.id, { status: RECOMMENDATION_STATUS.ACKNOWLEDGED }, user);
    await preventiveRecommendationService.transitionStatus(rec.id, { status: RECOMMENDATION_STATUS.IN_PROGRESS }, user);

    // Attempting to jump directly from IN_PROGRESS to CLOSED without verification MUST be rejected
    await assert.rejects(
      async () => {
        await preventiveRecommendationService.transitionStatus(rec.id, {
          status: RECOMMENDATION_STATUS.CLOSED
        }, user);
      },
      (err) => {
        assert.ok(err.message.includes('Invalid status transition from IN_PROGRESS to CLOSED'));
        return true;
      }
    );
  });

  test('10. Dismissal Gate: Rejects DISMISSED without explicit dismissal reason', async () => {
    const user = { id: 'usr_responder_002', role: 'responder' };

    const rec = await preventiveRecommendationService.createRecommendation({
      title: 'Temporary Workaround Rule',
      explanation: 'A short term fix that may be superseded',
      serviceId: 'cart-service',
      serviceName: 'cart-service',
      priority: 'P3',
      verificationMethod: 'Check metric'
    }, user);

    await assert.rejects(
      async () => {
        await preventiveRecommendationService.transitionStatus(rec.id, {
          status: RECOMMENDATION_STATUS.DISMISSED,
          dismissedReason: '   '
        }, user);
      },
      (err) => {
        assert.ok(err.message.includes('explicit dismissedReason'));
        return true;
      }
    );
  });

  test('11. Audit Logging: Records durable audit event for every recommendation transition', async () => {
    const user = { id: 'usr_responder_002', role: 'responder' };

    const rec = await preventiveRecommendationService.createRecommendation({
      title: 'Configure TCP KeepAlive for Redis',
      explanation: 'Set keepalive 60s to prevent silent socket drops',
      serviceId: 'auth-gateway-v2',
      serviceName: 'auth-gateway-v2',
      priority: 'P2',
      verificationMethod: 'Inspect socket stats'
    }, user);

    await preventiveRecommendationService.transitionStatus(rec.id, {
      status: RECOMMENDATION_STATUS.ACKNOWLEDGED
    }, user);

    const auditRes = await query(
      `SELECT * FROM audit_logs
       WHERE resource_id = $1 AND action = 'PREVENTIVE_RECOMMENDATION_TRANSITIONED'
       ORDER BY created_at DESC LIMIT 1`,
      [rec.id]
    );

    assert.equal(auditRes.rows.length, 1, 'Audit log entry must be created on transition');
    assert.equal(auditRes.rows[0].resource_type, 'preventive_recommendation');
    assert.equal(auditRes.rows[0].outcome, 'success');
  });

  test('12. Operational Trends: Computes recurrence rate and discloses sample transparency', async () => {
    const trends = await operationalTrendsService.computeTrends({ days: 30 });
    assert.ok(trends.windowStart);
    assert.ok(trends.windowEnd);
    assert.ok(typeof trends.sampleSize === 'number');
    assert.ok(trends.metrics);
    assert.ok(trends.metrics.sampleSizeNote, 'Must provide sample size transparency note');
    assert.ok(['high', 'medium', 'low'].includes(trends.confidence));
  });

  test('13. Trend Snapshots: Captures and retrieves immutable trend snapshot', async () => {
    const snapshot = await operationalTrendsService.captureSnapshot({ days: 30 });
    assert.ok(snapshot.id.startsWith('snap-'));
    assert.ok(snapshot.metrics);

    const snapshots = await operationalTrendsService.getRecentSnapshots(5);
    assert.ok(snapshots.length > 0);
    assert.ok(snapshots.some(s => s.id === snapshot.id));
  });

  test('14. Database Persistence: Seeded patterns and recommendations survive in PostgreSQL', async () => {
    const patterns = await operationalIntelligenceRepository.getPatterns();
    assert.ok(patterns.length >= 3, 'Must have at least 3 initial seeded operational patterns');

    const recs = await operationalIntelligenceRepository.getRecommendations();
    assert.ok(recs.length >= 3, 'Must have at least 3 initial seeded recommendations');

    const poolRec = recs.find(r => r.id === 'REC-POOL-01');
    assert.ok(poolRec, 'Must find seeded REC-POOL-01');
    assert.ok(poolRec.relevantRunbookIds.includes('RB-DB-01'));
  });

  test('15. Dashboard Summary API: Synthesizes platform-level KPIs and risk profile', async () => {
    const summary = await operationalIntelligenceService.getDashboardSummary();
    assert.ok(summary.kpis);
    assert.ok(summary.kpis.totalRecurringPatterns >= 3);
    assert.ok(summary.topRiskServices);
    assert.ok(summary.activeEarlyWarnings);
    assert.ok(summary.actionableRecommendations);
  });
});
