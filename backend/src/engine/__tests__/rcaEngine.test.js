import test from 'node:test';
import assert from 'node:assert/strict';

import { runRcaAnalysis } from '../rcaEngine.js';
import { computeWeightedScore, DEFAULT_SCORING_WEIGHTS } from '../scoring.js';
import { 
  SCENARIO_1_DEPLOYMENT_REGRESSION,
  SCENARIO_2_DEPENDENCY_CASCADE,
  SCENARIO_3_LATENCY_WITHOUT_DEPLOYMENT,
  SCENARIO_4_INCOMPLETE_TELEMETRY,
  SCENARIO_5_NO_CONVINCING_CANDIDATE
} from '../scenarios.js';

test('Backend RCA Engine: Scenario 1 - Recent Deployment Regression', () => {
  const results = runRcaAnalysis({
    incident: SCENARIO_1_DEPLOYMENT_REGRESSION.incident,
    services: SCENARIO_1_DEPLOYMENT_REGRESSION.services,
    alerts: SCENARIO_1_DEPLOYMENT_REGRESSION.alerts,
    deployments: SCENARIO_1_DEPLOYMENT_REGRESSION.deployments,
    logs: SCENARIO_1_DEPLOYMENT_REGRESSION.logs,
    traces: SCENARIO_1_DEPLOYMENT_REGRESSION.traces
  });

  assert.ok(results.length > 0, 'Hypotheses must not be empty');
  const topCandidate = results[0];
  assert.equal(topCandidate.rank, 1);
  assert.equal(topCandidate.candidateServiceId, 'payment-service');
  assert.ok(
    topCandidate.score >= (SCENARIO_1_DEPLOYMENT_REGRESSION.minExpectedScore || 70),
    `Top candidate score ${topCandidate.score} should exceed minimum threshold`
  );
  assert.ok(topCandidate.breakdown.deploymentCorrelationScore > 50, 'Deployment correlation score should be high');
  assert.ok(topCandidate.breakdown.anomalySeverityScore > 50, 'Anomaly severity score should be high');
  assert.ok(topCandidate.supportingEvidence.length > 0, 'Supporting evidence must be populated');
  assert.ok(topCandidate.relevantDeployments.length > 0, 'Relevant deployments should be listed');
  assert.match(topCandidate.suggestedNextAction, /canary/i, 'Suggested action should mention canary rollback');
});

test('Backend RCA Engine: Scenario 2 - Dependency Failure Cascade', () => {
  const results = runRcaAnalysis({
    incident: SCENARIO_2_DEPENDENCY_CASCADE.incident,
    services: SCENARIO_2_DEPENDENCY_CASCADE.services,
    alerts: SCENARIO_2_DEPENDENCY_CASCADE.alerts,
    deployments: SCENARIO_2_DEPENDENCY_CASCADE.deployments,
    logs: SCENARIO_2_DEPENDENCY_CASCADE.logs,
    traces: SCENARIO_2_DEPENDENCY_CASCADE.traces
  });

  assert.ok(results.length > 0, 'Hypotheses must not be empty');
  const topCandidate = results[0];
  assert.equal(topCandidate.candidateServiceId, 'ledger-db-proxy');
  assert.ok(
    topCandidate.score >= (SCENARIO_2_DEPENDENCY_CASCADE.minExpectedScore || 60),
    `Top candidate score ${topCandidate.score} should exceed threshold`
  );
  assert.ok(
    topCandidate.breakdown.dependencyRelevanceScore >= 90,
    'Downstream dependency score should be high (callee failure)'
  );
  assert.ok(topCandidate.breakdown.logErrorEvidenceScore > 0, 'Log error evidence should be captured');
});

test('Backend RCA Engine: Scenario 3 - Latency Anomaly Without Deployment', () => {
  const results = runRcaAnalysis({
    incident: SCENARIO_3_LATENCY_WITHOUT_DEPLOYMENT.incident,
    services: SCENARIO_3_LATENCY_WITHOUT_DEPLOYMENT.services,
    alerts: SCENARIO_3_LATENCY_WITHOUT_DEPLOYMENT.alerts,
    deployments: SCENARIO_3_LATENCY_WITHOUT_DEPLOYMENT.deployments,
    logs: SCENARIO_3_LATENCY_WITHOUT_DEPLOYMENT.logs,
    traces: SCENARIO_3_LATENCY_WITHOUT_DEPLOYMENT.traces
  });

  assert.ok(results.length > 0, 'Hypotheses must not be empty');
  const topCandidate = results[0];
  assert.equal(topCandidate.candidateServiceId, 'auth-gateway-v2');
  assert.equal(topCandidate.breakdown.deploymentCorrelationScore, 0, 'Deployment correlation score must be 0');
  assert.ok(topCandidate.breakdown.anomalySeverityScore > 40, 'Anomaly severity score must be substantial');
  assert.ok(
    topCandidate.uncertaintyAndMissingEvidence.some(u => u.includes('No recent deployment')),
    'Should document missing deployment correlation in uncertainty notes'
  );
});

