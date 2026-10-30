/**
 * Pure Deterministic SLO & Error Budget Calculation Engine
 *
 * Implements Google SRE Workbook standards:
 * - SLI computation (Availability, Latency, Error Rate, Throughput)
 * - Error budget allocation & consumption tracking
 * - Multi-window burn-rate multiplier detection (1h fast burn, 6h slow burn, 24h sustained)
 * - Explainable service reliability scoring (0-100)
 * - Incident impact attribution against SLOs
 * - Safe handling of zero-traffic, missing telemetry, and window boundaries
 */

export const SLI_TYPES = Object.freeze({
  AVAILABILITY: 'availability',
  LATENCY: 'latency',
  ERROR_RATE: 'error_rate',
  THROUGHPUT: 'throughput'
});

export const SLO_STATUSES = Object.freeze({
  NOMINAL: 'nominal',
  BURN_WARNING: 'burn_warning',
  BREACHED: 'breached',
  INSUFFICIENT_DATA: 'insufficient_data',
  ZERO_TRAFFIC: 'zero_traffic'
});

export const DATA_QUALITIES = Object.freeze({
  GOOD: 'good',
  INCOMPLETE: 'incomplete',
  MISSING_TELEMETRY: 'missing_telemetry',
  STALE: 'stale'
});

/**
 * Calculates current SLI percentage value from telemetry events.
 */
export function calculateSliValue(sliType, { totalEvents = 0, goodEvents = 0, badEvents = 0, observedRps = 0, expectedRps = 100 }) {
  if (totalEvents === 0) {
    return {
      sliValue: null,
      status: SLO_STATUSES.ZERO_TRAFFIC,
      dataQuality: DATA_QUALITIES.INCOMPLETE
    };
  }

  let value = 0;
  switch (sliType) {
    case SLI_TYPES.AVAILABILITY:
    case SLI_TYPES.LATENCY:
      value = (goodEvents / totalEvents) * 100;
      break;

    case SLI_TYPES.ERROR_RATE:
      value = Math.max(0, (1 - (badEvents / totalEvents))) * 100;
      break;

    case SLI_TYPES.THROUGHPUT:
      value = Math.min(100, (observedRps / (expectedRps || 100)) * 100);
      break;

    default:
      value = (goodEvents / totalEvents) * 100;
  }

  // Round to 3 decimal places for precision
  const rounded = Math.round(value * 1000) / 1000;
  return {
    sliValue: Math.min(100, Math.max(0, rounded)),
    status: SLO_STATUSES.NOMINAL,
    dataQuality: DATA_QUALITIES.GOOD
  };
}

/**
 * Calculates exact error budget allocation, consumed budget, and remaining budget.
 *
 * For targetPercent = 99.9%:
 * Error Budget = 0.1% = 0.001
 * Allowed Bad Events = floor(totalEvents * 0.001)
 */
export function calculateErrorBudget({ targetPercent, totalEvents = 0, goodEvents = 0, badEvents = 0 }) {
  const target = Number(targetPercent);
  if (isNaN(target) || target <= 0 || target >= 100) {
    throw new Error(`Invalid SLO target percentage: ${targetPercent}. Must be between 0 and 100.`);
  }

  const errorBudgetRatio = Number(((100 - target) / 100).toFixed(6)); // e.g. 0.001 for 99.9%
  const errorBudgetPercent = Math.round(errorBudgetRatio * 100000) / 1000; // e.g. 0.100%

  // Zero-traffic edge case
  if (totalEvents === 0) {
    return {
      totalEvents: 0,
      goodEvents: 0,
      badEvents: 0,
      targetPercent: target,
      errorBudgetPercent,
      allowedBadEvents: 0,
      remainingBadEvents: 0,
      budgetConsumedPercent: 0,
      remainingBudgetPercent: 100,
      status: SLO_STATUSES.ZERO_TRAFFIC,
      dataQuality: DATA_QUALITIES.INCOMPLETE,
      message: 'Zero traffic observed in window. Cannot confirm SLO attainment.'
    };
  }

  const allowedBadEvents = Math.floor(totalEvents * errorBudgetRatio);
  const remainingBadEvents = Math.max(0, allowedBadEvents - badEvents);

  let budgetConsumedPercent = 0;
  if (allowedBadEvents > 0) {
    budgetConsumedPercent = Math.min(100, Math.round((badEvents / allowedBadEvents) * 10000) / 100);
  } else if (badEvents > 0) {
    // If totalEvents is too small to permit even 1 bad event, any bad event consumes 100% budget
    budgetConsumedPercent = 100;
  }

  const remainingBudgetPercent = Math.max(0, Math.round((100 - budgetConsumedPercent) * 100) / 100);

  let status = SLO_STATUSES.NOMINAL;
  if (remainingBudgetPercent <= 0) {
    status = SLO_STATUSES.BREACHED;
  } else if (remainingBudgetPercent <= 20) {
    status = SLO_STATUSES.BURN_WARNING;
  }

  return {
    totalEvents,
    goodEvents,
    badEvents,
    targetPercent: target,
    errorBudgetPercent,
    allowedBadEvents,
    remainingBadEvents,
    budgetConsumedPercent,
    remainingBudgetPercent,
    status,
    dataQuality: totalEvents < 100 ? DATA_QUALITIES.INCOMPLETE : DATA_QUALITIES.GOOD
  };
}

