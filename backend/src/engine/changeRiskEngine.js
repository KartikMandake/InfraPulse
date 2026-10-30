/**
 * Deployment Risk Scoring Engine
 *
 * Deterministic, explainable 0–100 scoring engine that assesses the risk of deploying
 * or modifying a service before and after execution.
 *
 * Scoring Formula & Weights (Max 100 points clamped):
 * 1. Change Scope & Complexity (Max 15 pts): Semver diff, strategy, schema/db migrations
 * 2. Service Criticality (Max 15 pts): Tier 0 (15 pts), Tier 1 (8 pts), Tier 2+ (3 pts)
 * 3. Dependency Blast Radius (Max 20 pts): Direct/transitive callers, critical tier in path
 * 4. Historical Deployment Failure Rate (Max 15 pts): Requires >= 3 deployments; never fabricated
 * 5. Recent Incident History (Max 10 pts): Active incidents on target or downstream callers
 * 6. Pre-Deployment SLO Health (Max 10 pts): Breached (10), at_risk (6), compliant (0)
 * 7. Error Budget Remaining (Max 10 pts): Exhausted (10), low (7), moderate (4), healthy (0)
 * 8. Existing Alert Activity (Max 10 pts): Firing critical/warning alerts on service or callers
 * 9. Telemetry Completeness & Confidence (Max 10 pts): Penalty for missing or stale signals
 *
 * This score estimates empirical risk factors. It is NOT a probabilistic prediction of failure.
 */

import { calculateBlastRadius } from './blastRadiusEngine.js';

