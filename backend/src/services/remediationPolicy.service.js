import crypto from 'crypto';
import { ApiError } from '../utils/ApiError.js';
import {canonicalJson} from '../security/planIntegrity.js';

/**
 * Remediation Policy Service
 *
 * Centralizes all governance rules, risk boundaries, role permissions,
 * self-approval prevention, plan hash generation, and preflight verification.
 */

export const RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

export const EXECUTION_MODES = Object.freeze({
  DIAGNOSTIC: 'diagnostic',
  REMEDIATION: 'remediation'
});

/**
 * Computes a deterministic SHA-256 hash of the planned execution.
 * Binds approvals to exact runbook version, target service, steps, and parameters.
 */
export function generatePlanHash({ runbookId, runbookVersion, targetServiceId, steps = [] }) {
  const normalized = {
    runbookId,
    runbookVersion: Number(runbookVersion),
    targetServiceId,
    steps: steps.map(s => ({
      stepNumber: s.stepNumber,
      adapterAction: s.adapterAction,
      isRemediation: Boolean(s.isRemediation),
      parameters: s.parameters || {}
    }))
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalJson(normalized)))
    .digest('hex');
}

/**
 * Validates whether a user and target service are eligible to request execution of a runbook.
 */
export function validateExecutionEligibility({ user, runbook, targetServiceId, incident = null }) {
  // 1. Viewer check - viewers can never execute runbooks
  if (!user || user.role === 'viewer') {
    throw ApiError.forbidden('Viewers are not permitted to execute or initiate runbooks.');
  }

  // 2. Critical risk runbooks disabled by default
  if (runbook.riskLevel === RISK_LEVELS.CRITICAL) {
    throw ApiError.forbidden('Critical-risk automated remediation is disabled by platform safety policy.');
  }

  // 3. Service applicability check
  if (targetServiceId && Array.isArray(runbook.applicableServices)) {
    const isApplicable = runbook.applicableServices.includes('*') || runbook.applicableServices.includes(targetServiceId);
    if (!isApplicable) {
      throw ApiError.badRequest(
        `Runbook "${runbook.id}" is not applicable to service "${targetServiceId}". Applicable services: [${runbook.applicableServices.join(', ')}].`
      );
    }
  }

  // 4. Incident compatibility check if incident is provided
  if (incident && Array.isArray(runbook.supportedIncidentTypes)) {
    // Incident title/summary check or incidentId check
    const incidentTypeHint = (incident.type || incident.title || '').toLowerCase();
    const isSupported = runbook.supportedIncidentTypes.some(t => 
      incidentTypeHint.includes(t.toLowerCase()) || t === '*'
    );
    // Note: We allow execution if user manually selected the runbook, but flag a warning
  }

  return true;
}

/**
 * Evaluates whether all declared preconditions are satisfied.
 */
export function evaluatePreconditions(runbook, { incident, targetService, activeDeployments = [] }) {
  const preconditions = runbook.preconditions || [];
  const details = [];

  for (const pc of preconditions) {
    const lower = pc.toLowerCase();
    let met = true;
    let reason = 'Condition verified';

    if (lower.includes('topology') || lower.includes('service exists')) {
      met = Boolean(targetService || incident?.serviceId);
      reason = met ? 'Target service identified in topology' : 'Target service not found in registry';
    } else if (lower.includes('incident')) {
      met = Boolean(incident);
      reason = met ? `Bound to incident ${incident.id}` : 'No active incident attached';
    } else if (lower.includes('approval')) {
      // Approval will be resolved in approval step
      met = true;
      reason = 'Approval requirement governed by policy';
    } else if (lower.includes('deployment') || lower.includes('canary')) {
      const hasRecentDeploy = activeDeployments.length > 0 || incident?.canaryVersion || incident?.stableVersion;
      met = Boolean(hasRecentDeploy);
      reason = met ? 'Recent deployment event correlated' : 'No recent deployment found in correlation window';
    }

    details.push({ precondition: pc, met, reason });
  }

  const allMet = details.every(d => d.met);
  return { allMet, details };
}

/**
 * Validates approval submission per risk rules and prevents self-approval.
 */
export function validateApprovalPolicy({ user, execution, runbook, twoFactorConfirmed = false }) {
  // 1. Viewer check
  if (!user || user.role === 'viewer') {
    throw ApiError.forbidden('Viewers are not permitted to approve remediation requests.');
  }

  // 2. Strict Self-Approval Prevention
  if (user.id === execution.requestedBy) {
    throw ApiError.forbidden('Separation of duties violation: You cannot approve your own remediation request.');
  }

  // 3. Risk-based role requirements
  const risk = runbook.riskLevel;

  if (risk === RISK_LEVELS.LOW) {
    // Low risk: any responder or admin
    if (!['responder', 'admin'].includes(user.role)) {
      throw ApiError.forbidden('Responder or Admin role is required to approve this runbook.');
    }
  } else if (risk === RISK_LEVELS.MEDIUM) {
    // Medium risk: responder or admin
    if (!['responder', 'admin'].includes(user.role)) {
      throw ApiError.forbidden('Responder or Admin role is required to approve medium-risk remediation.');
    }
  } else if (risk === RISK_LEVELS.HIGH) {
    // High risk: admin ONLY + explicit two-factor / secondary confirmation
    if (user.role !== 'admin') {
      throw ApiError.forbidden('High-risk remediation requires explicit Admin approval.');
    }
    if (!twoFactorConfirmed) {
      throw ApiError.badRequest('High-risk remediation requires explicit secondary confirmation (twoFactorConfirmed=true).');
    }
  } else if (risk === RISK_LEVELS.CRITICAL) {
    throw ApiError.forbidden('Critical-risk remediation is disabled by platform safety policy.');
  }

  return true;
}

/**
 * Preflight verification immediately before executing an approved runbook.
 * Prevents race conditions, plan tampering, and execution of stale runbook versions.
 */
export function validateExecutionPreflight({ execution, approval = null, currentRunbook }) {
  assertRunbookPlanIntegrity(execution);
  // 1. Stale runbook version check
  if (currentRunbook.version !== execution.runbookVersion) {
    throw ApiError.badRequest(
      `Stale runbook version detected. Execution was planned on version ${execution.runbookVersion}, but current runbook is version ${currentRunbook.version}. Please generate a new execution plan.`
    );
  }

  // 2. Diagnostic mode bypasses external approval if low risk
  if (execution.executionMode === EXECUTION_MODES.DIAGNOSTIC && execution.riskLevel === RISK_LEVELS.LOW) {
    return true;
  }

  // 3. For remediation: ensure approved status and verified approval record
  if (execution.status !== 'APPROVED') {
    throw ApiError.badRequest(`Execution must be in APPROVED state before running. Current state: "${execution.status}".`);
  }

  if (!approval || approval.status !== 'APPROVED') {
    throw ApiError.badRequest('No valid approval record found for this execution.');
  }

  // 4. Ensure plan hash matches approval record
  if (approval.planHash !== execution.planHash) {
    throw ApiError.badRequest('Security violation: Execution plan hash does not match approved plan hash.');
  }

  return true;
}

export function assertRunbookPlanIntegrity(execution){
  const plan=execution.dryRunPlan;
  if(!plan||plan.runbookId!==execution.runbookId||Number(plan.runbookVersion)!==Number(execution.runbookVersion)||plan.targetServiceId!==execution.targetServiceId||generatePlanHash(plan)!==execution.planHash)throw ApiError.conflict('Security violation: stored runbook plan content has changed. Generate and approve a new plan.');
  return true;
}

