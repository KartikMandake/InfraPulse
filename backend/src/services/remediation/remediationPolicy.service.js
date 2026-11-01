import {governanceError} from '../../utils/governanceError.js';
// ==============================================================================
// InfraPulse - Remediation Policy Service
// Phase 23J: Governed Infrastructure Remediation Policy Rules & Eligibility
// ==============================================================================

import { config } from '../../config/env.js';
import { remediationRepository } from '../../repositories/remediation.repository.js';

export const ALLOWED_REMEDIATION_ACTIONS = [
  'DOCKER_CONTAINER_START',
  'DOCKER_CONTAINER_RESTART',
  'K8S_DEPLOYMENT_RESTART',
  'K8S_REPLICA_RESTORE',
  'AWS_EC2_START',
  'AWS_EC2_STOP'
];

export const PROHIBITED_REMEDIATION_ACTIONS = [
  'RESOURCE_DELETE',
  'DATABASE_DELETE',
  'DATABASE_RESTART',
  'VOLUME_DELETE',
  'PVC_DELETE',
  'NAMESPACE_DELETE',
  'CLUSTER_WIDE_OPERATION',
  'SCALE_TO_ZERO',
  'SECURITY_GROUP_MODIFY',
  'FIREWALL_MODIFY',
  'IAM_MODIFY',
  'EXECUTE_SHELL_COMMAND',
  'EXECUTE_ARBITRARY_SCRIPT'
];

export const remediationPolicyService = {
  /**
   * Evaluates remediation action against global safety rules and active tenant policies.
   */
  async evaluatePolicy({
    tenantId = 'default_tenant',
    environment = 'staging',
    provider = 'docker',
    resourceType = 'docker_container',
    action,
    riskLevel = 'LOW',
    isProduction = false
  }) {
    const blockers = [];
    const warnings = [];

    // 1. Prohibited Action Block
    const normalizedAction = String(action || '').toUpperCase();
    if (PROHIBITED_REMEDIATION_ACTIONS.includes(normalizedAction)) {
      blockers.push(`Prohibited Action: '${normalizedAction}' is strictly prohibited by InfraPulse safety policy. Deletion, database mutations, firewall/IAM changes, and arbitrary scripts are forbidden.`);
    }

    // 2. Allowlist Check
    if (!ALLOWED_REMEDIATION_ACTIONS.includes(normalizedAction)) {
      blockers.push(`Unrecognized Action: '${normalizedAction}' is not in the allowlist of supported remediation actions. Supported: ${ALLOWED_REMEDIATION_ACTIONS.join(', ')}`);
    }

    // 3. Production Environment Protection
    const isProdEnv = isProduction || ['production', 'prod', 'live', 'prd'].includes(environment.toLowerCase());
    if (isProdEnv && !config.remediationProductionEnabled) {
      blockers.push(`Production Safeguard: Automated remediation in production environment '${environment}' is strictly DISABLED by default (REMEDIATION_PRODUCTION_ENABLED=false).`);
    }

    // 4. Global Execution Guard
    if (!config.remediationExecutionEnabled) {
      warnings.push(`Remediation execution is currently globally DISABLED via REMEDIATION_EXECUTION_ENABLED=false. Dry-run previews and approval workflows remain available.`);
    }

    // 5. Query active policy rules for tenant
    const rules = await remediationRepository.listPolicyRules(tenantId, {
      environment,
      provider,
      enabled: true
    });

    let requiresTwoPersonApproval = isProdEnv || riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
    let maxAllowedRisk = isProdEnv ? 'MEDIUM' : 'HIGH';

    if (rules.length > 0) {
      for (const rule of rules) {
        // Denied actions in policy
        const denied = Array.isArray(rule.denied_actions) ? rule.denied_actions : [];
        if (denied.map(a => a.toUpperCase()).includes(normalizedAction)) {
          blockers.push(`Tenant Policy Block: Action '${normalizedAction}' is explicitly denied by policy rule '${rule.id}'.`);
        }

        // Allowed actions filter if specified
        const allowed = Array.isArray(rule.allowed_actions) ? rule.allowed_actions : [];
        if (allowed.length > 0 && !allowed.map(a => a.toUpperCase()).includes(normalizedAction)) {
          blockers.push(`Tenant Policy Block: Action '${normalizedAction}' is not included in the permitted actions for policy rule '${rule.id}'.`);
        }

        if (rule.requires_two_person_approval) {
          requiresTwoPersonApproval = true;
        }

        if (rule.max_risk_level) {
          maxAllowedRisk = rule.max_risk_level;
        }
      }
    }

    // 6. Risk Level Ceiling Check
    const riskRank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    if ((riskRank[riskLevel] || 1) > (riskRank[maxAllowedRisk] || 3)) {
      blockers.push(`Risk Ceiling Exceeded: Action risk level '${riskLevel}' exceeds the maximum allowed risk '${maxAllowedRisk}' configured by policy.`);
    }

    // 7. Critical Risk Block
    if (riskLevel === 'CRITICAL') {
      blockers.push('Critical Risk: Actions classified as CRITICAL risk cannot be executed via automated remediation without explicit out-of-band administrative override.');
    }

    return {
      allowed: blockers.length === 0,
      action: normalizedAction,
      environment,
      riskLevel,
      requiresTwoPersonApproval,
      blockers,
      warnings
    };
  }
};