test('Backend RCA Engine: Scenario 4 - Incomplete Telemetry Coverage', () => {
  const results = runRcaAnalysis({
    incident: SCENARIO_4_INCOMPLETE_TELEMETRY.incident,
    services: SCENARIO_4_INCOMPLETE_TELEMETRY.services,
    alerts: SCENARIO_4_INCOMPLETE_TELEMETRY.alerts,
    deployments: SCENARIO_4_INCOMPLETE_TELEMETRY.deployments,
    logs: SCENARIO_4_INCOMPLETE_TELEMETRY.logs,
    traces: SCENARIO_4_INCOMPLETE_TELEMETRY.traces
  });

  assert.ok(results.length > 0, 'Should still produce diagnostic hypothesis despite incomplete telemetry');
  const topCandidate = results[0];
  assert.equal(topCandidate.candidateServiceId, 'inventory-mesh');
  assert.equal(topCandidate.breakdown.logErrorEvidenceScore, 0, 'Log score should be 0 due to dropped logs');
  assert.equal(topCandidate.breakdown.deploymentCorrelationScore, 0, 'Deploy score should be 0 due to dropped deploys');
  assert.ok(
    topCandidate.uncertaintyAndMissingEvidence.some(u => u.includes('log') || u.includes('trace')),
    'Must explicitly state uncertainty regarding missing logs or traces'
  );
});

test('Backend RCA Engine: Scenario 5 - No Convincing Candidate (False Alarm)', () => {
  const results = runRcaAnalysis({
    incident: SCENARIO_5_NO_CONVINCING_CANDIDATE.incident,
    services: SCENARIO_5_NO_CONVINCING_CANDIDATE.services,
    alerts: SCENARIO_5_NO_CONVINCING_CANDIDATE.alerts,
    deployments: SCENARIO_5_NO_CONVINCING_CANDIDATE.deployments,
    logs: SCENARIO_5_NO_CONVINCING_CANDIDATE.logs,
    traces: SCENARIO_5_NO_CONVINCING_CANDIDATE.traces,
    minScoreThreshold: 20
  });

  assert.equal(results.length, 0, 'Must produce zero hypotheses when all telemetry is nominal');
});

test('Backend RCA Engine: Determinism & Idempotency', () => {
  const run1 = runRcaAnalysis({
    incident: SCENARIO_1_DEPLOYMENT_REGRESSION.incident,
    services: SCENARIO_1_DEPLOYMENT_REGRESSION.services,
    alerts: SCENARIO_1_DEPLOYMENT_REGRESSION.alerts,
    deployments: SCENARIO_1_DEPLOYMENT_REGRESSION.deployments,
    logs: SCENARIO_1_DEPLOYMENT_REGRESSION.logs,
    traces: SCENARIO_1_DEPLOYMENT_REGRESSION.traces
  });

  const run2 = runRcaAnalysis({
    incident: SCENARIO_1_DEPLOYMENT_REGRESSION.incident,
    services: SCENARIO_1_DEPLOYMENT_REGRESSION.services,
    alerts: SCENARIO_1_DEPLOYMENT_REGRESSION.alerts,
    deployments: SCENARIO_1_DEPLOYMENT_REGRESSION.deployments,
    logs: SCENARIO_1_DEPLOYMENT_REGRESSION.logs,
    traces: SCENARIO_1_DEPLOYMENT_REGRESSION.traces
  });

  assert.deepEqual(run1, run2, 'Consecutive runs with identical inputs must be byte-for-byte identical');
});

test('Backend RCA Engine: Candidate Deduplication', () => {
  const results = runRcaAnalysis({
    incident: SCENARIO_1_DEPLOYMENT_REGRESSION.incident,
    services: SCENARIO_1_DEPLOYMENT_REGRESSION.services,
    alerts: SCENARIO_1_DEPLOYMENT_REGRESSION.alerts,
    deployments: SCENARIO_1_DEPLOYMENT_REGRESSION.deployments,
    logs: SCENARIO_1_DEPLOYMENT_REGRESSION.logs,
    traces: SCENARIO_1_DEPLOYMENT_REGRESSION.traces
  });

  const ids = results.map(r => r.candidateServiceId);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size, 'Candidate services must never be duplicated');
});

test('Backend RCA Engine: Weight Normalization and Bounds', () => {
  const raw = {
    anomalySeverityScore: 80,
    deploymentCorrelationScore: 90,
    dependencyRelevanceScore: 90,
    logErrorEvidenceScore: 70
  };

  const weighted = computeWeightedScore(raw, DEFAULT_SCORING_WEIGHTS);
  assert.equal(weighted.weightedTotalScore, 83.0);
  assert.ok(weighted.weightedTotalScore >= 0 && weighted.weightedTotalScore <= 100);
});

