import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FAULT_SCENARIOS, FAULT_TYPES, SEVERITY_LEVELS } from '../faultScenarios.js';
import { simulateFault } from '../faultSimulator.js';
import { runRcaAnalysis } from '../rcaEngine.js';
import { 
  createSimulation, 
  getSimulation, 
  investigateSimulation, 
  resetSimulation 
} from '../../services/faultLab.service.js';
import { getServices } from '../../data/services.js';
import { getAlerts } from '../../data/alerts.js';
import { getDeployments } from '../../data/deployments.js';
import { getLogs, getTraces } from '../../data/telemetry.js';

test('Fault Lab: Baseline telemetry remains completely unchanged after simulation', () => {
  const initialServices = getServices();
  const paymentInitial = initialServices.find(s => s.id === 'payment-service');
  const baselineLatency = paymentInitial.latencyP99;
  const baselineError = paymentInitial.errorRate;

  // Run a heavy critical simulation on payment-service
  const sim = simulateFault({
    scenarioId: 'test-scenario',
    targetServiceId: 'payment-service',
    faultType: FAULT_TYPES.LATENCY_SPIKE,
    severity: SEVERITY_LEVELS.CRITICAL
  }, {
    baselineServices: getServices(),
    baselineAlerts: getAlerts(),
    baselineDeployments: getDeployments(),
    baselineLogs: getLogs(),
    baselineTraces: getTraces()
  });

  // Verify simulated telemetry changed
  const mutatedTarget = sim.telemetry.services.find(s => s.id === 'payment-service');
  assert.ok(mutatedTarget.latencyP99 > baselineLatency, 'Simulated latency must increase');

  // Verify the baseline in getServices() was NOT mutated
  const untouchedServices = getServices();
  const untouchedPayment = untouchedServices.find(s => s.id === 'payment-service');
  assert.equal(untouchedPayment.latencyP99, baselineLatency, 'Baseline service latency must be pristine');
  assert.equal(untouchedPayment.errorRate, baselineError, 'Baseline service error rate must be pristine');
});

test('Fault Lab: Dependency propagation affects downstream callers appropriately', () => {
  // fraud-evaluator is called by payment-service; checkout-api calls payment-service
  const sim = simulateFault({
    scenarioId: 'scenario-service-unavailable',
    targetServiceId: 'fraud-evaluator',
    faultType: FAULT_TYPES.SERVICE_UNAVAILABLE,
    severity: SEVERITY_LEVELS.CRITICAL
  }, {
    baselineServices: getServices(),
    baselineAlerts: getAlerts(),
    baselineDeployments: getDeployments(),
    baselineLogs: getLogs(),
    baselineTraces: getTraces()
  });

  assert.ok(sim.expectedDownstreamAffected.includes('payment-service'), 'payment-service is a direct caller of fraud-evaluator');
  assert.ok(sim.expectedDownstreamAffected.includes('checkout-api'), 'checkout-api transitively depends on fraud-evaluator');

  // Check that propagated services had their latency/error bumped
  const propagatedPayment = sim.telemetry.services.find(s => s.id === 'payment-service');
  assert.ok(propagatedPayment.errorRate > 0, 'Propagated downstream caller must experience error surge');
});

test('Fault Lab: Rejects invalid service IDs and unsupported fault types', () => {
  assert.throws(() => {
    simulateFault({
      targetServiceId: 'non-existent-service-999',
      faultType: FAULT_TYPES.LATENCY_SPIKE
    }, {
      baselineServices: getServices()
    });
  }, /not present in the registered services catalog/);

  assert.throws(() => {
    simulateFault({
      targetServiceId: 'payment-service',
      faultType: 'cosmic_ray_flip'
    }, {
      baselineServices: getServices()
    });
  }, /Unsupported fault type/);
});

test('Fault Lab: Resetting a simulation cleans up state cleanly', () => {
  const sim = createSimulation({
    scenarioId: 'scenario-latency-spike'
  });

  assert.ok(sim.simulationId, 'Simulation ID should be returned');
  const fetched = getSimulation(sim.simulationId);
  assert.equal(fetched.simulationId, sim.simulationId);

  // Reset
  const resetRes = resetSimulation(sim.simulationId);
  assert.ok(resetRes.message.includes('successfully'));

  // Attempting to fetch again should throw 404
  assert.throws(() => {
    getSimulation(sim.simulationId);
  }, /was not found or has been reset/);
});

test('Fault Lab: RCA Engine evaluates simulated fault and achieves Top-1 accuracy for all 5 standard scenarios', () => {
  for (const scenario of FAULT_SCENARIOS) {
    const sim = createSimulation({
      scenarioId: scenario.id
    });

    const result = investigateSimulation(sim.simulationId);
    assert.ok(result.hypotheses.length > 0, `Hypotheses must be generated for ${scenario.id}`);

    // Evaluation verification
    const evalData = result.evaluation;
    assert.equal(evalData.expectedRootCauseServiceId, scenario.targetServiceId);
    assert.equal(evalData.topRankedCandidateId, scenario.targetServiceId, `Scenario ${scenario.id} should rank ${scenario.targetServiceId} as Top-1`);
    assert.equal(evalData.top1Accuracy, true, `Top-1 accuracy should be true for ${scenario.id}`);
    assert.equal(evalData.top3Accuracy, true, `Top-3 accuracy should be true for ${scenario.id}`);
    assert.equal(evalData.status, 'PASSED');

    // Clean up
    resetSimulation(sim.simulationId);
  }
});

test('Fault Lab: Determinism - Repeated simulation runs yield identical evaluation scores', () => {
  const sim1 = createSimulation({ scenarioId: 'scenario-database-slowdown' });
  const res1 = investigateSimulation(sim1.simulationId);

  const sim2 = createSimulation({ scenarioId: 'scenario-database-slowdown' });
  const res2 = investigateSimulation(sim2.simulationId);

  assert.equal(res1.hypotheses[0].candidateServiceId, res2.hypotheses[0].candidateServiceId);
  assert.equal(res1.hypotheses[0].score, res2.hypotheses[0].score);

  resetSimulation(sim1.simulationId);
  resetSimulation(sim2.simulationId);
});