export function calculateDeploymentRisk(changeProposal, context = {}) {
  const {
    targetService,
    allServices = [],
    slos = [],
    sloEvaluations = [],
    activeIncidents = [],
    activeAlerts = [],
    deploymentHistory = [],
    telemetryStatus = { isAvailable: true, quality: 'good', isSimulated: true }
  } = context;

  const supportingEvidence = [];
  const missingEvidence = [];
  const recommendedVerifications = [];

  const {
    serviceId,
    previousVersion,
    newVersion,
    deploymentStrategy = 'rolling',
    changedComponents = [],
    changeType = 'code_deployment',
    environment = 'production'
  } = changeProposal;

  // 1. Change Scope and Complexity (Max 15 pts)
  let scopeScore = 0;
  const versionDiff = analyzeSemverDiff(previousVersion, newVersion);
  if (versionDiff === 'major') {
    scopeScore += 10;
    supportingEvidence.push({
      factor: 'change_scope',
      points: 10,
      description: `Major semver version upgrade (${previousVersion || 'unknown'} -> ${newVersion}) involves breaking API contracts or major architectural revisions.`
    });
  } else if (versionDiff === 'minor') {
    scopeScore += 5;
    supportingEvidence.push({
      factor: 'change_scope',
      points: 5,
      description: `Minor semver version upgrade (${previousVersion || 'unknown'} -> ${newVersion}) introduces new features or protocol modifications.`
    });
  } else {
    scopeScore += 2;
    supportingEvidence.push({
      factor: 'change_scope',
      points: 2,
      description: `Patch or maintenance version change (${previousVersion || 'unknown'} -> ${newVersion}).`
    });
  }

  // Strategy risk
  if (deploymentStrategy === 'recreate') {
    scopeScore += 5;
    supportingEvidence.push({
      factor: 'deployment_strategy',
      points: 5,
      description: 'Recreate strategy causes temporary service outage during pod replacement.'
    });
  } else if (deploymentStrategy === 'rolling') {
    scopeScore += 3;
  } else if (deploymentStrategy === 'blue-green') {
    scopeScore += 2;
  } else if (deploymentStrategy === 'canary') {
    scopeScore += 1;
    supportingEvidence.push({
      factor: 'deployment_strategy',
      points: 1,
      description: 'Canary deployment provides progressive traffic ramp and early fault isolation.'
    });
  }

  // Schema / Database migration flag
  const hasMigration = changeType === 'schema_migration' ||
    (Array.isArray(changedComponents) && changedComponents.some(c => /migration|schema|sql|db/i.test(c)));
  if (hasMigration) {
    scopeScore += 3;
    supportingEvidence.push({
      factor: 'schema_migration',
      points: 3,
      description: 'Change includes database schema migrations or stateful storage modifications.'
    });
    recommendedVerifications.push('Verify backward-compatible schema migration before running pod rollout.');
  }
  const scopeFinal = Math.min(15, scopeScore);

  // 2. Service Criticality (Max 15 pts)
  let criticalityScore = 3;
  const tier = targetService?.tier ?? 1;
  if (tier === 0) {
    criticalityScore = 15;
    supportingEvidence.push({
      factor: 'service_criticality',
      points: 15,
      description: `Target service "${targetService?.name || serviceId}" is designated Tier-0 (Mission-Critical). Unplanned degradation directly impairs revenue transactions.`
    });
  } else if (tier === 1) {
    criticalityScore = 8;
    supportingEvidence.push({
      factor: 'service_criticality',
      points: 8,
      description: `Target service "${targetService?.name || serviceId}" is Tier-1 (High Business Priority).`
    });
  } else {
    criticalityScore = 3;
    supportingEvidence.push({
      factor: 'service_criticality',
      points: 3,
      description: `Target service "${targetService?.name || serviceId}" is Tier-2 or standard auxiliary service.`
    });
  }

  // 3. Dependency Blast Radius (Max 20 pts)
  const blastRadius = calculateBlastRadius(serviceId, allServices, { slos, activeIncidents, activeAlerts });
  let blastScore = 0;
  const directCount = blastRadius.directDownstream.length;
  if (directCount === 0) {
    blastScore += 0;
  } else if (directCount === 1) {
    blastScore += 5;
  } else if (directCount <= 3) {
    blastScore += 10;
  } else {
    blastScore += 14;
  }

  if (blastRadius.criticalServices.length > 0) {
    blastScore += 4;
    supportingEvidence.push({
      factor: 'blast_radius_critical',
      points: 4,
      description: `${blastRadius.criticalServices.length} critical Tier-0/1 downstream callers are in the direct blast path: ${blastRadius.criticalServices.map(s => s.serviceName).join(', ')}.`
    });
  }

  if (blastRadius.sharedDependencies.length > 0) {
    blastScore += 2;
    supportingEvidence.push({
      factor: 'shared_dependencies',
      points: 2,
      description: `Identified ${blastRadius.sharedDependencies.length} shared upstream dependencies with downstream callers (${blastRadius.sharedDependencies.map(s => s.serviceName).join(', ')}).`
    });
  }
  const blastFinal = Math.min(20, blastScore);

  // 4. Historical Deployment Failure Rate (Max 15 pts)
  let historyScore = 0;
  let historyDetails = {};
  const relevantHistory = deploymentHistory.filter(d => {
    if (!d.serviceId && !d.service_id && !d.serviceName) return true;
    return (d.serviceId === serviceId || d.service_id === serviceId || d.serviceName === serviceId);
  });
  if (relevantHistory.length < 3) {
    // Insufficient historical data: neutral uncertainty baseline, do NOT fabricate failure rate
    historyScore = 4;
    historyDetails = {
      sampleSize: relevantHistory.length,
      sampleThreshold: 3,
      status: 'insufficient_data',
      failureRatePercent: null,
      message: `Insufficient historical deployment samples (observed: ${relevantHistory.length}, minimum required: 3). Historical failure rate was not fabricated.`
    };
    missingEvidence.push(historyDetails.message);
  } else {
    const failedCount = relevantHistory.filter(d => d.status === 'unhealthy' || d.status === 'failed' || d.status === 'rolled_back').length;
    const failureRate = (failedCount / relevantHistory.length) * 100;
    if (failureRate > 30) {
      historyScore = 15;
    } else if (failureRate >= 15) {
      historyScore = 10;
    } else if (failureRate >= 5) {
      historyScore = 5;
    } else {
      historyScore = 1;
    }
    historyDetails = {
      sampleSize: relevantHistory.length,
      sampleThreshold: 3,
      status: 'sufficient_data',
      failureRatePercent: Number(failureRate.toFixed(1)),
      failedCount,
      totalCount: relevantHistory.length
    };
    supportingEvidence.push({
      factor: 'deployment_history',
      points: historyScore,
      description: `Historical deployment failure rate is ${failureRate.toFixed(1)}% (${failedCount}/${relevantHistory.length} deployments in sample).`
    });
  }

  // 5. Recent Incident History (Max 10 pts)
  let incidentScore = 0;
  const targetIncidents = activeIncidents.filter(inc =>
    (inc.serviceId === serviceId || inc.service_id === serviceId || inc.serviceName === serviceId) &&
    inc.status !== 'resolved'
  );
  const downstreamIds = blastRadius.directDownstream.map(d => d.serviceId);
  const downstreamIncidents = activeIncidents.filter(inc =>
    downstreamIds.includes(inc.serviceId || inc.service_id) && inc.status !== 'resolved'
  );

  if (targetIncidents.length > 0) {
    incidentScore = 10;
    supportingEvidence.push({
      factor: 'active_incident_target',
      points: 10,
      description: `Target service has ${targetIncidents.length} active unresolved incident(s) (${targetIncidents.map(i => i.id).join(', ')}).`
    });
    recommendedVerifications.push('Resolve or stabilize active incident before deploying new revisions.');
  } else if (downstreamIncidents.length > 0) {
    incidentScore = 6;
    supportingEvidence.push({
      factor: 'active_incident_downstream',
      points: 6,
      description: `${downstreamIncidents.length} active incident(s) currently ongoing on downstream callers (${downstreamIncidents.map(i => i.id).join(', ')}).`
    });
  }

  // 6. Pre-Deployment SLO Health (Max 10 pts)
  let sloScore = 0;
  const targetSlos = slos.filter(slo => (slo.serviceId === serviceId || slo.service_id === serviceId) && slo.enabled !== false);
  if (targetSlos.length === 0) {
    sloScore = 2; // Observability gap penalty
    missingEvidence.push(`No active Service Level Objective (SLO) defined for target service "${serviceId}".`);
  } else {
    // Check recent evaluation for target service SLOs
    const targetEvals = sloEvaluations.filter(e => targetSlos.some(s => s.id === (e.sloId || e.slo_id)));
    const hasBreach = targetEvals.some(e => e.status === 'breached');
    const hasWarning = targetEvals.some(e => e.status === 'burn_warning');

    if (hasBreach) {
      sloScore = 10;
      supportingEvidence.push({
        factor: 'slo_status_breached',
        points: 10,
        description: 'Service SLO is currently in BREACHED status. Deploying into an active breach carries high reliability risk.'
      });
      recommendedVerifications.push('Error budget freeze protocol: SRE approval required to deploy into an active SLO breach.');
    } else if (hasWarning) {
      sloScore = 6;
      supportingEvidence.push({
        factor: 'slo_status_warning',
        points: 6,
        description: 'Service SLO is experiencing accelerated burn rate (burn_warning).'
      });
    } else {
      sloScore = 0;
      supportingEvidence.push({
        factor: 'slo_status_nominal',
        points: 0,
        description: 'Target service SLO is currently nominal and compliant with target.'
      });
    }
  }

  // 7. Error Budget Remaining (Max 10 pts)
  let budgetScore = 0;
  const targetEvals = sloEvaluations.filter(e => targetSlos.some(s => s.id === (e.sloId || e.slo_id)));
  if (targetEvals.length > 0) {
    const minRemainingBudget = Math.min(...targetEvals.map(e => Number(e.remainingBudgetPercent || e.remaining_budget_percent || 0)));
    if (minRemainingBudget <= 0) {
      budgetScore = 10;
      supportingEvidence.push({
        factor: 'error_budget_exhausted',
        points: 10,
        description: `Error budget is completely exhausted (${minRemainingBudget.toFixed(1)}% remaining). Any further bad events will violate SLA commitments.`
      });
    } else if (minRemainingBudget <= 20) {
      budgetScore = 7;
      supportingEvidence.push({
        factor: 'error_budget_low',
        points: 7,
        description: `Error budget is low (${minRemainingBudget.toFixed(1)}% remaining).`
      });
      recommendedVerifications.push('Run canary with minimum 30-minute observation window due to low error budget.');
    } else if (minRemainingBudget <= 50) {
      budgetScore = 4;
      supportingEvidence.push({
        factor: 'error_budget_moderate',
        points: 4,
        description: `Error budget is moderate (${minRemainingBudget.toFixed(1)}% remaining).`
      });
    } else {
      budgetScore = 0;
      supportingEvidence.push({
        factor: 'error_budget_healthy',
        points: 0,
        description: `Error budget is healthy (${minRemainingBudget.toFixed(1)}% remaining).`
      });
    }
  } else {
    budgetScore = 2; // Observability gap
  }

  // 8. Existing Alert Activity (Max 10 pts)
  let alertScore = 0;
  const targetAlerts = activeAlerts.filter(a =>
    (a.serviceId === serviceId || a.service_id === serviceId) && a.status === 'active'
  );
  const downstreamAlerts = activeAlerts.filter(a =>
    downstreamIds.includes(a.serviceId || a.service_id) && a.status === 'active'
  );

  const hasCrit = targetAlerts.some(a => a.severity === 'critical' || a.severity === 'error');
  if (hasCrit) {
    alertScore = 10;
    supportingEvidence.push({
      factor: 'alert_critical_target',
      points: 10,
      description: `Target service has ${targetAlerts.length} active critical alert(s) firing.`
    });
    recommendedVerifications.push('Acknowledge and inspect firing critical alerts before executing rollout.');
  } else if (targetAlerts.length > 0) {
    alertScore = 5;
    supportingEvidence.push({
      factor: 'alert_warning_target',
      points: 5,
      description: `Target service has ${targetAlerts.length} warning alert(s) firing.`
    });
  } else if (downstreamAlerts.length > 0) {
    alertScore = 3;
    supportingEvidence.push({
      factor: 'alert_downstream',
      points: 3,
      description: `Downstream callers have ${downstreamAlerts.length} active firing alert(s).`
    });
  } else {
    alertScore = 0;
  }

  // 9. Telemetry Completeness & Confidence (Max 10 pts penalty)
  let telemetryScore = 0;
  if (!telemetryStatus.isAvailable || telemetryStatus.quality === 'missing_telemetry') {
    telemetryScore = 8;
    missingEvidence.push('Live telemetry stream is missing or disconnected. Risk assessment confidence degraded.');
  } else if (telemetryStatus.quality === 'incomplete' || telemetryStatus.quality === 'stale') {
    telemetryScore = 5;
    missingEvidence.push('Telemetry signals are partial or stale.');
  } else {
    telemetryScore = 0;
  }

  if (telemetryStatus.isSimulated) {
    supportingEvidence.push({
      factor: 'telemetry_source',
      points: 0,
      description: 'Telemetry baselines are derived from the simulated demo telemetry adapter.'
    });
  }

  // Sum raw points
  const rawScore = scopeFinal + criticalityScore + blastFinal + historyScore +
    incidentScore + sloScore + budgetScore + alertScore + telemetryScore;

  const riskScore = Math.min(100, Math.max(0, Math.round(rawScore)));

  // Risk Category
  let riskCategory = 'low';
  if (riskScore >= 80) riskCategory = 'critical';
  else if (riskScore >= 60) riskCategory = 'high';
  else if (riskScore >= 30) riskCategory = 'moderate';
  else riskCategory = 'low';

  // Overall Recommendation
  let recommendation = 'LOW_RISK';
  if (!telemetryStatus.isAvailable || telemetryStatus.quality === 'missing_telemetry') {
    recommendation = 'INSUFFICIENT_EVIDENCE';
  } else if (riskScore >= 60) {
    recommendation = 'HIGH_RISK';
  } else if (riskScore >= 30) {
    recommendation = 'REVIEW_RECOMMENDED';
  } else {
    recommendation = 'LOW_RISK';
  }

  // Confidence
  let confidence = 'high';
  if (telemetryStatus.quality === 'missing_telemetry' || relevantHistory.length === 0) {
    confidence = 'low';
  } else if (missingEvidence.length > 0 || relevantHistory.length < 3) {
    confidence = 'medium';
  }

  // Add default verification checks if empty
  if (recommendedVerifications.length === 0) {
    recommendedVerifications.push('Standard deployment check: Monitor latency and error-rate for 10 minutes post-rollout.');
  }

  return {
    serviceId,
    targetService: {
      name: targetService?.name || serviceId,
      tier
    },
    version: {
      previous: previousVersion,
      new: newVersion,
      diffType: versionDiff
    },
    environment,
    deploymentStrategy,
    riskScore,
    riskCategory,
    recommendation,
    confidence,
    factorBreakdowns: {
      changeScope: { points: scopeFinal, max: 15, weight: '13.0%' },
      serviceCriticality: { points: criticalityScore, max: 15, weight: '13.0%' },
      blastRadius: { points: blastFinal, max: 20, weight: '17.4%' },
      historicalFailureRate: { points: historyScore, max: 15, weight: '13.0%', details: historyDetails },
      recentIncidents: { points: incidentScore, max: 10, weight: '8.7%' },
      preDeploymentSlo: { points: sloScore, max: 10, weight: '8.7%' },
      errorBudget: { points: budgetScore, max: 10, weight: '8.7%' },
      existingAlerts: { points: alertScore, max: 10, weight: '8.7%' },
      telemetryCompleteness: { points: telemetryScore, max: 10, weight: '8.7%' }
    },
    blastRadiusSummary: {
      totalImpactedCount: blastRadius.totalImpactedCount,
      directCount: blastRadius.directDownstream.length,
      transitiveCount: blastRadius.transitiveDownstream.length,
      criticalDownstreamCount: blastRadius.criticalServices.length,
      criticalServices: blastRadius.criticalServices.map(s => s.serviceName),
      sharedDependenciesCount: blastRadius.sharedDependencies.length
    },
    supportingEvidence,
    missingEvidence,
    recommendedVerifications,
    evaluatedAt: new Date().toISOString()
  };
}

function analyzeSemverDiff(prev, next) {
  if (!prev || !next) return 'unknown';
  const cleanPrev = String(prev).replace(/^v/, '');
  const cleanNext = String(next).replace(/^v/, '');

  const prevParts = cleanPrev.split('.').map(p => parseInt(p, 10));
  const nextParts = cleanNext.split('.').map(p => parseInt(p, 10));

  if (isNaN(prevParts[0]) || isNaN(nextParts[0])) return 'unknown';

  if (nextParts[0] > prevParts[0]) return 'major';
  if (nextParts[0] === prevParts[0] && nextParts[1] > prevParts[1]) return 'minor';
  return 'patch';
}
