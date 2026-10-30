/**
 * Enhanced Deterministic Root-Cause Analysis (RCA) Engine
 *
 * Implements:
 * - Independent anomaly detection via statistical baseline deviation
 * - Causal dependency reasoning (callee cause vs caller symptom)
 * - Anti-double-counting signal normalization
 * - Separate evidence-quality confidence assessment
 * - Explainable hypothesis generation with positive, missing, and contradictory evidence
 */

import { analyzeServiceAnomalies } from './anomalyDetector.js';
import { analyzeCausalRelationship } from './causalGraph.js';
import { assessEvidenceQuality } from './evidenceQuality.js';
import { 
  DEFAULT_SCORING_WEIGHTS, 
  calculateDeploymentScore, 
  calculateLogAndTraceScore, 
  computeWeightedScore 
} from './scoring.js';
import { correlateAlerts } from './correlation.js';

export function runRcaAnalysis(input) {
  const { 
    incident, 
    services = [], 
    alerts = [], 
    deployments = [], 
    logs = [], 
    traces = [], 
    weights: customWeights,
    minScoreThreshold = 20
  } = input || {};

  if (!incident || !services || services.length === 0) {
    return [];
  }

  const effectiveWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    ...(customWeights || {})
  };

  const targetId = incident.serviceId || incident.service_id;
  const targetName = (incident.serviceName || incident.service_name || '').toLowerCase();
  const incidentService = services.find(
    s => s.id === targetId || s.name?.toLowerCase() === targetName
  );

  const candidates = [];
  const processedServiceIds = new Set();

  for (const service of services) {
    if (processedServiceIds.has(service.id)) continue;
    processedServiceIds.add(service.id);

    // 1. Correlate alerts
    const serviceAlerts = correlateAlerts(service, alerts);

    // 2. Anomaly evaluation
    const anomalyRes = analyzeServiceAnomalies(service, serviceAlerts);

    // 3. Deployment correlation
    const deployRes = calculateDeploymentScore(service, incident, deployments);

    // 4. Causal topology reasoning
    const causalRes = analyzeCausalRelationship(service, incidentService, services);

    // 5. Correlated logs and traces
    const logRes = calculateLogAndTraceScore(service, logs, traces);

    // Anti-double-counting adjustment:
    // If an alert is already firing for this error, reduce trace score redundancy
    let adjustedLogScore = logRes.score;
    if (anomalyRes.score > 50 && logRes.score > 50) {
      adjustedLogScore = Math.round(logRes.score * 0.85);
    }

    // 6. Weighted heuristic scoring
    const breakdown = computeWeightedScore({
      anomalySeverityScore: anomalyRes.score,
      deploymentCorrelationScore: deployRes.score,
      dependencyRelevanceScore: causalRes.score,
      logErrorEvidenceScore: adjustedLogScore
    }, effectiveWeights);

    // Filter non-contenders: services with zero anomalies, deployments, or log/trace evidence
    if (anomalyRes.score === 0 && deployRes.score === 0 && adjustedLogScore === 0) {
      continue;
    }

    if (breakdown.weightedTotalScore < minScoreThreshold) {
      continue;
    }

    // 7. Evidence Quality Assessment
    const qualityRes = assessEvidenceQuality({
      incident,
      candidate: service,
      anomalyResult: anomalyRes,
      deploymentResult: deployRes,
      causalResult: causalRes,
      logTraceResult: logRes,
      totalServices: services.length,
      totalAlerts: alerts.length,
      totalLogs: logs.length,
      totalTraces: traces.length
    });

    // Supporting evidence consolidation
    const supportingEvidence = [
      ...anomalyRes.anomalies.map(a => ({
        id: a.id,
        type: 'anomaly',
        severity: a.severity,
        title: a.title,
        description: a.description,
        metricValue: a.currentValue
      })),
      ...deployRes.evidence,
      ...causalRes.evidence,
      ...logRes.evidence
    ];

    const uncertaintyAndMissingEvidence = [
      ...qualityRes.missingSignals,
      ...deployRes.uncertainty,
      ...causalRes.uncertainty,
      ...logRes.uncertainty
    ];

    const summary = generateHumanExplanation(service, breakdown, deployRes.relevantDeployments, anomalyRes, causalRes);
    const suggestedNextAction = generateSuggestedNextAction(service, breakdown, deployRes.relevantDeployments, anomalyRes);

    candidates.push({
      candidateServiceId: service.id,
      candidateServiceName: service.name,
      rank: 0,
      score: breakdown.weightedTotalScore,
      breakdown,
      causalRole: causalRes.relationship,
      causalDirection: causalRes.direction,
      evidenceQuality: qualityRes.evidenceQuality,
      evidenceQualityPoints: qualityRes.qualityPoints,
      sufficientEvidence: qualityRes.sufficientEvidence,
      summary,
      suggestedNextAction,
      supportingEvidence,
      uncertaintyAndMissingEvidence,
      contradictoryEvidence: qualityRes.contradictorySignals,
      relevantDeployments: deployRes.relevantDeployments,
      correlatedAlerts: serviceAlerts,
      observedAnomalies: serviceAlerts // Backwards compatibility for intelligentAlerting test
    });
  }

  // Deterministic sorting:
  // 1. Score descending
  // 2. Anomaly severity descending
  // 3. Service ID alphabetical (tie-breaker)
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.breakdown.anomalySeverityScore !== a.breakdown.anomalySeverityScore) {
      return b.breakdown.anomalySeverityScore - a.breakdown.anomalySeverityScore;
    }
    return a.candidateServiceId.localeCompare(b.candidateServiceId);
  });

  return candidates.map((cand, idx) => ({
    ...cand,
    rank: idx + 1
  }));
}

