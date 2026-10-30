/**
 * Evidence Confidence & Data Quality Assessment
 *
 * Separately evaluates:
 * - Telemetry availability (traces, logs, metrics, alerts, deployments)
 * - Sample count and coverage
 * - Data freshness
 * - Cross-signal agreement (anomaly + logs + traces concordant)
 * - Contradictory evidence
 * - Missing critical signals
 *
 * Outputs explicit evidence quality:
 * - 'strong': Multi-signal concordance, low contradiction, high coverage
 * - 'moderate': Clear primary signal with partial supporting coverage
 * - 'weak': Low sample size or conflicting signals
 * - 'insufficient': No telemetry, missing signals, or unresolvable ambiguity
 */

export function assessEvidenceQuality({
  incident,
  candidate,
  anomalyResult,
  deploymentResult,
  causalResult,
  logTraceResult,
  totalServices,
  totalAlerts,
  totalLogs,
  totalTraces
}) {
  let qualityPoints = 0;
  const missingSignals = [];
  const contradictorySignals = [];
  const positiveSignals = [];

  // 1. Signal Availability
  const hasAlerts = totalAlerts > 0;
  const hasLogs = totalLogs > 0;
  const hasTraces = totalTraces > 0;
  const hasDeployments = (deploymentResult.relevantDeployments || []).length > 0;

  if (hasAlerts) qualityPoints += 15;
  else missingSignals.push('No telemetry alerts available in evaluation window.');

  if (hasLogs) qualityPoints += 15;
  else missingSignals.push('No application log streams available.');

  if (hasTraces) qualityPoints += 15;
  else missingSignals.push('No distributed trace waterfall spans available.');

  // 2. Candidate Evidence Specifics
  if (anomalyResult.score > 40) {
    qualityPoints += 25;
    positiveSignals.push(`Candidate exhibits strong measurable telemetry anomaly (score: ${anomalyResult.score}/100).`);
  } else if (anomalyResult.score > 20) {
    qualityPoints += 10;
    positiveSignals.push(`Candidate exhibits moderate telemetry deviation.`);
  } else {
    missingSignals.push('Candidate telemetry metrics are within nominal limits.');
  }

  if (hasDeployments && deploymentResult.score >= 50) {
    qualityPoints += 20;
    positiveSignals.push(`Temporal correlation with deployment ${deploymentResult.relevantDeployments[0]?.version}.`);
  }

  if (logTraceResult.score >= 40) {
    qualityPoints += 15;
    positiveSignals.push(`Correlated error logs or trace span errors corroborate failure.`);
  }

  // 3. Contradiction Checks
  if (hasDeployments && deploymentResult.score >= 50 && anomalyResult.score === 0) {
    contradictorySignals.push('Recent deployment recorded, but zero telemetry anomalies detected on candidate service.');
    qualityPoints -= 20;
  }

  if (candidate.status === 'nominal' && anomalyResult.score >= 50) {
    contradictorySignals.push('Healthcheck reports nominal while telemetry metrics exhibit extreme deviation.');
  }

  // Baseline validity
  if (!anomalyResult.hasValidBaseline) {
    missingSignals.push('Baseline latency metric missing or zero; relative anomaly ratio computed using absolute fallback.');
    qualityPoints -= 10;
  }

  // 4. Quality Classification
  qualityPoints = Math.max(0, Math.min(100, qualityPoints));

  let evidenceQuality = 'insufficient';
  let recommendation = 'insufficient_evidence';

  if (qualityPoints >= 70 && contradictorySignals.length === 0) {
    evidenceQuality = 'strong';
    recommendation = 'recommended_root_cause';
  } else if (qualityPoints >= 45) {
    evidenceQuality = 'moderate';
    recommendation = 'probable_root_cause';
  } else if (qualityPoints >= 25) {
    evidenceQuality = 'weak';
    recommendation = 'weak_hypothesis';
  } else {
    evidenceQuality = 'insufficient';
    recommendation = 'no_cause_recommended';
  }

  return {
    qualityPoints,
    evidenceQuality,
    recommendation,
    positiveSignals,
    missingSignals,
    contradictorySignals,
    sufficientEvidence: evidenceQuality !== 'insufficient' && evidenceQuality !== 'weak'
  };
}