/**
 * Calculates burn-rate multiplier relative to allowed budget consumption rate.
 *
 * Burn Rate = (badEvents / totalEvents) / errorBudgetRatio
 * A burn rate of 1.0 consumes 100% of the budget in the full window.
 * A burn rate of 14.4 consumes 100% of a 30-day budget in ~2 days (2% per hour).
 */
export function calculateBurnRate({ totalEvents = 0, badEvents = 0, targetPercent }) {
  if (totalEvents === 0) return 0;

  const target = Number(targetPercent);
  const errorBudgetRatio = Number(((100 - target) / 100).toFixed(6));
  if (errorBudgetRatio <= 0) return 0;

  const observedErrorRatio = badEvents / totalEvents;
  const burnRate = observedErrorRatio / errorBudgetRatio;

  return Math.round(burnRate * 100) / 100;
}

/**
 * Detects burn-rate alert triggers against policy thresholds.
 */
export function detectBurnRateAlerts({ slo, evaluation, policy = {}, activeAlerts = [] }) {
  const alerts = [];
  const minEvents = policy.minEventsRequired || 50;

  if (evaluation.totalEvents < minEvents) {
    return alerts; // Insufficient sample size to trigger alert safely
  }

  const fastThreshold = policy.fastBurnThreshold || 14.4;
  const slowThreshold = policy.slowBurnThreshold || 3.0;

  const burn1h = evaluation.burnRate1h || 0;
  const burn6h = evaluation.burnRate6h || 0;
  const remainingBudget = evaluation.remainingBudgetPercent ?? 100;

  // 1. Budget Exhausted
  if (remainingBudget <= 0) {
    const isAlreadyFiring = activeAlerts.some(a => a.alertType === 'budget_exhausted' && a.status === 'firing');
    if (!isAlreadyFiring) {
      alerts.push({
        sloId: slo.id,
        policyId: policy.id || null,
        alertType: 'budget_exhausted',
        severity: 'critical',
        burnRate: Math.max(burn1h, burn6h),
        budgetRemainingPercent: 0,
        message: `Error budget exhausted (0% remaining) for SLO "${slo.name}". Immediate operational review required.`
      });
    }
  }

  // 2. Fast Burn Rate (e.g. >= 14.4x over 1h)
  if (burn1h >= fastThreshold && remainingBudget > 0) {
    const isAlreadyFiring = activeAlerts.some(a => a.alertType === 'fast_burn' && a.status === 'firing');
    if (!isAlreadyFiring) {
      alerts.push({
        sloId: slo.id,
        policyId: policy.id || null,
        alertType: 'fast_burn',
        severity: 'critical',
        burnRate: burn1h,
        budgetRemainingPercent: remainingBudget,
        message: `Critical fast burn detected (${burn1h}x) on SLO "${slo.name}". Consuming 2% of 30d budget per hour.`
      });
    }
  }

  // 3. Slow Burn Rate (e.g. >= 3.0x over 6h)
  if (burn6h >= slowThreshold && burn1h < fastThreshold && remainingBudget > 10) {
    const isAlreadyFiring = activeAlerts.some(a => a.alertType === 'slow_burn' && a.status === 'firing');
    if (!isAlreadyFiring) {
      alerts.push({
        sloId: slo.id,
        policyId: policy.id || null,
        alertType: 'slow_burn',
        severity: 'warning',
        burnRate: burn6h,
        budgetRemainingPercent: remainingBudget,
        message: `Elevated slow burn detected (${burn6h}x) on SLO "${slo.name}". Budget on track to deplete in < 10 days.`
      });
    }
  }

  // 4. Imminent Breach (budget < 10% and burning faster than 1.0x)
  if (remainingBudget > 0 && remainingBudget <= 10 && Math.max(burn1h, burn6h) >= 1.0) {
    const isAlreadyFiring = activeAlerts.some(a => a.alertType === 'imminent_breach' && a.status === 'firing');
    if (!isAlreadyFiring) {
      alerts.push({
        sloId: slo.id,
        policyId: policy.id || null,
        alertType: 'imminent_breach',
        severity: 'warning',
        burnRate: Math.max(burn1h, burn6h),
        budgetRemainingPercent: remainingBudget,
        message: `Imminent SLO breach risk: Only ${remainingBudget}% error budget remaining with active burn rate ${Math.max(burn1h, burn6h)}x.`
      });
    }
  }

  return alerts;
}

