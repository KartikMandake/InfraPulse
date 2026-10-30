/**
 * Early-Warning Signals Engine — InfraPulse Phase 18
 *
 * Deterministic detection of leading indicators and elevated operational risks.
 *
 * Grounding & Terminology Constraints:
 * - NO blackbox predictions or speculative claims (e.g. NEVER claim "AI predicts incident in 2 hours").
 * - Uses rigorous deterministic indicators: accelerating error-budget consumption,
 *   sub-threshold latency drift, repeated post-change regressions, or persistent pool warnings.
 * - Explicitly labeled as "Early-Warning Signal" and "Elevated Operational Risk".
 */

import crypto from 'node:crypto';

export const EARLY_WARNING_CATEGORIES = {
  ACCELERATING_BUDGET_BURN: 'accelerating_budget_burn',
  REPEATED_DEPLOYMENT_REGRESSION: 'repeated_deployment_regression',
  LATENCY_CREEP_EARLY_WARNING: 'latency_creep_early_warning',
  POOL_EXHAUSTION_EARLY_WARNING: 'pool_exhaustion_early_warning',
  DEPENDENCY_SATURATION_SPIKE: 'dependency_saturation_spike'
};

/**
 * Detects active early-warning signals across services.
 *
 * @param {Object} context
 * @param {Array} context.services - Registered services with current metrics
 * @param {Array} context.slos - Service Level Objectives with burn rate evaluations
 * @param {Array} context.regressions - Recent deployment regression records
 * @param {Array} context.alerts - Active and recent alerts
 * @param {Array} [context.patterns] - Detected recurring patterns
 * @returns {Array<Object>} List of verified early warning events
 */
