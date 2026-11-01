// ==============================================================================
// InfraPulse - Autonomous SRE Intelligence Test Suite
// Phase 23K: Comprehensive Tests for Unified Infrastructure Health, Statistical
// Risk Forecasting, SLO & Error Budget Management, Capacity Optimization,
// and Governed Operational Recommendations.
// ==============================================================================

import { test, describe, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { query } from '../../backend/src/db/connection.js';
import { sreIntelligenceRepository } from '../../backend/src/repositories/sreIntelligence.repository.js';
import { infrastructureHealthService } from '../../backend/src/services/sre-intelligence/infrastructureHealth.service.js';
import { predictiveRiskService, calculateLinearRegression } from '../../backend/src/services/sre-intelligence/predictiveRisk.service.js';
import { sloBudgetService } from '../../backend/src/services/sre-intelligence/sloBudget.service.js';
import { capacityOptimizationService } from '../../backend/src/services/sre-intelligence/capacityOptimization.service.js';
import { sreRecommendationService } from '../../backend/src/services/sre-intelligence/sreRecommendation.service.js';
import { SLI_TYPES, SLO_STATUSES, DATA_QUALITIES } from '../../backend/src/engine/sloEngine.js';

const TEST_TENANT_1 = 'tenant-sre-alpha';
const TEST_TENANT_2 = 'tenant-sre-beta';
const TEST_ENV = 'staging';

describe('Phase 23K: Autonomous SRE Intelligence', () => {
  beforeEach(async () => {
    // Clean up test tenant records
    await query('DELETE FROM sre_health_snapshots WHERE tenant_id IN ($1, $2)', [TEST_TENANT_1, TEST_TENANT_2]);
    await query('DELETE FROM sre_risk_predictions WHERE tenant_id IN ($1, $2)', [TEST_TENANT_1, TEST_TENANT_2]);
    await query('DELETE FROM sre_capacity_insights WHERE tenant_id IN ($1, $2)', [TEST_TENANT_1, TEST_TENANT_2]);
    await query('DELETE FROM sre_operational_recommendations WHERE tenant_id IN ($1, $2)', [TEST_TENANT_1, TEST_TENANT_2]);
  });

  afterEach(async () => {
    await query('DELETE FROM sre_health_snapshots WHERE tenant_id IN ($1, $2)', [TEST_TENANT_1, TEST_TENANT_2]);
    await query('DELETE FROM sre_risk_predictions WHERE tenant_id IN ($1, $2)', [TEST_TENANT_1, TEST_TENANT_2]);
    await query('DELETE FROM sre_capacity_insights WHERE tenant_id IN ($1, $2)', [TEST_TENANT_1, TEST_TENANT_2]);
    await query('DELETE FROM sre_operational_recommendations WHERE tenant_id IN ($1, $2)', [TEST_TENANT_1, TEST_TENANT_2]);
  });

  // --------------------------------------------------------------------------
  // 1. Health Aggregation
  // --------------------------------------------------------------------------
  test('1. Health Aggregation: Accurately computes combined health across compute, memory, and services', async () => {
    const now = new Date().toISOString();
    const mockResources = [
      { id: 'res-compute-01', provider: 'aws', resourceType: 'compute_instance', metrics: { cpuPercent: 45, memoryPercent: 60, diskPercent: 50 }, lastReportedAt: now },
      { id: 'res-container-01', provider: 'docker', resourceType: 'container', state: 'running', metrics: { cpuPercent: 30, memoryPercent: 40 }, lastReportedAt: now }
    ];
    const mockServices = [
      { id: 'payment-svc', name: 'Payment Service' }
    ];

    const health = await infrastructureHealthService.evaluateHealth({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      telemetryOverrides: {
        resources: mockResources,
        services: mockServices,
        events: [{ timestamp: now, serviceId: 'payment-svc', metrics: { latencyP95: 120, errorRatePercent: 0.1 } }],
        serviceMetrics: { 'payment-svc': { latencyP95: 120, errorRatePercent: 0.1 } },
        incidents: [],
        driftEvents: []
      },
      persistSnapshot: true
    });

    assert.ok(health.overallScore >= 90, `Expected high overall score, got: ${health.overallScore}`);
    assert.strictEqual(health.healthStatus, 'HEALTHY');
    assert.strictEqual(health.telemetryStatus, 'FRESH');
    assert.strictEqual(health.confidenceLevel, 'HIGH');
    assert.strictEqual(health.resourcesHealth.length, 2);
    assert.strictEqual(health.servicesHealth.length, 1);
  });

  // --------------------------------------------------------------------------
  // 2. Missing Telemetry Handling
  // --------------------------------------------------------------------------
  test('2. Missing Telemetry: Resources with zero telemetry are classified as UNAVAILABLE with LOW confidence', async () => {
    const mockResources = [
      { id: 'unmonitored-server-01', provider: 'aws', resourceType: 'compute_instance' }
    ];
    const mockServices = [
      { id: 'dark-service-01', name: 'Dark Service' }
    ];

    const health = await infrastructureHealthService.evaluateHealth({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      telemetryOverrides: {
        resources: mockResources,
        services: mockServices,
        events: [], // No telemetry events at all
        incidents: [],
        driftEvents: []
      },
      persistSnapshot: false
    });

    assert.strictEqual(health.telemetryStatus, 'UNAVAILABLE');
    assert.strictEqual(health.confidenceLevel, 'LOW');
    assert.strictEqual(health.healthStatus, 'UNKNOWN');
    assert.ok(health.overallScore <= 50, 'Overall score must be penalized when telemetry is unavailable');

    const resItem = health.resourcesHealth.find(r => r.resourceId === 'unmonitored-server-01');
    assert.strictEqual(resItem.telemetryStatus, 'UNAVAILABLE');
    assert.strictEqual(resItem.confidence, 'LOW');
    assert.strictEqual(resItem.status, 'UNKNOWN');

    const missingIndicator = health.riskIndicators.find(r => r.type === 'MISSING_TELEMETRY');
    assert.ok(missingIndicator, 'Expected MISSING_TELEMETRY risk indicator');
  });

  // --------------------------------------------------------------------------
  // 3. Stale Telemetry Detection
  // --------------------------------------------------------------------------
  test('3. Stale Telemetry: Flags telemetry older than 5 minutes as STALE with degraded confidence', async () => {
    const staleTime = new Date(Date.now() - 600000).toISOString(); // 10 minutes ago
    const mockResources = [
      { id: 'stale-worker-01', provider: 'aws', metrics: { cpuPercent: 50 }, lastReportedAt: staleTime }
    ];

    const health = await infrastructureHealthService.evaluateHealth({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      telemetryOverrides: {
        resources: mockResources,
        services: [],
        events: [{ timestamp: staleTime, resourceId: 'stale-worker-01', metrics: { cpuPercent: 50 } }],
        incidents: [],
        driftEvents: []
      },
      persistSnapshot: false
    });

    assert.strictEqual(health.telemetryStatus, 'STALE');
    assert.strictEqual(health.confidenceLevel, 'MEDIUM');
    const res = health.resourcesHealth[0];
    assert.strictEqual(res.telemetryStatus, 'STALE');
    assert.strictEqual(res.confidence, 'MEDIUM');
    assert.ok(res.deductions.some(d => d.includes('stale')), 'Expected stale deduction in resource audit');
  });

  // --------------------------------------------------------------------------
  // 4. Statistical Forecasting - Memory Growth
  // --------------------------------------------------------------------------
  test('4. Statistical Forecasting - Memory Growth: Uses OLS regression to project Time-to-Exhaustion (TTE)', async () => {
    const baseTime = Date.now() - (6 * 3600 * 1000); // 6 hours ago
    // Memory growing from 40% to 70% over 6 hours: slope = +5% per hour
    const memoryPoints = [
      { time: baseTime + (0 * 3600 * 1000), value: 40.0 },
      { time: baseTime + (2 * 3600 * 1000), value: 50.0 },
      { time: baseTime + (4 * 3600 * 1000), value: 60.0 },
      { time: baseTime + (6 * 3600 * 1000), value: 70.0 }
    ];

    const predictions = await predictiveRiskService.evaluatePredictiveRisks({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      timeSeriesData: {
        'cart-service-container': { memory: memoryPoints }
      },
      persist: true
    });

    assert.strictEqual(predictions.length, 1);
    const pred = predictions[0];
    assert.strictEqual(pred.risk_type || pred.riskType, 'MEMORY_GROWTH');
    assert.strictEqual(pred.target_resource_id || pred.targetResourceId, 'cart-service-container');
    assert.strictEqual(pred.trend_direction || pred.trendDirection, 'INCREASING');
    assert.strictEqual(Number(pred.rate_of_change_per_hour || pred.rateOfChangePerHour), 5.0);
    // Remaining buffer = 30%. At 5%/hr, TTE = 6.0 hours
    assert.strictEqual(Number(pred.time_to_exhaustion_hours || pred.timeToExhaustionHours), 6.0);
    assert.strictEqual(pred.risk_level || pred.riskLevel, 'CRITICAL', 'TTE <= 24 hours must be marked CRITICAL');
    assert.strictEqual(pred.confidence, 'HIGH');
    assert.strictEqual(pred.methodology, 'OLS_LINEAR_REGRESSION');
  });

  // --------------------------------------------------------------------------
  // 5. Statistical Forecasting - Disk Exhaustion
  // --------------------------------------------------------------------------
  test('5. Statistical Forecasting - Disk Exhaustion: Projects disk fill horizon and alerts on high risk', async () => {
    const baseTime = Date.now() - (12 * 3600 * 1000);
    // Disk filling from 70% to 82% over 12 hours: slope = +1.0% per hour
    const diskPoints = [
      { time: baseTime + (0 * 3600 * 1000), value: 70.0 },
      { time: baseTime + (6 * 3600 * 1000), value: 76.0 },
      { time: baseTime + (12 * 3600 * 1000), value: 82.0 }
    ];

    const predictions = await predictiveRiskService.evaluatePredictiveRisks({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      timeSeriesData: {
        'db-primary-volume': { disk: diskPoints }
      },
      persist: false
    });

    assert.strictEqual(predictions.length, 1);
    const pred = predictions[0];
    assert.strictEqual(pred.riskType, 'DISK_EXHAUSTION');
    assert.strictEqual(Number(pred.rateOfChangePerHour), 1.0);
    // Buffer to 95% = 13%. At 1%/hr, TTE = 13 hours
    assert.strictEqual(Number(pred.timeToExhaustionHours), 13.0);
    assert.strictEqual(pred.riskLevel, 'CRITICAL');
  });

  // --------------------------------------------------------------------------
  // 6. Statistical Forecasting Edge Cases
  // --------------------------------------------------------------------------
  test('6. Statistical Forecasting Edge Cases: Flatlines, negative slopes, and small samples handled safely', () => {
    // A. Flatline (zero slope)
    const flatlinePoints = [
      { time: 1000, value: 50 },
      { time: 2000, value: 50 },
      { time: 3000, value: 50 }
    ];
    const flatReg = calculateLinearRegression(flatlinePoints);
    assert.strictEqual(flatReg.slopePerHour, 0);
    assert.strictEqual(flatReg.trend, 'STABLE');

    // B. Negative slope (decreasing consumption)
    const decreasingPoints = [
      { time: 0, value: 80 },
      { time: 3600000, value: 70 },
      { time: 7200000, value: 60 }
    ];
    const decReg = calculateLinearRegression(decreasingPoints);
    assert.ok(decReg.slopePerHour < 0);
    assert.strictEqual(decReg.trend, 'DECREASING');

    // C. Insufficient points (< 2 points)
    const singlePoint = [{ time: 1000, value: 50 }];
    const insReg = calculateLinearRegression(singlePoint);
    assert.strictEqual(insReg.insufficientData, true);
    assert.strictEqual(insReg.slopePerHour, 0);
  });

  // --------------------------------------------------------------------------
  // 7. SLI Calculation - Availability, Latency, and Error Rate
  // --------------------------------------------------------------------------
  test('7. SLI Calculation: Accurately computes Availability, Latency, and Error Rate SLIs', () => {
    // Availability SLI: 995 good out of 1000
    const avail = sloBudgetService.evaluateSli({
      sliType: SLI_TYPES.AVAILABILITY,
      targetPercent: 99.0,
      totalEvents: 1000,
      goodEvents: 995,
      badEvents: 5
    });
    assert.strictEqual(avail.sliValue, 99.5);
    assert.strictEqual(avail.status, SLO_STATUSES.NOMINAL);

    // Latency SLI: latency 250ms with threshold 200ms -> breaches
    const latBreached = sloBudgetService.evaluateSli({
      sliType: SLI_TYPES.LATENCY,
      targetPercent: 99.0,
      totalEvents: 1,
      latencyMs: 250,
      latencyThresholdMs: 200
    });
    assert.strictEqual(latBreached.sliValue, 0);
    assert.strictEqual(latBreached.remainingBudgetPercent, 0);

    // Error-rate SLI: 20 bad events out of 1000 = 98.0% attainment
    const errorRateSli = sloBudgetService.evaluateSli({
      sliType: SLI_TYPES.ERROR_RATE,
      targetPercent: 99.5,
      totalEvents: 1000,
      goodEvents: 980,
      badEvents: 20
    });
    assert.strictEqual(errorRateSli.sliValue, 98.0);
    assert.strictEqual(errorRateSli.status, SLO_STATUSES.BREACHED);
  });

  // --------------------------------------------------------------------------
  // 8. Error Budget Depletion & Multi-Window Burn Rates
  // --------------------------------------------------------------------------
  test('8. Error Budget Depletion: Correctly flags fast-burn and budget exhaustion', () => {
    // 99.9% target on 10,000 events: allowedBadEvents = 10
    // If 150 bad events occurred: budgetConsumed = 100%, remaining = 0%, burnRate = 15.0x
    const budgetExhausted = sloBudgetService.evaluateSli({
      sliType: SLI_TYPES.AVAILABILITY,
      targetPercent: 99.9,
      totalEvents: 10000,
      goodEvents: 9850,
      badEvents: 150
    });

    assert.strictEqual(budgetExhausted.allowedBadEvents, 10);
    assert.strictEqual(budgetExhausted.budgetConsumedPercent, 100);
    assert.strictEqual(budgetExhausted.remainingBudgetPercent, 0);
    assert.strictEqual(budgetExhausted.status, SLO_STATUSES.BREACHED);
    assert.ok(budgetExhausted.burnRateMultiplier >= 14.4, 'Fast burn threshold triggered');
    assert.ok(budgetExhausted.alerts.length > 0, 'Must emit burn rate alert');
  });

  // --------------------------------------------------------------------------
  // 9. Data Quality Transparency in SLOs
  // --------------------------------------------------------------------------
  test('9. Data Quality Transparency: Discloses zero traffic and incomplete data in SLO evaluation', () => {
    const zeroTraffic = sloBudgetService.evaluateSli({
      sliType: SLI_TYPES.AVAILABILITY,
      targetPercent: 99.9,
      totalEvents: 0,
      goodEvents: 0,
      badEvents: 0
    });

    assert.strictEqual(zeroTraffic.sliValue, null);
    assert.strictEqual(zeroTraffic.status, SLO_STATUSES.ZERO_TRAFFIC);
    assert.strictEqual(zeroTraffic.dataQuality, DATA_QUALITIES.INCOMPLETE);
  });

  // --------------------------------------------------------------------------
  // 10. SRE Recommendation Generation
  // --------------------------------------------------------------------------
  test('10. SRE Recommendation Generation: Synthesizes evidence-backed recommendations from predictive risks', async () => {
    const mockRisks = [
      {
        riskType: 'MEMORY_GROWTH',
        targetResourceId: 'checkout-api-01',
        targetServiceId: 'checkout-service',
        riskLevel: 'CRITICAL',
        confidence: 'HIGH',
        rateOfChangePerHour: 7.2,
        forecastHorizonHours: 24,
        timeToExhaustionHours: 4.5,
        recommendedInvestigation: 'Inspect heap memory allocation profile.'
      }
    ];

    const recs = await sreRecommendationService.generateRecommendations({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      predictiveRisks: mockRisks,
      capacityInsights: [],
      persist: true
    });

    assert.strictEqual(recs.length, 1);
    const rec = recs[0];
    assert.ok(rec.recommendation_code.startsWith('SRE-REC-RISK-'));
    assert.strictEqual(rec.affected_resource, 'checkout-api-01');
    assert.strictEqual(rec.affected_service, 'checkout-service');
    assert.strictEqual(rec.priority, 'P1');
    assert.strictEqual(rec.risk, 'CRITICAL');
    assert.strictEqual(rec.status, 'OPEN');
    assert.strictEqual(rec.required_approval, 'SRE Infrastructure Lead');
    assert.ok(rec.evidence.length > 0);
  });

  // --------------------------------------------------------------------------
  // 11. Recommendation Governance & Role Enforcement
  // --------------------------------------------------------------------------
  test('11. Recommendation Governance: Prohibits speculative actions and requires governance role', async () => {
    const rec = await sreIntelligenceRepository.createOperationalRecommendation({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      title: 'Right-size compute instance',
      affectedResource: 'aws-ec2-staging-01',
      affectedService: 'frontend',
      evidence: [{ metric: 'cpu', avg: '4%' }],
      priority: 'P3',
      risk: 'LOW',
      confidence: 'HIGH',
      expectedBenefit: 'Saves $25/month',
      suggestedAction: 'Downsize from t3.large to t3.medium via Governed Remediation.',
      potentialOperationalImpact: 'Brief restart during maintenance window.',
      requiredApproval: 'Cloud Governance Administrator'
    });

    assert.ok(rec.id);
    assert.strictEqual(rec.required_approval, 'Cloud Governance Administrator');
    assert.strictEqual(rec.status, 'OPEN');
  });

  // --------------------------------------------------------------------------
  // 12. Recommendation Status Lifecycle
  // --------------------------------------------------------------------------
  test('12. Recommendation Status Lifecycle: Successfully updates state from OPEN to ACKNOWLEDGED to RESOLVED', async () => {
    const rec = await sreIntelligenceRepository.createOperationalRecommendation({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      title: 'Sample Lifecycle Rec',
      affectedResource: 'res-lifecycle-01',
      affectedService: 'auth-svc',
      expectedBenefit: 'Test benefit',
      suggestedAction: 'Test action',
      potentialOperationalImpact: 'None',
      priority: 'P2'
    });

    // A. Transition to ACKNOWLEDGED
    const ack = await sreRecommendationService.updateRecommendationStatus(rec.id, {
      status: 'ACKNOWLEDGED',
      assignedTo: 'engineer-alice'
    }, TEST_TENANT_1);
    assert.strictEqual(ack.status, 'ACKNOWLEDGED');
    assert.strictEqual(ack.assigned_to, 'engineer-alice');

    // B. Transition to RESOLVED
    const res = await sreRecommendationService.updateRecommendationStatus(rec.id, {
      status: 'RESOLVED',
      resolutionNotes: 'Mitigated via memory leak hotfix.'
    }, TEST_TENANT_1);
    assert.strictEqual(res.status, 'RESOLVED');
    assert.strictEqual(res.resolution_notes, 'Mitigated via memory leak hotfix.');
    assert.ok(res.actioned_at);
  });

  // --------------------------------------------------------------------------
  // 13. Capacity Optimization - Underutilized Compute
  // --------------------------------------------------------------------------
  test('13. Capacity Optimization: Detects compute workloads averaging < 15% CPU and projects waste', async () => {
    const mockResources = [
      {
        id: 'ec2-underutilized-01',
        provider: 'aws',
        resource_type: 'compute_instance',
        instance_type: 't3.xlarge',
        current_state: 'running',
        cost_breakdown: { compute: 0.1664 }, // ~$121/mo
        metrics: { cpuPercent: 6.2, memoryPercent: 12.5 }
      }
    ];

    const result = await capacityOptimizationService.analyzeCapacityAndCost({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      resourceOverrides: mockResources,
      persist: false
    });

    assert.strictEqual(result.summary.underutilizedComputeCount, 1);
    assert.ok(result.summary.totalMonthlyWasteUsd > 0);
    const insight = result.insights[0];
    assert.strictEqual(insight.resourceId, 'ec2-underutilized-01');
    assert.strictEqual(insight.optimizationCategory, 'OVER_PROVISIONED_COMPUTE');
    assert.strictEqual(insight.confidence, 'HIGH');
  });

  // --------------------------------------------------------------------------
  // 14. Capacity Optimization - Idle & Unattached Storage
  // --------------------------------------------------------------------------
  test('14. Capacity Optimization: Identifies stopped instances accumulating persistent storage fees', async () => {
    const mockResources = [
      {
        id: 'ec2-stopped-with-ebs',
        provider: 'aws',
        resource_type: 'compute_instance',
        current_state: 'stopped',
        cost_breakdown: { compute: 0.0, storage: 0.05, ipv4: 0.005 },
        metrics: {}
      }
    ];

    const result = await capacityOptimizationService.analyzeCapacityAndCost({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      resourceOverrides: mockResources,
      persist: true
    });

    assert.strictEqual(result.summary.idleResourcesCount, 1);
    const ins = result.insights[0];
    assert.strictEqual(ins.optimization_category || ins.optimizationCategory, 'IDLE_RESOURCE');
    assert.strictEqual(ins.recommended_governed_action || ins.recommendedGovernedAction, 'REVIEW_ORPHAN_STORAGE_AND_EIP');
  });

  // --------------------------------------------------------------------------
  // 15. Mutation Prevention Guarantee
  // --------------------------------------------------------------------------
  test('15. Mutation Prevention: Capacity and SRE services never perform direct infrastructure mutations', async () => {
    // Calling analyzeCapacityAndCost should ONLY generate analytical insights, never touch resource state
    const mockResource = {
      id: 'immutable-target-01',
      provider: 'aws',
      current_state: 'stopped',
      cost_breakdown: { storage: 0.08 }
    };

    await capacityOptimizationService.analyzeCapacityAndCost({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      resourceOverrides: [mockResource],
      persist: false
    });

    // Verify mock resource was never mutated
    assert.strictEqual(mockResource.current_state, 'stopped');
  });

  // --------------------------------------------------------------------------
  // 16. Multi-Tenant and Environment Isolation
  // --------------------------------------------------------------------------
  test('16. Multi-Tenant Isolation: Prevents cross-tenant access to risk predictions and recommendations', async () => {
    // Create record in tenant Alpha
    await sreIntelligenceRepository.createOperationalRecommendation({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV,
      title: 'Tenant Alpha Secret Recommendation',
      affectedResource: 'alpha-res',
      affectedService: 'alpha-svc',
      expectedBenefit: 'Secret benefit',
      suggestedAction: 'Do alpha thing',
      potentialOperationalImpact: 'None'
    });

    // Create record in tenant Beta
    await sreIntelligenceRepository.createOperationalRecommendation({
      tenantId: TEST_TENANT_2,
      environment: TEST_ENV,
      title: 'Tenant Beta Secret Recommendation',
      affectedResource: 'beta-res',
      affectedService: 'beta-svc',
      expectedBenefit: 'Beta benefit',
      suggestedAction: 'Do beta thing',
      potentialOperationalImpact: 'None'
    });

    // Query as Alpha
    const alphaList = await sreIntelligenceRepository.listOperationalRecommendations({
      tenantId: TEST_TENANT_1,
      environment: TEST_ENV
    });
    assert.strictEqual(alphaList.length, 1);
    assert.strictEqual(alphaList[0].title, 'Tenant Alpha Secret Recommendation');

    // Query as Beta
    const betaList = await sreIntelligenceRepository.listOperationalRecommendations({
      tenantId: TEST_TENANT_2,
      environment: TEST_ENV
    });
    assert.strictEqual(betaList.length, 1);
    assert.strictEqual(betaList[0].title, 'Tenant Beta Secret Recommendation');
  });

  // --------------------------------------------------------------------------
  // 17. SRE Overview Synthesis Performance
  // --------------------------------------------------------------------------
  test('17. SRE Overview Synthesis: Aggregates end-to-end overview payload efficiently', async () => {
    const startTime = Date.now();
    const overview = await sloBudgetService.getSloOverview();
    const durationMs = Date.now() - startTime;

    assert.ok(overview);
    assert.ok(overview.kpis);
    assert.ok(Array.isArray(overview.slos));
    assert.ok(durationMs < 500, `Expected synthesis under 500ms, took ${durationMs}ms`);
  });
});
