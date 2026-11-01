import {tenantContext} from '../security/tenantContext.js';
import { FAULT_SCENARIOS } from '../engine/faultScenarios.js';
import { simulateFault } from '../engine/faultSimulator.js';
import { runRcaAnalysis } from '../engine/rcaEngine.js';
import { getServices } from '../data/services.js';
import { getAlerts } from '../data/alerts.js';
import { getDeployments } from '../data/deployments.js';
import { getLogs, getTraces } from '../data/telemetry.js';
import * as simulationsRepo from '../repositories/simulations.repository.js';
import { ApiError } from '../utils/ApiError.js';

// In-memory active simulations storage for fast benchmark execution
const activeSimulations = new Map();

/**
 * Returns all predefined fault scenarios.
 */
export function listScenarios() {
  return FAULT_SCENARIOS;
}

/**
 * Initiates a new fault simulation.
 */
export function createSimulation(payload) {
  const { scenarioId, targetServiceId, faultType, severity, customParams } = payload;

  let selectedScenario = null;
  if (scenarioId) {
    selectedScenario = FAULT_SCENARIOS.find(s => s.id === scenarioId);
    if (!selectedScenario && !faultType && !targetServiceId) {
      throw ApiError.badRequest(`Scenario with id "${scenarioId}" was not found.`);
    }
  }

  const effectiveTarget = targetServiceId || selectedScenario?.targetServiceId;
  const effectiveFaultType = faultType || selectedScenario?.faultType;
  const effectiveSeverity = severity || selectedScenario?.defaultSeverity || 'high';

  if (!effectiveTarget) {
    throw ApiError.badRequest('A valid targetServiceId must be provided or derived from a scenario.');
  }

  if (!effectiveFaultType) {
    throw ApiError.badRequest('A valid faultType must be provided or derived from a scenario.');
  }

  try {
    const simulationResult = simulateFault(
      {
        scenarioId: selectedScenario?.id || scenarioId,
        targetServiceId: effectiveTarget,
        faultType: effectiveFaultType,
        severity: effectiveSeverity,
        customParams: customParams || selectedScenario?.parameters
      },
      {
        baselineServices: getServices(),
        baselineAlerts: getAlerts(),
        baselineDeployments: getDeployments(),
        baselineLogs: getLogs(),
        baselineTraces: getTraces()
      }
    );

    activeSimulations.set(scopeKey(simulationResult.simulationId), simulationResult);

    // Persist to PostgreSQL asynchronously
    simulationsRepo.saveSimulationRecord(simulationResult).catch(err => {
      console.warn('[FaultLab] Simulation DB save warning:', err.message);
    });

    return simulationResult;
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
}

/**
 * Retrieves a simulation by ID from memory or PostgreSQL.
 */
export async function getSimulationAsync(simulationId) {
  const simMem = activeSimulations.get(scopeKey(simulationId));
  if (simMem) return simMem;

  try {
    const simDb = await simulationsRepo.findSimulationById(simulationId);
    if (simDb) {
      activeSimulations.set(scopeKey(simulationId), simDb);
      return simDb;
    }
  } catch (err) {
    console.warn('[FaultLab] DB read fallback:', err.message);
  }

  throw ApiError.notFound(`Simulation with ID "${simulationId}" was not found or has been reset.`);
}

export function getSimulation(simulationId) {
  const sim = activeSimulations.get(scopeKey(simulationId));
  if (!sim) {
    throw ApiError.notFound(`Simulation with ID "${simulationId}" was not found or has been reset.`);
  }
  return sim;
}

/**
 * Runs the existing RCA engine against the isolated simulated data and calculates Top-1 / Top-3 benchmark metrics.
 */
export function investigateSimulation(simulationId, weights = null) {
  const sim = getSimulation(simulationId);

  const startTime = Date.now();

  // IMPORTANT: Notice that expectedRootCauseServiceId is NOT passed to runRcaAnalysis.
  // The engine only receives the simulated incident, mutated telemetry, and topology.
  const hypotheses = runRcaAnalysis({
    incident: sim.simulatedIncident,
    services: sim.telemetry?.services || getServices(),
    alerts: sim.telemetry?.alerts || getAlerts(),
    deployments: sim.telemetry?.deployments || getDeployments(),
    logs: sim.telemetry?.logs || getLogs(),
    traces: sim.telemetry?.traces || getTraces(),
    weights
  });

  const durationMs = Date.now() - startTime;

  // Evaluation Metrics
  const top1Candidate = hypotheses[0] || null;
  const top3Candidates = hypotheses.slice(0, 3);

  const top1Match = top1Candidate?.candidateServiceId === sim.expectedRootCauseServiceId;
  const top3Match = top3Candidates.some(c => c.candidateServiceId === sim.expectedRootCauseServiceId);

  const falsePositives = hypotheses.filter(h => {
    const isExpected = h.candidateServiceId === sim.expectedRootCauseServiceId;
    const isDownstream = (sim.expectedDownstreamAffected || []).includes(h.candidateServiceId);
    return !isExpected && !isDownstream && h.score >= 60;
  });

  const evaluation = {
    simulationId: sim.simulationId,
    scenarioId: sim.scenarioId,
    faultType: sim.faultType,
    severity: sim.severity,
    expectedRootCauseServiceId: sim.expectedRootCauseServiceId,
    topRankedCandidateId: top1Candidate?.candidateServiceId || null,
    topRankedCandidateScore: top1Candidate?.score || 0,
    top1Accuracy: top1Match,
    top3Accuracy: top3Match,
    investigationDurationMs: durationMs,
    affectedServicesCount: (sim.expectedDownstreamAffected?.length || 0) + 1,
    falsePositiveCount: falsePositives.length,
    status: top1Match ? 'PASSED' : top3Match ? 'PARTIAL' : 'FAILED',
    disclaimer: 'Deterministic evaluation performed against an isolated synthetic fault model.'
  };

  sim.evaluation = evaluation;

  // Persist evaluation asynchronously to PostgreSQL
  simulationsRepo.saveSimulationRecord(sim).catch(err => {
    console.warn('[FaultLab] Evaluation DB save warning:', err.message);
  });

  return {
    simulation: sim,
    hypotheses,
    evaluation
  };
}

/**
 * Resets/deletes a simulation from memory and PostgreSQL.
 */
export function resetSimulation(simulationId) {
  if (!activeSimulations.has(scopeKey(simulationId))) {
    throw ApiError.notFound(`Simulation with ID "${simulationId}" does not exist.`);
  }
  activeSimulations.delete(scopeKey(simulationId));

  simulationsRepo.deleteSimulationRecord(simulationId).catch(err => {
    console.warn('[FaultLab] Simulation DB delete warning:', err.message);
  });

  return { message: `Simulation "${simulationId}" was reset successfully.` };
}

function scopeKey(id){return (tenantContext()?.tenantId||"internal")+":"+id;}