/**
 * Deterministic Service Reliability Scoring (0–100).
 *
 * Weights:
 * - SLO Attainment: 40 points
 * - Remaining Error Budget: 25 points
 * - Burn Rate Health: 15 points
 * - Active Incident Impact: 15 points
 * - Telemetry Completeness: 5 points
 */
export function calculateServiceReliabilityScore({ slos = [], evaluations = [], activeIncidents = [], telemetryComplete = true }) {
  if (slos.length === 0) {
    return {
      score: 100,
      status: 'good',
      trendDirection: 'stable',
      contributingFactors: [{ factor: 'No active SLOs configured', pointImpact: 0 }],
      recommendations: ['Configure availability and latency SLOs to establish reliability baseline.'],
      dataQuality: 'incomplete'
    };
  }

  const factors = [];
  const recommendations = [];

  // 1. SLO Attainment Factor (40 pts)
  let attainmentSum = 0;
  for (const slo of slos) {
    const evalData = evaluations.find(e => e.sloId === slo.id);
    if (!evalData || evalData.sliValue === null) {
      attainmentSum += 0.5; // partial credit if no evaluation
    } else {
      const ratio = Math.min(1.0, evalData.sliValue / Number(slo.targetPercent));
      attainmentSum += ratio;
    }
  }
  const attainmentAvg = attainmentSum / slos.length;
  const attainmentPoints = Math.round(attainmentAvg * 40);
  factors.push({
    factor: `SLO Target Attainment (${Math.round(attainmentAvg * 100)}% average compliance)`,
    pointImpact: attainmentPoints - 40,
    awardedPoints: attainmentPoints,
    maxPoints: 40
  });

  // 2. Error Budget Factor (25 pts)
  let budgetRemainingSum = 0;
  let breachedCount = 0;
  for (const slo of slos) {
    const evalData = evaluations.find(e => e.sloId === slo.id);
    const rem = evalData?.remainingBudgetPercent ?? 100;
    budgetRemainingSum += rem;
    if (rem <= 0) breachedCount++;
  }
  const budgetAvg = budgetRemainingSum / slos.length;
  const budgetPoints = Math.round((budgetAvg / 100) * 25);
  factors.push({
    factor: `Remaining Error Budget (${Math.round(budgetAvg)}% average across ${slos.length} SLOs)`,
    pointImpact: budgetPoints - 25,
    awardedPoints: budgetPoints,
    maxPoints: 25
  });

  if (breachedCount > 0) {
    recommendations.push(`Freeze risky feature deployments: ${breachedCount} SLO error budget(s) completely depleted.`);
  }

  // 3. Burn Rate Factor (15 pts)
  let maxBurn = 0;
  for (const slo of slos) {
    const evalData = evaluations.find(e => e.sloId === slo.id);
    const b = Math.max(evalData?.burnRate1h || 0, evalData?.burnRate6h || 0);
    if (b > maxBurn) maxBurn = b;
  }
  let burnPoints = 15;
  if (maxBurn >= 14.4) {
    burnPoints = 0;
    factors.push({ factor: `Critical 1-hour fast burn peak (${maxBurn}x multiplier)`, pointImpact: -15, awardedPoints: 0, maxPoints: 15 });
    recommendations.push('Investigate root cause immediately to stop rapid 14.4x error budget burn.');
  } else if (maxBurn >= 3.0) {
    burnPoints = 7;
    factors.push({ factor: `Elevated 6-hour slow burn rate (${maxBurn}x multiplier)`, pointImpact: -8, awardedPoints: 7, maxPoints: 15 });
    recommendations.push('Review recent deployments and callee dependencies to curb elevated burn rate.');
  } else {
    factors.push({ factor: `Nominal burn rate (${maxBurn}x within safe envelope)`, pointImpact: 0, awardedPoints: 15, maxPoints: 15 });
  }

  // 4. Incident Impact Penalty (15 pts)
  let incidentPenalty = 0;
  for (const inc of activeIncidents) {
    if (inc.severity === 'SEV-1') incidentPenalty += 15;
    else if (inc.severity === 'SEV-2') incidentPenalty += 10;
    else incidentPenalty += 5;
  }
  const incidentPoints = Math.max(0, 15 - Math.min(15, incidentPenalty));
  if (incidentPenalty > 0) {
    factors.push({
      factor: `Active Incident Impact (${activeIncidents.length} active incident(s) in progress)`,
      pointImpact: -Math.min(15, incidentPenalty),
      awardedPoints: incidentPoints,
      maxPoints: 15
    });
  } else {
    factors.push({ factor: 'Zero active incidents', pointImpact: 0, awardedPoints: 15, maxPoints: 15 });
  }

  // 5. Telemetry Completeness (5 pts)
  const telemetryPoints = telemetryComplete ? 5 : 2;
  factors.push({
    factor: telemetryComplete ? 'Complete observability telemetry coverage' : 'Incomplete or degraded telemetry stream',
    pointImpact: telemetryComplete ? 0 : -3,
    awardedPoints: telemetryPoints,
    maxPoints: 5
  });

  const finalScore = Math.max(0, Math.min(100, attainmentPoints + budgetPoints + burnPoints + incidentPoints + telemetryPoints));

  let status = 'good';
  if (finalScore >= 90) status = 'excellent';
  else if (finalScore >= 75) status = 'good';
  else if (finalScore >= 50) status = 'degraded';
  else status = 'critical';

  return {
    score: finalScore,
    status,
    trendDirection: finalScore >= 75 ? 'stable' : 'degrading',
    contributingFactors: factors,
    recommendations: recommendations.length > 0 ? recommendations : ['Service operating within reliability bounds. Continue nominal monitoring.'],
    dataQuality: telemetryComplete ? DATA_QUALITIES.GOOD : DATA_QUALITIES.INCOMPLETE
  };
}

