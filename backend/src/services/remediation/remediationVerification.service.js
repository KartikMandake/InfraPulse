// ==============================================================================
// InfraPulse - Remediation Observability & Verification Engine
// Phase 23J: Multi-Signal Post-Action Health Verification & Outcome Classification
// ==============================================================================

export const remediationVerificationService = {
  /**
   * Evaluates empirical post-remediation health across workload state, telemetry, and alerts.
   * Rule: Never classify remediation as SUCCESSFUL merely because provider returned HTTP 200.
   */
  async verifyRemediation({
    resource,
    action,
    providerResponse = {},
    postExecutionState = {},
    relatedAlerts = [],
    telemetryStats = null,
    providerAdapter = null
  }) {
    const checks = [];
    let outcome = 'INCONCLUSIVE';
    let passedChecks = 0;
    let totalChecks = 0;

    // 1. Workload Current State Check
    totalChecks++;
    const currentState = (postExecutionState.currentState || resource.current_state || '').toLowerCase();
    const isRunning = currentState === 'running' || currentState === 'available';
    if (isRunning) {
      passedChecks++;
      checks.push({
        dimension: 'workload_state',
        status: 'PASSED',
        message: `Workload state confirmed '${currentState}' matching desired running state.`
      });
    } else {
      checks.push({
        dimension: 'workload_state',
        status: 'FAILED',
        message: `Workload state '${currentState}' does not match expected state 'running'.`
      });
    }

    // 2. Pod / Container Health Inspection
    totalChecks++;
    const containerStatus = providerResponse.containerStatus || providerResponse.status || currentState;
    const isDegraded = ['crashed', 'crashloopbackoff', 'error', 'failed'].includes(String(containerStatus).toLowerCase());
    if (!isDegraded) {
      passedChecks++;
      checks.push({
        dimension: 'container_readiness',
        status: 'PASSED',
        message: `Container readiness check verified: no CrashLoopBackOff or fatal exit code.`
      });
    } else {
      checks.push({
        dimension: 'container_readiness',
        status: 'FAILED',
        message: `Workload exhibited crash loop or failure immediately following mutation.`
      });
    }

    // 3. Related Firing Alerts Inspection
    totalChecks++;
    const activeCriticalAlerts = (relatedAlerts || []).filter(
      a => a.severity === 'critical' && (a.status === 'active' || a.state === 'firing')
    );
    if (activeCriticalAlerts.length === 0) {
      passedChecks++;
      checks.push({
        dimension: 'alert_resolution',
        status: 'PASSED',
        message: 'No active critical alerts firing on the target workload.'
      });
    } else {
      checks.push({
        dimension: 'alert_resolution',
        status: 'WARNING',
        message: `${activeCriticalAlerts.length} critical alert(s) remain active on service.`
      });
    }

    // 4. Telemetry Freshness Inspection
    if (telemetryStats) {
      totalChecks++;
      const secondsAgo = telemetryStats.lastSuccessfulAt
        ? Math.round((Date.now() - new Date(telemetryStats.lastSuccessfulAt).getTime()) / 1000)
        : 999;
      if (secondsAgo < 120) {
        passedChecks++;
        checks.push({
          dimension: 'telemetry_freshness',
          status: 'PASSED',
          message: `Fresh telemetry received ${secondsAgo}s ago.`
        });
      } else {
        checks.push({
          dimension: 'telemetry_freshness',
          status: 'WARNING',
          message: `Telemetry stream is aging (${secondsAgo}s since last ingest).`
        });
      }
    }

    // Outcome Classification
    if (isDegraded) {
      outcome = 'RECOVERY_REQUIRED';
    } else if (passedChecks === totalChecks) {
      outcome = 'SUCCESSFUL';
    } else if (isRunning && passedChecks >= totalChecks - 1) {
      outcome = 'PARTIALLY_SUCCESSFUL';
    } else if (!isRunning) {
      outcome = 'FAILED';
    } else {
      outcome = 'INCONCLUSIVE';
    }

    return {
      outcome, // 'SUCCESSFUL' | 'PARTIALLY_SUCCESSFUL' | 'FAILED' | 'RECOVERY_REQUIRED' | 'INCONCLUSIVE'
      passedChecks,
      totalChecks,
      confidenceScore: passedChecks / Math.max(1, totalChecks),
      checks,
      verifiedAt: new Date().toISOString()
    };
  }
};