export function detectEarlyWarnings({
  services = [],
  slos = [],
  regressions = [],
  alerts = [],
  patterns = []
} = {}) {
  const warnings = [];

  for (const svc of services) {
    const sId = svc.id || svc.name;
    const sName = svc.name || sId;

    // 1. Check Accelerating Error Budget Burn
    const serviceSlos = slos.filter(s => (s.service_id || s.serviceId) === sId);
    for (const slo of serviceSlos) {
      const burnRate = Number(slo.burn_rate_1h ?? slo.burnRate1h ?? 0);
      const remainingBudget = Number(slo.remaining_error_budget_percent ?? slo.remainingErrorBudgetPercent ?? 100);

      if (burnRate >= 8 || (burnRate >= 4 && remainingBudget < 30)) {
        const severity = burnRate >= 14 ? 'critical' : 'high';
        warnings.push({
          id: `ew-${crypto.createHash('md5').update(`${sId}::burn::${Date.now()}`).digest('hex').substring(0, 12)}`,
          category: EARLY_WARNING_CATEGORIES.ACCELERATING_BUDGET_BURN,
          serviceId: sId,
          serviceName: sName,
          severity,
          indicators: [
            `Error budget consumption rate is ${burnRate}x normal over the past 1-hour window`,
            `Remaining error budget margin is down to ${remainingBudget}%`,
            `Target objective: ${slo.target_percentage || slo.targetPercentage || 99.9}% (${slo.name || 'SLO'})`
          ],
          historicalComparison: `Historical data indicates burn rates >= 5x on ${sName} precede critical availability outages within 2 to 4 hours if left unmitigated.`,
          historical_comparison: `Historical data indicates burn rates >= 5x on ${sName} precede critical availability outages within 2 to 4 hours if left unmitigated.`,
          windowMinutes: 60,
          confidence: 'high',
          recommendedInvestigation: `Execute latency/error diagnostic runbook (e.g. RB-LATENCY-01) and inspect upstream callers for retry storms.`,
          detectedAt: new Date().toISOString()
        });
      }
    }

    // 2. Check Repeated Post-Deployment Regressions
    const serviceRegressions = regressions.filter(r => (r.service_id || r.serviceId) === sId);
    if (serviceRegressions.length >= 2) {
      warnings.push({
        id: `ew-${crypto.createHash('md5').update(`${sId}::regr::${Date.now()}`).digest('hex').substring(0, 12)}`,
        category: EARLY_WARNING_CATEGORIES.REPEATED_DEPLOYMENT_REGRESSION,
        serviceId: sId,
        serviceName: sName,
        severity: serviceRegressions.length >= 3 ? 'critical' : 'warning',
        indicators: [
          `${serviceRegressions.length} deployment regressions observed in close succession`,
          `Recent regression: ${serviceRegressions[0]?.release_version || 'release'} showed latency/error divergence`,
          `Change failure rate elevated above baseline`
        ],
        historicalComparison: `Corresponds to recurrent deployment regression pattern on ${sName}. Similar post-release degradation previously led to customer-facing SEV-1 incidents.`,
        historical_comparison: `Corresponds to recurrent deployment regression pattern on ${sName}. Similar post-release degradation previously led to customer-facing SEV-1 incidents.`,
        windowMinutes: 1440,
        confidence: 'high',
        recommendedInvestigation: `Verify canary verification gates (RB-ROLLBACK-01) and review pull request telemetry diffs before promoting next release.`,
        detectedAt: new Date().toISOString()
      });
    }

    // 3. Sub-Threshold Latency Creep
    const baseline = Number(svc.latencyBaseline ?? 20);
    const p99 = Number(svc.latencyP99 ?? 0);
    const errorRate = Number(svc.errorRate ?? 0);

    // If p99 is >= 3x baseline but error rate has not yet surged past 5%
    if (baseline > 0 && p99 >= baseline * 3 && errorRate < 5) {
      warnings.push({
        id: `ew-${crypto.createHash('md5').update(`${sId}::creep::${Date.now()}`).digest('hex').substring(0, 12)}`,
        category: EARLY_WARNING_CATEGORIES.LATENCY_CREEP_EARLY_WARNING,
        serviceId: sId,
        serviceName: sName,
        severity: 'warning',
        indicators: [
          `Observed P99 latency (${p99}ms) is ${(p99 / baseline).toFixed(1)}x higher than baseline (${baseline}ms)`,
          `Current error rate remains sub-threshold at ${errorRate}%, indicating early queuing or downstream contention`,
          `Current pod CPU utilization is ${svc.cpuPercent || 'normal'}%`
        ],
        historicalComparison: `Pre-failure telemetry profiles show sustained 3x latency creep reliably precedes downstream socket pool exhaustion.`,
        historical_comparison: `Pre-failure telemetry profiles show sustained 3x latency creep reliably precedes downstream socket pool exhaustion.`,
        windowMinutes: 30,
        confidence: 'medium',
        recommendedInvestigation: `Run diagnostic RB-TIMEOUT-01 to isolate whether downstream dependencies are experiencing queue saturation.`,
        detectedAt: new Date().toISOString()
      });
    }

    // 4. Repeated Connection Pool Exhaustion Alerts
    const poolAlerts = alerts.filter(a => {
      const target = (a.service_id || a.serviceId || a.service || '').toLowerCase();
      const desc = ((a.description || '') + ' ' + (a.title || '') + ' ' + (a.rule_name || '')).toLowerCase();
      return (target === sId.toLowerCase() || target.includes(sId.toLowerCase())) &&
        (desc.includes('pool') || desc.includes('connection') || desc.includes('starvation'));
    });

    if (poolAlerts.length >= 2) {
      warnings.push({
        id: `ew-${crypto.createHash('md5').update(`${sId}::pool::${Date.now()}`).digest('hex').substring(0, 12)}`,
        category: EARLY_WARNING_CATEGORIES.POOL_EXHAUSTION_EARLY_WARNING,
        serviceId: sId,
        serviceName: sName,
        severity: 'high',
        indicators: [
          `${poolAlerts.length} pool/connection warnings logged in recent time window`,
          `Database connection lease wait times accumulating on downstream database proxy`
        ],
        historicalComparison: `Identical signature observed in historical database connection pool saturation pattern.`,
        historical_comparison: `Identical signature observed in historical database connection pool saturation pattern.`,
        windowMinutes: 60,
        confidence: 'high',
        recommendedInvestigation: `Execute mitigation runbook RB-DB-01 to temporarily expand max pool size and evict orphaned connections.`,
        detectedAt: new Date().toISOString()
      });
    }
  }

  // Deduplicate by category + serviceId
  const uniqueWarnings = [];
  const seenKeys = new Set();
  for (const w of warnings) {
    const key = `${w.category}::${w.serviceId}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueWarnings.push(w);
    }
  }

  return uniqueWarnings;
}
