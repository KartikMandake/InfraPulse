// ==============================================================================
// InfraPulse - Infrastructure Drift Severity & Risk Classifier
// Phase 23G: Deterministic, Explainable Rule-Based Severity Evaluation
// ==============================================================================

/**
 * Evaluates drift severity based on environment, resource criticality,
 * dependency topology, and configuration sensitivity.
 *
 * @param {Object} params
 * @param {string} params.driftType - 'configuration_drift' | 'unexpected_addition' | 'missing_resource' | 'replica_mismatch' | 'workload_state_drift' | 'unauthorized_modification'
 * @param {Object} params.resource - Resource record or null
 * @param {string} params.environment - 'production' | 'staging' | 'dev'
 * @param {Array} params.changedFields - Field deltas
 * @param {Object} params.dependencyImpact - Impact analysis result
 * @returns {{ severity: 'critical'|'high'|'medium'|'low', reason: string, evidence: Object }}
 */
export function classifyDriftSeverity({
  driftType,
  resource = null,
  resourceId = null,
  resourceName = null,
  resourceType = null,
  environment = 'staging',
  actualState = null,
  expectedState = null,
  changedFields = [],
  dependencyImpact = {}
}) {
  const normType = (driftType || '').toLowerCase();
  const resName = (resource?.name || resource?.resource_name || resourceName || resourceId || '').toLowerCase();
  const resType = (resource?.resource_type || resource?.type || resourceType || '').toLowerCase();

  const isProd = (environment || '').toLowerCase() === 'production' || (resource?.environment || '').toLowerCase() === 'production';
  const isCriticalResource = resource?.is_critical_dependency === true ||
    resName.includes('postgres') ||
    resName.includes('database') ||
    resType === 'database' ||
    resType === 'k8s_statefulset' ||
    resType === 'rds_instance';

  const isControlPlane = resName.includes('backend') ||
    resName.includes('infrapulse');

  const downstreamCallersCount = Array.isArray(dependencyImpact?.downstreamCallers) ? dependencyImpact.downstreamCallers.length : 0;
  const hasDownstreamImpact = downstreamCallersCount > 0;

  const securitySensitiveField = changedFields.some(f => {
    const field = (f.field || '').toLowerCase();
    return field.includes('privileged') ||
      field.includes('securitygroup') ||
      field.includes('publicip') ||
      field.includes('ports');
  });

  const replicaToZero = changedFields.some(f => {
    return (f.field || '').toLowerCase().includes('replicas') && (f.actual === 0 || f.actual === '0');
  });

  const stateStopped = changedFields.some(f => {
    return (f.field || '').toLowerCase().includes('state') && f.actual === 'stopped';
  });

  const evidence = {
    isProduction: isProd,
    isCriticalResource,
    isDatabase: isCriticalResource,
    isControlPlane,
    downstreamCallersCount,
    securitySensitiveField,
    replicaToZero,
    stateStopped: stateStopped || actualState === 'stopped',
    driftType
  };

  // 1. CRITICAL RULES
  if (isCriticalResource && (replicaToZero || stateStopped || normType === 'missing_resource' || normType === 'workload_state_drift' || actualState === 'stopped')) {
    return {
      severity: 'critical',
      reason: `Critical Database or persistent workload '${resName || resource?.name || 'database'}' is offline, stopped, or missing. Severe impact to dependent microservices.`,
      evidence
    };
  }

  if (isControlPlane) {
    return {
      severity: 'critical',
      reason: `InfraPulse Control Plane workload '${resName || resource?.name || 'backend'}' drifted from golden baseline. Risk of monitoring disruption.`,
      evidence
    };
  }

  if (isProd && (replicaToZero || stateStopped || normType === 'missing_resource')) {
    return {
      severity: 'critical',
      reason: `Production service '${resource?.name || resName || 'unknown'}' has dropped offline or scaled to zero in production.`,
      evidence
    };
  }

  if (securitySensitiveField && isProd) {
    return {
      severity: 'critical',
      reason: `Unauthorized security boundary modification in production (privileged access, public IP exposure, or security group change).`,
      evidence
    };
  }

  // 2. HIGH RULES
  if (isProd && hasDownstreamImpact) {
    return {
      severity: 'high',
      reason: `Production environment drift detected on '${resName || resource?.name || 'workload'}' with downstream callers.`,
      evidence
    };
  }

  if (isProd) {
    return {
      severity: 'high',
      reason: `Production environment drift detected on '${resource?.name || resName || 'workload'}' (${driftType}). Requires expedited review.`,
      evidence
    };
  }

  if (hasDownstreamImpact && (stateStopped || replicaToZero || normType === 'missing_resource')) {
    return {
      severity: 'high',
      reason: `Workload '${resource?.name || resName || 'workload'}' has ${downstreamCallersCount} active downstream running callers impacted by this drift.`,
      evidence
    };
  }

  if (securitySensitiveField) {
    return {
      severity: 'high',
      reason: `Security-sensitive configuration drift (ports, privileged mode, or networking).`,
      evidence
    };
  }

  if (isCriticalResource) {
    return {
      severity: 'high',
      reason: `Configuration drift on critical database dependency '${resource?.name || resName}'.`,
      evidence
    };
  }

  // 3. MEDIUM RULES
  if (normType === 'replica_mismatch' || normType === 'workload_state_drift') {
    return {
      severity: 'medium',
      reason: `Operational state or replica discrepancy on staging workload '${resource?.name || resName || 'workload'}'.`,
      evidence
    };
  }

  if (normType === 'unexpected_addition') {
    return {
      severity: 'medium',
      reason: `Unmanaged infrastructure workload '${resource?.name || resName || 'resource'}' observed without desired-state baseline entry.`,
      evidence
    };
  }

  if (normType === 'missing_resource') {
    return {
      severity: 'medium',
      reason: `Resource expected in baseline but not observed in environment.`,
      evidence
    };
  }

  // 4. LOW RULES (Cosmetic or minor config changes in staging/dev)
  return {
    severity: 'low',
    reason: `Non-critical configuration parameter drift in ${environment} environment without downstream availability impact.`,
    evidence
  };
}

export const driftSeverityClassifier = { classifyDriftSeverity };
export default driftSeverityClassifier;
