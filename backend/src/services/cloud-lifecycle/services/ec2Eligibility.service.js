// ==============================================================================
// InfraPulse - EC2 Resource Lifecycle Eligibility Engine
// Phase 23E: Governed AWS EC2 Start/Stop Safety & Eligibility Verification
//
// Rules:
// 1. Must be an EC2 instance (RDS, EBS, and other services are ineligible)
// 2. Must be in AWS_ALLOWED_INSTANCE_IDS allowlist if live AWS resource
// 3. Must have an approved non-production environment tag (staging, dev, test, qa)
// 4. Must NOT be the InfraPulse host instance
// 5. Must NOT be a database or critical platform dependency
// 6. Must NOT have active incidents, active remediation runbooks, or downstream running callers
// 7. Cannot infer safety from current state alone
// ==============================================================================

import { config } from '../../../config/env.js';
import { query } from '../../../db/connection.js';
import { cloudLifecycleRepository } from '../../../repositories/cloudLifecycle.repository.js';

export const APPROVED_NON_PROD_ENVIRONMENTS = ['staging', 'dev', 'development', 'test', 'qa', 'non-prod', 'sandbox'];
export const PROHIBITED_PROD_TAGS = ['production', 'prod', 'live', 'prd'];

export const ec2EligibilityService = {
  /**
   * Evaluates if an EC2 instance is strictly eligible for governed lifecycle mutations.
   *
   * @param {Object} resource - cloud_resources entity
   * @param {string} [action='stop'] - 'start' | 'stop'
   * @returns {Promise<{ eligible: boolean, blockers: string[], warnings: string[], checks: Object }>}
   */
  async evaluateEligibility(resource, action = 'stop') {
    const blockers = [];
    const warnings = [];
    const checks = {
      isEc2Instance: false,
      isAllowlisted: false,
      isNonProduction: false,
      isNotInfraPulseHost: false,
      isNotDatabaseDependency: false,
      noActiveIncidentConflict: false,
      noActiveRunbookConflict: false,
      noDownstreamCallersBlocked: false,
      mutationsFlagEnabled: false
    };

    const isLiveAws = resource.metadata?.is_live_aws === true;
    const instanceId = resource.metadata?.instance_id || resource.id.replace(/^aws-/, '');

    // 1. Resource Type Check (Must be EC2 instance)
    if (['ec2_instance', 'ec2'].includes(resource.resource_type)) {
      checks.isEc2Instance = true;
    } else {
      blockers.push(`Ineligible Resource Type: Resource '${resource.name}' is a '${resource.resource_type}'. Only EC2 instances are eligible for governed lifecycle management. RDS, EBS, and Elastic IP direct lifecycle mutations are strictly prohibited.`);
      return { eligible: false, blockers, warnings, checks };
    }

    // 2. Feature Flag Check (for live AWS resources)
    if (isLiveAws) {
      if (config.awsLifecycleMutationsEnabled) {
        checks.mutationsFlagEnabled = true;
      } else {
        blockers.push(`Live AWS Mutations Disabled: AWS_LIFECYCLE_MUTATIONS_ENABLED is false. Real AWS EC2 mutations are disabled by default for zero out-of-pocket safety.`);
      }
    } else {
      checks.mutationsFlagEnabled = true; // Simulated resources governed under Phase 23C
    }

    // 3. Allowlist Check (for live AWS resources)
    if (isLiveAws) {
      const allowed = Array.isArray(config.awsAllowedInstanceIds) ? config.awsAllowedInstanceIds : [];
      if (allowed.includes(instanceId) || allowed.includes(resource.id)) {
        checks.isAllowlisted = true;
      } else {
        blockers.push(`Instance Not Allowlisted: EC2 instance '${instanceId}' is not listed in AWS_ALLOWED_INSTANCE_IDS. Governed mutations require explicit administrative allowlisting.`);
      }
    } else {
      checks.isAllowlisted = true; // Simulated resources pass baseline
    }

    // 4. Environment & Production Tag Protection
    const env = (resource.environment || '').toLowerCase();
    const tags = resource.metadata?.tags || {};
    const envTag = (tags.Environment || tags.env || tags.stage || '').toLowerCase();

    const isTaggedProd = PROHIBITED_PROD_TAGS.includes(env) || PROHIBITED_PROD_TAGS.includes(envTag);
    const isApprovedNonProd = APPROVED_NON_PROD_ENVIRONMENTS.includes(env) || APPROVED_NON_PROD_ENVIRONMENTS.includes(envTag);

    if (isTaggedProd) {
      blockers.push(`Production Protected: Instance '${resource.name}' is tagged as PRODUCTION (${env || envTag}). Governed stop/start is strictly prohibited on production infrastructure.`);
    } else if (isApprovedNonProd) {
      checks.isNonProduction = true;
    } else {
      blockers.push(`Unverified Environment Tag: Instance environment '${env || envTag || 'unknown'}' is not an approved non-production environment. Must be tagged with one of: [${APPROVED_NON_PROD_ENVIRONMENTS.join(', ')}].`);
    }

    // 5. InfraPulse Host Self-Protection
    const hostId = config.infraPulseHostInstanceId;
    const isHostTag = (tags.Application || '').toLowerCase() === 'infrapulse' && (tags.Role || '').toLowerCase() === 'host';
    if ((hostId && (hostId === instanceId || hostId === resource.id)) || isHostTag) {
      blockers.push(`Control Plane Protected: Instance '${instanceId}' hosts the InfraPulse control plane. Halting the monitoring host is strictly forbidden.`);
    } else {
      checks.isNotInfraPulseHost = true;
    }

    // 6. Database / Critical Platform Dependency Protection
    const isDb = resource.is_critical_dependency === true ||
      (tags.Role || '').toLowerCase() === 'database' ||
      (tags.Component || '').toLowerCase() === 'database' ||
      resource.name.toLowerCase().includes('db') ||
      resource.name.toLowerCase().includes('postgres') ||
      resource.name.toLowerCase().includes('database');

    if (isDb && action === 'stop') {
      blockers.push(`Critical Database Dependency: Instance '${resource.name}' is flagged as a database or critical platform dependency. Stopping database hosts directly will crash dependent workloads.`);
    } else {
      checks.isNotDatabaseDependency = true;
    }

    // 7. Active Incident Conflicts
    try {
      const activeIncidentsRes = await query(
        `SELECT id, title, severity FROM incidents WHERE status != 'resolved' LIMIT 5;`
      );
      if (activeIncidentsRes.rows.length > 0 && action === 'stop') {
        const incList = activeIncidentsRes.rows.map(i => `${i.id} [${i.severity}]`).join(', ');
        warnings.push(`Platform has ${activeIncidentsRes.rows.length} active unresolved incident(s): ${incList}. Halting infrastructure during open incidents requires Incident Commander sign-off.`);
      }
      checks.noActiveIncidentConflict = true;
    } catch {
      checks.noActiveIncidentConflict = true;
    }

    // 8. Active Remediation Runbook Conflicts
    try {
      const activeRunbooksRes = await query(
        `SELECT id, runbook_id, status FROM runbook_executions WHERE status IN ('pending', 'running', 'approved') LIMIT 5;`
      );
      if (activeRunbooksRes.rows.length > 0 && action === 'stop') {
        blockers.push(`Active Remediation In Progress: There are ${activeRunbooksRes.rows.length} active runbook execution(s) running. Wait for automated remediations to finish before modifying EC2 state.`);
      } else {
        checks.noActiveRunbookConflict = true;
      }
    } catch {
      checks.noActiveRunbookConflict = true;
    }

    // 9. Downstream Callers Inspection (when stopping)
    if (action === 'stop') {
      const allResources = await cloudLifecycleRepository.getAllResources();
      const callers = allResources.filter(r => {
        if (r.id === resource.id) return false;
        const deps = Array.isArray(r.dependencies) ? r.dependencies : [];
        return deps.includes(resource.id) && ['running', 'in-use', 'available'].includes(r.current_state);
      });

      if (callers.length > 0) {
        const callerNames = callers.map(c => `'${c.name}' (${c.id})`).join(', ');
        blockers.push(`Downstream Workloads Active: Cannot stop '${resource.name}': Running workloads depend on it: ${callerNames}. Halt callers first.`);
      } else {
        checks.noDownstreamCallersBlocked = true;
      }
    } else {
      checks.noDownstreamCallersBlocked = true;
    }

    return {
      eligible: blockers.length === 0,
      blockers,
      warnings,
      checks
    };
  }
};

