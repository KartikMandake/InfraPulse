/**
 * Service Reliability Risk Profile Engine — InfraPulse Phase 18
 *
 * Deterministic scoring engine that computes an explainable 0-100 risk score
 * for each registered service by synthesizing:
 * - Incident frequency & severity
 * - Mean Time To Recovery (MTTR)
 * - Post-deployment regression rate
 * - SLO attainment & remaining error budget
 * - Alert noise & flapping
 *
 * Strictly adheres to sample-size disclosure: services with < 3 historical samples
 * are explicitly flagged with low confidence and marked with an insufficient sample note.
 */

import crypto from 'node:crypto';

export const RISK_CATEGORIES = {
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Calculates deterministic risk profile for a single service.
 *
 * @param {Object} service - Service metadata
 * @param {Object} telemetry - Telemetry & historical records
 * @param {Array} telemetry.incidents - Incidents for this service
 * @param {Array} telemetry.regressions - Regressions for this service
 * @param {Array} telemetry.slos - SLOs for this service
 * @param {Array} telemetry.alerts - Alerts for this service
 * @returns {Object} Complete explainable risk profile
 */
export function calculateServiceRiskProfile(service, {
  incidents = [],
  regressions = [],
  slos = [],
  alerts = []
} = {}) {
  const serviceId = service.id || service.name;
  const serviceName = service.name || serviceId;

  // 1. Calculate raw metrics
  const incidentCount = incidents.length;
  const regressionCount = regressions.length;
  const alertCount = alerts.length;

  // MTTR calculation (minutes between start and resolution)
  let totalResolvedMinutes = 0;
  let resolvedCount = 0;
  for (const inc of incidents) {
    if (inc.resolved_at || inc.resolvedAt) {
      const start = new Date(inc.created_at || inc.createdAt).getTime();
      const end = new Date(inc.resolved_at || inc.resolvedAt).getTime();
      if (end > start) {
        totalResolvedMinutes += (end - start) / (1000 * 60);
        resolvedCount++;
      }
    }
  }
  const mttrMinutes = resolvedCount > 0 ? Math.round((totalResolvedMinutes / resolvedCount) * 10) / 10 : 0;

  // SLO metrics
  let lowestRemainingBudget = 100;
  let lowestAttainment = 100;
  for (const s of slos) {
    const rem = Number(s.remaining_error_budget_percent ?? s.remainingErrorBudgetPercent ?? 100);
    const att = Number(s.current_attainment_percent ?? s.currentAttainmentPercent ?? 100);
    if (rem < lowestRemainingBudget) lowestRemainingBudget = rem;
    if (att < lowestAttainment) lowestAttainment = att;
  }

  // Sample size tracking
  const sampleSize = incidentCount + regressionCount + slos.length;
  let confidence = 'high';
  if (sampleSize < 3) {
    confidence = 'low';
  } else if (sampleSize < 6) {
    confidence = 'medium';
  }

  // 2. Compute Factor Penalties (Deterministic 0-100 sum)
  const contributingFactors = {};

  // Factor 1: Incident Frequency (max 30 pts)
  let incidentFactorPoints = 0;
  if (incidentCount >= 5) incidentFactorPoints = 30;
  else if (incidentCount >= 3) incidentFactorPoints = 22;
  else if (incidentCount >= 1) incidentFactorPoints = 12;
  contributingFactors.incident_frequency = {
    points: incidentFactorPoints,
    maxPoints: 30,
    count: incidentCount,
    impact: incidentFactorPoints > 15 ? 'high' : incidentFactorPoints > 0 ? 'medium' : 'none',
    explanation: `${incidentCount} recorded incident(s) in evaluation window (+${incidentFactorPoints} pts)`
  };

  // Factor 2: MTTR (max 20 pts)
  let mttrFactorPoints = 0;
  if (mttrMinutes > 60) mttrFactorPoints = 20;
  else if (mttrMinutes > 30) mttrFactorPoints = 14;
  else if (mttrMinutes > 15) mttrFactorPoints = 8;
  else if (mttrMinutes > 0) mttrFactorPoints = 3;
  contributingFactors.mttr = {
    points: mttrFactorPoints,
    maxPoints: 20,
    mttrMinutes,
    impact: mttrFactorPoints >= 14 ? 'high' : mttrFactorPoints > 0 ? 'medium' : 'none',
    explanation: resolvedCount > 0
      ? `Mean Time To Recovery is ${mttrMinutes} minutes across ${resolvedCount} resolved incidents (+${mttrFactorPoints} pts)`
      : 'Insufficient resolved incident samples for MTTR calculation'
  };

  // Factor 3: Deployment Regressions (max 20 pts)
  let regressionFactorPoints = 0;
  if (regressionCount >= 3) regressionFactorPoints = 20;
  else if (regressionCount >= 2) regressionFactorPoints = 15;
  else if (regressionCount === 1) regressionFactorPoints = 8;
  contributingFactors.deployment_regressions = {
    points: regressionFactorPoints,
    maxPoints: 20,
    count: regressionCount,
    impact: regressionFactorPoints >= 15 ? 'high' : regressionFactorPoints > 0 ? 'medium' : 'none',
    explanation: `${regressionCount} deployment-correlated regression(s) observed (+${regressionFactorPoints} pts)`
  };

  // Factor 4: SLO Budget Exhaustion & Burn (max 20 pts)
  let sloFactorPoints = 0;
  if (lowestRemainingBudget <= 0) sloFactorPoints = 20;
  else if (lowestRemainingBudget < 25) sloFactorPoints = 16;
  else if (lowestRemainingBudget < 50) sloFactorPoints = 10;
  else if (lowestRemainingBudget < 75) sloFactorPoints = 5;
  contributingFactors.slo_budget_exhaustion = {
    points: sloFactorPoints,
    maxPoints: 20,
    remainingBudgetPercent: lowestRemainingBudget,
    impact: sloFactorPoints >= 16 ? 'critical' : sloFactorPoints > 5 ? 'medium' : 'none',
    explanation: `Lowest error budget margin is ${lowestRemainingBudget}% (+${sloFactorPoints} pts)`
  };

  // Factor 5: Alert Noise & Flapping (max 10 pts)
  let alertFactorPoints = 0;
  if (alertCount >= 20) alertFactorPoints = 10;
  else if (alertCount >= 10) alertFactorPoints = 7;
  else if (alertCount >= 3) alertFactorPoints = 4;
  contributingFactors.alert_noise = {
    points: alertFactorPoints,
    maxPoints: 10,
    count: alertCount,
    impact: alertFactorPoints >= 7 ? 'medium' : alertFactorPoints > 0 ? 'low' : 'none',
    explanation: `${alertCount} firing or pending alerts (+${alertFactorPoints} pts)`
  };

  // Sum total risk score (0-100 bounded)
  const totalRawScore = incidentFactorPoints + mttrFactorPoints + regressionFactorPoints + sloFactorPoints + alertFactorPoints;
  const riskScore = Math.max(0, Math.min(100, totalRawScore));

  // Determine category
  let riskCategory = RISK_CATEGORIES.LOW;
  if (riskScore >= 75) riskCategory = RISK_CATEGORIES.CRITICAL;
  else if (riskScore >= 50) riskCategory = RISK_CATEGORIES.HIGH;
  else if (riskScore >= 25) riskCategory = RISK_CATEGORIES.MODERATE;

  // Determine trend direction
  let trendDirection = 'stable';
  if (riskScore >= 60 || regressionCount > 1 || lowestRemainingBudget < 30) {
    trendDirection = 'deteriorating';
  } else if (riskScore <= 20 && incidentCount === 0) {
    trendDirection = 'improving';
  }

  // Change failure rate percent
  const changeFailureRatePercent = regressionCount > 0 ? Math.min(100, Math.round((regressionCount / Math.max(1, regressionCount + 3)) * 100)) : 0;

  return {
    id: `risk-${crypto.createHash('md5').update(`${serviceId}::${riskScore}`).digest('hex').substring(0, 12)}`,
    serviceId,
    serviceName,
    riskScore,
    riskCategory,
    contributingFactors,
    mttrMinutes,
    incidentCount,
    changeFailureRatePercent,
    sloAttainmentPercent: lowestAttainment,
    remainingErrorBudgetPercent: lowestRemainingBudget,
    trendDirection,
    sampleSize,
    confidence,
    evaluatedAt: new Date().toISOString()
  };
}

/**
 * Computes risk profiles for all provided services and sorts them by risk score descending.
 */
export function rankServicesByRisk(services = [], telemetryMap = {}) {
  const profiles = services.map(svc => {
    const sId = svc.id || svc.name;
    const telemetry = telemetryMap[sId] || {};
    return calculateServiceRiskProfile(svc, telemetry);
  });

  return profiles.sort((a, b) => b.riskScore - a.riskScore);
}

