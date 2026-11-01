// ==============================================================================
// InfraPulse - Remediation Risk Assessment Engine
// Phase 23J: Deterministic & Explainable Risk Categorization & Blast Radius
// ==============================================================================

import { dependencyCheckService } from '../cloud-lifecycle/services/dependency-check.service.js';

export const riskAssessmentService = {
  /**
   * Evaluates deterministic operational risk for a proposed remediation action.
   *
   * @param {Object} params
   * @param {Object} params.resource - cloud_resources record
   * @param {string} params.action - e.g. 'DOCKER_CONTAINER_RESTART'
   * @param {Object} [params.incident] - incident record
   * @param {string} [params.rcaConfidenceLevel] - 'CONFIRMED_FACT' | 'STRONG_HYPOTHESIS' | 'WEAK_HYPOTHESIS'
   * @returns {Promise<{ riskLevel: string, riskScore: number, riskRationale: string, blastRadius: Object, requiredApprovals: string[] }>}
   */
  async assessRisk({
    resource,
    action,
    incident = null,
    rcaConfidenceLevel = 'STRONG_HYPOTHESIS'
  }) {
    let riskScore = 15; // Baseline minimum risk for any infrastructure change
    const contributingFactors = [];

    const env = (resource.environment || 'staging').toLowerCase();
    const isProd = ['production', 'prod', 'live', 'prd'].includes(env);

    // 1. Environment Risk (Major factor)
    if (isProd) {
      riskScore += 45;
      contributingFactors.push(`Production Environment: Resource '${resource.name}' is hosted in '${env}' (+45 risk).`);
    } else {
      contributingFactors.push(`Non-Production Environment: Resource '${resource.name}' is in '${env}' (+0 risk).`);
    }

    // 2. Resource Criticality & Database Proximity
    if (resource.is_critical_dependency) {
      riskScore += 25;
      contributingFactors.push(`Critical Dependency: Resource is flagged as a mission-critical infrastructure dependency (+25 risk).`);
    }

    const type = (resource.resource_type || '').toLowerCase();
    const name = (resource.name || '').toLowerCase();
    const isDb = type.includes('rds') || type.includes('database') || name.includes('postgres') || name.includes('mysql') || name.includes('mongo') || name.includes('redis');
    if (isDb) {
      riskScore += 30;
      contributingFactors.push(`Database / Persistent Store Proximity: Workload is or manages persistent database storage (+30 risk).`);
    }

    // 3. Persistent Volume and Storage Protection
    const hasPvc = Boolean(resource.persistence_requirements?.has_pvc || resource.persistence_requirements?.claim_name);
    const hasVolume = Boolean(resource.persistence_requirements?.has_volume || resource.persistence_requirements?.volume_name);
    if (hasPvc || hasVolume) {
      riskScore += 10;
      contributingFactors.push(`Persistent State: Workload is bound to persistent storage (${hasPvc ? 'PVC' : 'Volume'}) (+10 risk).`);
    }

    // 4. Downstream Callers & Blast Radius Analysis
    let downstreamCallers = [];
    try {
      const safety = await dependencyCheckService.evaluateSafetyChecks(resource, 'stop');
      downstreamCallers = safety.downstreamRunningCallers || [];
    } catch {
      downstreamCallers = [];
    }

    if (downstreamCallers.length > 3) {
      riskScore += 25;
      contributingFactors.push(`Wide Blast Radius: Action affects ${downstreamCallers.length} active downstream running callers (${downstreamCallers.slice(0, 3).join(', ')}...) (+25 risk).`);
    } else if (downstreamCallers.length > 0) {
      riskScore += 15;
      contributingFactors.push(`Moderate Blast Radius: Action affects ${downstreamCallers.length} downstream caller(s) (${downstreamCallers.join(', ')}) (+15 risk).`);
    } else {
      contributingFactors.push(`Contained Blast Radius: Zero active downstream caller dependencies detected (+0 risk).`);
    }

    // 5. Incident Severity & RCA Confidence
    const sev = (incident?.severity || '').toUpperCase();
    if (sev === 'SEV-1' || sev === 'CRITICAL') {
      riskScore += 10;
      contributingFactors.push(`High Incident Severity: Linked incident is '${sev}' (+10 risk).`);
    }

    if (rcaConfidenceLevel === 'WEAK_HYPOTHESIS') {
      riskScore += 20;
      contributingFactors.push(`Weak RCA Evidence: Root cause is an unconfirmed hypothesis (+20 risk).`);
    } else if (rcaConfidenceLevel === 'CONFIRMED_FACT') {
      riskScore -= 10;
      contributingFactors.push(`Confirmed RCA Fact: Underlying infrastructure failure is empirically verified (-10 risk).`);
    }

    // 6. Action-Specific Interruption Assessment
    const normalizedAction = String(action || '').toUpperCase();
    if (normalizedAction.includes('RESTART')) {
      riskScore += 10;
      contributingFactors.push(`Transient Interruption: Workload restart causes temporary connection renegotiation (+10 risk).`);
    } else if (normalizedAction.includes('STOP')) {
      riskScore += 20;
      contributingFactors.push(`Workload Interruption: Stopping workload terminates running processes (+20 risk).`);
    } else if (normalizedAction.includes('START') || normalizedAction.includes('RESTORE')) {
      riskScore += 5;
      contributingFactors.push(`Capacity Restoration: Starting or restoring workload expands available compute (+5 risk).`);
    }

    // Bound risk score between 0 and 100
    riskScore = Math.max(5, Math.min(100, riskScore));

    // Determine Risk Category
    let riskLevel = 'LOW';
    let requiredApprovals = ['responder'];

    if (isProd && riskScore >= 75) {
      riskLevel = 'CRITICAL';
      requiredApprovals = ['admin', 'executive_override'];
    } else if (riskScore >= 65) {
      riskLevel = 'HIGH';
      requiredApprovals = ['admin', 'designated_reviewer'];
    } else if (riskScore >= 35) {
      riskLevel = 'MEDIUM';
      requiredApprovals = ['responder', 'peer_reviewer'];
    } else {
      riskLevel = 'LOW';
      requiredApprovals = ['responder'];
    }

    const blastRadius = {
      targetResourceId: resource.id,
      targetResourceName: resource.name,
      provider: resource.provider,
      environment: resource.environment,
      downstreamCallersCount: downstreamCallers.length,
      downstreamCallers,
      persistentStorageProtected: hasPvc || hasVolume,
      estimatedDowntimeSeconds: normalizedAction.includes('RESTART') ? 15 : (normalizedAction.includes('STOP') ? 60 : 0)
    };

    return {
      riskLevel,
      riskScore,
      riskRationale: contributingFactors.join(' '),
      blastRadius,
      requiredApprovals,
      contributingFactors
    };
  }
};