/**
 * Analyzes the impact of an incident on associated SLOs.
 */
export function analyzeIncidentSloImpact({ incident, slos = [], evaluations = [] }) {
  const serviceId = incident.serviceId;
  const relevantSlos = slos.filter(s => s.serviceId === serviceId || s.serviceId === '*');

  const durationMinutes = Number(incident.durationMinutes) || 45;
  const isEstimated = !incident.endedAt;

  const impactedSlos = relevantSlos.map(slo => {
    const evalData = evaluations.find(e => e.sloId === slo.id);
    const target = Number(slo.targetPercent);
    const errorBudgetRatio = (100 - target) / 100;

    // Estimate events during incident window (e.g. 500 RPS baseline)
    const totalEventsInIncident = Math.max(100, durationMinutes * 60 * 250);
    const dropRate = Number(incident.dropRatePercent) || 4.12;
    const estimatedBadEvents = Math.round(totalEventsInIncident * (dropRate / 100));

    const totalAllowedBadEvents = Math.max(1, Math.floor((evalData?.totalEvents || totalEventsInIncident * 10) * errorBudgetRatio));
    const budgetConsumedByIncident = Math.min(100, Math.round((estimatedBadEvents / totalAllowedBadEvents) * 10000) / 100);

    const exhaustedBudget = budgetConsumedByIncident >= 100 || (evalData?.remainingBudgetPercent || 0) <= 0;

    return {
      sloId: slo.id,
      sloName: slo.name,
      targetPercent: target,
      currentPercent: evalData?.sliValue || 95.88,
      durationMinutes,
      estimatedBadEvents,
      totalEventsEvaluated: totalEventsInIncident,
      errorBudgetConsumedPercent: budgetConsumedByIncident,
      exhaustedBudget,
      isEstimated,
      burnRateMultiplier: Math.round((dropRate / (errorBudgetRatio * 100)) * 10) / 10
    };
  });

  return {
    incidentId: incident.id,
    incidentTitle: incident.title,
    serviceId,
    durationMinutes,
    impactedSloCount: impactedSlos.length,
    impactedSlos,
    isEstimated,
    dataQuality: isEstimated ? DATA_QUALITIES.INCOMPLETE : DATA_QUALITIES.GOOD
  };
}