function generateHumanExplanation(service, breakdown, deployments, anomalyRes, causalRes) {
  const parts = [];

  if (deployments && deployments.length > 0 && breakdown.deploymentCorrelationScore >= 50) {
    const d = deployments[0];
    parts.push(`Recent deployment ${d.version} (${d.timestamp}) exhibits strong temporal correlation.`);
  }

  if (anomalyRes.latencyRatio && anomalyRes.latencyRatio >= 4.0) {
    parts.push(`Severe P99 latency surge (${anomalyRes.latencyRatio.toFixed(1)}x baseline) detected.`);
  }

  if (causalRes.direction === 'upstream_cause_to_downstream_caller') {
    parts.push(`Positioned directly upstream in critical path of impacted callers.`);
  } else if (causalRes.direction === 'downstream_symptom') {
    parts.push(`Downstream caller suffering cascading timeout symptoms.`);
  }

  if (breakdown.logErrorEvidenceScore >= 40) {
    parts.push(`Correlated error logs confirm cascading failures.`);
  }

  if (parts.length === 0) {
    return `Service "${service.name}" exhibits moderate anomaly indicators (diagnostic score: ${breakdown.weightedTotalScore}/100).`;
  }

  return parts.join(' ');
}

function generateSuggestedNextAction(service, breakdown, deployments, anomalyRes) {
  if (deployments && deployments.length > 0 && breakdown.deploymentCorrelationScore >= 60) {
    return `Inspect deployment diff for ${deployments[0].version} and evaluate instant canary rollback via Deployments console.`;
  }

  if (anomalyRes.anomalies.some(a => a.title.toLowerCase().includes('pool') || a.description.toLowerCase().includes('connection'))) {
    return `Execute connection pool expansion runbook (RB-402) and inspect active database locks.`;
  }

  if (anomalyRes.latencyRatio && anomalyRes.latencyRatio >= 5.0) {
    return `Inspect garbage collection pauses, thread dumps, and database query wait events on ${service.name}.`;
  }

  return `Review live pod container logs and CPU/Memory saturation charts for ${service.name}.`;
}
