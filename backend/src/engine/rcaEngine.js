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
import { recordOperation, rankDistribution, evidenceDistribution } from '../observability/metrics.js';
import { performance } from 'node:perf_hooks';

export function runRcaAnalysis(input) {
  const _rcaStart = performance.now();
  let _rcaFailed = false;
  try {
  const records=value=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object'):[];
  input={...(input||{}),services:records(input?.services).filter(s=>typeof s.id==='string'&&s.id).map(s=>({...s,name:typeof s.name==='string'&&s.name?s.name:s.id,dependencies:Array.isArray(s.dependencies)?s.dependencies:[]})),alerts:records(input?.alerts),deployments:records(input?.deployments),logs:records(input?.logs),traces:records(input?.traces),cloudResources:records(input?.cloudResources),driftEvents:records(input?.driftEvents)};
  const { 
    incident, 
    services = [], 
    alerts = [], 
    deployments = [], 
    logs = [], 
    traces = [], 
    cloudResources = [],
    driftEvents = [],
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

    // Infrastructure Resources & Container Failure Correlation
    const serviceResources = (cloudResources || []).filter(res => {
      const matchName = (res.name || '').toLowerCase();
      const sId = (service.id || '').toLowerCase();
      const sName = (service.name || '').toLowerCase();
      const composeSvc = (res.metadata?.compose_service || '').toLowerCase();
      const k8sApp = (res.metadata?.app || res.metadata?.['app.kubernetes.io/name'] || '').toLowerCase();
      return (sId&&(matchName===sId||matchName.includes(sId)||composeSvc===sId||k8sApp===sId))||(sName&&(matchName===sName||composeSvc===sName||k8sApp===sName));
    });

    const crashedResources = serviceResources.filter(r => {
      const st = (r.current_state || r.status || '').toLowerCase();
      return st === 'crashed' || st === 'stopped' || st === 'error' || st === 'failed' || st === 'crashloopbackoff';
    });

    const infraEvidence = [];
    const hasInfraFailure = crashedResources.length > 0;
    if (hasInfraFailure) {
      crashedResources.forEach(res => {
        infraEvidence.push({
          type: 'infrastructure_failure',
          severity: 'critical',
          resourceId: res.id,
          title: `Crashed Infrastructure Workload: ${res.name}`,
          description: `Underlying resource ${res.name} (${res.resource_type || 'workload'}) is in state '${res.current_state || res.status}'.`
        });
      });
    }

    // Active Infrastructure Drift Correlation
    const serviceDrifts = (driftEvents || []).filter(d => {
      const rId = (d.resourceId || d.resource_id || '').toLowerCase();
      const rName = (d.resourceName || d.resource_name || '').toLowerCase();
      const sId = (service.id || '').toLowerCase();
      const sName = (service.name || '').toLowerCase();
      return (sId&&(rId.includes(sId)||rName.includes(sId)))||(sName&&(rId.includes(sName)||rName.includes(sName)));
    });

    const hasDrift = serviceDrifts.length > 0;
    if (hasDrift) {
      serviceDrifts.forEach(drift => {
        infraEvidence.push({
          type: 'infrastructure_drift',
          severity: drift.severity || 'high',
          driftId: drift.id,
          title: `Active Infrastructure Drift: ${drift.driftType}`,
          description: drift.severityReason || `Infrastructure drift detected on ${drift.resourceName || drift.resourceId}`
        });
      });
    }

    // Filter non-contenders: services with zero anomalies, deployments, log/trace evidence, infrastructure failures, drifts, or alerts
    if (anomalyRes.score === 0 && deployRes.score === 0 && adjustedLogScore === 0 && !hasInfraFailure && !hasDrift && serviceAlerts.length === 0) {
      continue;
    }

    let candidateScore = breakdown.weightedTotalScore;
    if (hasInfraFailure) {
      // An observed crash is evidence of state, not proof of causal origin.
      candidateScore = Math.min(100,candidateScore+15);
    } else if (hasDrift) {
      candidateScore = Math.min(100,candidateScore+8);
    } else if (serviceAlerts.length > 0 && candidateScore < minScoreThreshold) {
      candidateScore = 35;
    }

    if (candidateScore < minScoreThreshold && !hasInfraFailure && !hasDrift) {
      continue;
    }
    breakdown.baseWeightedTotalScore=breakdown.weightedTotalScore;
    breakdown.infrastructureAdjustment=candidateScore-breakdown.weightedTotalScore;
    breakdown.weightedTotalScore=candidateScore;

    // 7. Evidence Quality Assessment
    const qualityRes = assessEvidenceQuality({
      incident,
      candidate: service,
      anomalyResult: anomalyRes,
      deploymentResult: deployRes,
      causalResult: causalRes,
      logTraceResult: logRes,
      totalServices: services.length,
      totalAlerts: serviceAlerts.length,
      totalLogs: logRes.evidence.filter(e=>e.type==='log').length,
      totalTraces: logRes.evidence.filter(e=>e.type==='trace').length
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
      ...logRes.evidence,
      ...infraEvidence
    ];

    const uncertaintyAndMissingEvidence = [
      ...qualityRes.missingSignals,
      ...deployRes.uncertainty,
      ...causalRes.uncertainty,
      ...logRes.uncertainty
    ];

    const summary = generateHumanExplanation(service, breakdown, deployRes.relevantDeployments, anomalyRes, causalRes);
    const suggestedNextAction = generateSuggestedNextAction(service, breakdown, deployRes.relevantDeployments, anomalyRes);

    let confidenceLevel = 'WEAK_HYPOTHESIS';
    if (qualityRes.sufficientEvidence && qualityRes.contradictorySignals.length===0 && candidateScore >= 50) {
      confidenceLevel = 'STRONG_HYPOTHESIS';
    }

    candidates.push({
      candidateServiceId: service.id,
      candidateServiceName: service.name,
      rank: 0,
      score: candidateScore,
      confidenceLevel,
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

  const sorted = candidates.map((cand, idx) => ({
    ...cand,
    rank: idx + 1
  }));
  try {
    sorted.forEach((cand, idx) => {
      rankDistribution.observe(idx + 1);
      const quality = cand.evidenceQuality || 'MEDIUM';
      evidenceDistribution.inc({ quality: String(quality).toUpperCase() });
    });
  } catch {}
  return sorted;
  } catch (err) {
    _rcaFailed = true;
    throw err;
  } finally {
    try { recordOperation('rca.investigation', performance.now() - _rcaStart, _rcaFailed); } catch {}
  }
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
    parts.push(`Correlated error logs support a failure hypothesis.`);
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
