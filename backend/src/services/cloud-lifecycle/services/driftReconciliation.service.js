// ==============================================================================
// InfraPulse - Governed Drift Reconciliation Intelligence Service
// Phase 23G: Controlled Reconciliation Planning, Impact Assessment & Approval Integration
//
// Safety Guarantees:
// 1. Absolutely NO automatic reconciliation or automated execution.
// 2. Absolutely NO deletion of namespaces, containers, PVCs, or persistent volumes.
// 3. Mandatory two-person approval and separation of duties for all reconciliation plans.
// 4. Live mutations require explicit confirmation (explicitConfirmation: true).
// 5. If mutation cannot be executed safely, provides manual guided runbook recommendation.
// ==============================================================================

import crypto from 'crypto';
import { driftGovernanceRepository } from '../../../repositories/driftGovernance.repository.js';
import { resourceService } from './resource.service.js';
import { dependencyCheckService } from './dependency-check.service.js';
import { workloadEligibilityService } from './workloadEligibility.service.js';
import { lifecycleService } from './lifecycle.service.js';
import { recordAuditEvent } from '../../audit.service.js';

export const driftReconciliationService = {
  /**
   * Generates a proposed reconciliation plan for a detected drift event.
   */
  async previewReconciliationPlan(arg1, arg2) {
    let driftId, user;
    if (typeof arg1 === 'object') {
      driftId = arg1.driftId;
      user = arg1.user;
    } else {
      driftId = arg1;
      user = arg2;
    }

    const drift = await driftGovernanceRepository.getDriftById(driftId);
    if (!drift) {
      throw new Error(`Drift event '${driftId}' not found.`);
    }

    const resource = await resourceService.getResourceById(drift.resource_id).catch(() => null);
    const expected = typeof drift.expected_configuration === 'string'
      ? JSON.parse(drift.expected_configuration)
      : drift.expected_configuration;
    const actual = typeof drift.actual_configuration === 'string'
      ? JSON.parse(drift.actual_configuration)
      : drift.actual_configuration;
    const changedFields = Array.isArray(drift.changed_fields)
      ? drift.changed_fields
      : JSON.parse(drift.changed_fields || '[]');

    const proposedActions = [];
    let isDisruptive = false;
    let manualRecommendation = null;
    let safetyAssessment = { safe: true, blockers: [], warnings: [] };
    let eligibility = { eligible: true, blockers: [], warnings: [] };

    const normType = (drift.drift_type || '').toUpperCase();

    // Determine safe, governed action based on drift type
    if (normType === 'REPLICA_MISMATCH') {
      const desiredReplicas = expected.replicas !== undefined
        ? expected.replicas
        : (expected.kubernetes?.replicas !== undefined ? expected.kubernetes.replicas : 1);

      proposedActions.push({
        action: 'SCALE_WORKLOAD',
        resourceId: drift.resource_id,
        targetReplicas: desiredReplicas,
        targetState: `${desiredReplicas} replicas`,
        description: `Scale workload '${drift.resource_name}' from ${actual.kubernetes?.replicas || actual.replicas || 'unknown'} to desired ${desiredReplicas} replica(s).`
      });
      isDisruptive = desiredReplicas === 0;
    } else if (normType === 'WORKLOAD_STATE_DRIFT') {
      const desiredState = expected.state || 'running';
      const action = desiredState === 'running'
        ? (drift.provider === 'docker' ? 'START_CONTAINER' : 'start')
        : (drift.provider === 'docker' ? 'STOP_CONTAINER' : 'stop');

      proposedActions.push({
        action,
        resourceId: drift.resource_id,
        targetState: desiredState,
        description: `Transition workload '${drift.resource_name}' from '${actual.state || 'unknown'}' to desired state '${desiredState}'.`
      });
      isDisruptive = action === 'stop' || action === 'STOP_CONTAINER';
    } else if (normType === 'MISSING_RESOURCE') {
      manualRecommendation = `Missing workload '${drift.resource_name}' detected. Automated recreation is prohibited by safety rules. Please redeploy through your CI/CD pipeline or deployment manifest.`;
      proposedActions.push({
        action: 'MANUAL_REMEDIATION_REQUIRED',
        resourceId: drift.resource_id,
        targetState: 'redeploy',
        description: manualRecommendation
      });
      safetyAssessment = {
        safe: false,
        blockers: ['Automated recreation of missing resources is prohibited by safety policy.'],
        warnings: []
      };
    } else if (normType === 'UNEXPECTED_ADDITION') {
      manualRecommendation = `Automated deletion of unexpected resources is forbidden by safety policy. Unmanaged workload '${drift.resource_name}' was detected. Either register this resource in your authorized baseline or conduct manual decommissioning.`;
      proposedActions.push({
        action: 'MANUAL_REMEDIATION_REQUIRED',
        resourceId: drift.resource_id,
        targetState: 'manual',
        description: manualRecommendation
      });
      safetyAssessment = {
        safe: false,
        blockers: ['Automated deletion of unexpected resources is forbidden by safety policy.'],
        warnings: []
      };
    } else {
      // Configuration drift (e.g. instance type, image, env)
      manualRecommendation = `Configuration delta detected on '${drift.resource_name}'. To reconcile, apply your GitOps / Compose / Kubernetes manifest updates through standard CI/CD deployment channels.`;
      proposedActions.push({
        action: 'MANUAL_REMEDIATION_REQUIRED',
        resourceId: drift.resource_id,
        targetState: 'ci_cd',
        description: manualRecommendation
      });
      safetyAssessment = {
        safe: false,
        blockers: ['Configuration updates must be applied via GitOps / CI/CD pipeline.'],
        warnings: []
      };
    }

    if (resource && proposedActions.length > 0 && proposedActions[0].action !== 'MANUAL_REMEDIATION_REQUIRED') {
      const primaryAction = proposedActions[0].action.toLowerCase().includes('scale') ? 'scale' : (proposedActions[0].action.toLowerCase().includes('start') ? 'start' : 'stop');
      safetyAssessment = await dependencyCheckService.evaluateSafetyChecks(resource, primaryAction);
      eligibility = await workloadEligibilityService.evaluateEligibility(resource, primaryAction, {
        targetReplicas: proposedActions[0].targetReplicas
      });
    }

    const isExecutable = proposedActions.length > 0 &&
      proposedActions[0].action !== 'MANUAL_REMEDIATION_REQUIRED' &&
      safetyAssessment.safe &&
      eligibility.eligible;

    const planId = `rec_plan_${crypto.randomBytes(6).toString('hex')}`;
    const plan = await driftGovernanceRepository.createReconciliationPlan({
      id: planId,
      tenantId: drift.tenant_id,
      organizationId: drift.organization_id,
      environment: drift.environment,
      driftId: drift.id,
      resourceId: drift.resource_id,
      status: 'preview',
      proposedActions,
      fieldDiffs: changedFields,
      affectedDependencies: drift.dependency_impact?.downstreamCallers || [],
      riskAssessment: {
        isDisruptive,
        severity: drift.severity,
        manualRecommendation,
        safetyAssessment
      },
      eligibilityResult: eligibility,
      requestedBy: user?.email || user?.name || 'anonymous'
    });

    plan.is_executable = isExecutable;
    plan.safety_assessment = safetyAssessment;
    plan.proposed_actions = proposedActions;

    return plan;
  },

  /**
   * Submits an official reconciliation request for two-person approval.
   */
  async submitReconciliationRequest(arg1, arg2, arg3) {
    let planId, reason, user;
    if (typeof arg1 === 'object') {
      planId = arg1.planId;
      reason = arg1.reason;
      user = arg1.user;
    } else {
      planId = arg1;
      reason = arg2;
      user = arg3;
    }

    if (!user || user.role === 'viewer') {
      throw new Error(`Forbidden: Role 'viewer' is not authorized to request reconciliation. Minimum role required: 'responder'.`);
    }

    const plan = await driftGovernanceRepository.getReconciliationPlanById(planId);
    if (!plan) throw new Error(`Reconciliation plan '${planId}' not found.`);

    if (plan.status !== 'preview') {
      throw new Error(`Reconciliation plan '${planId}' is already in '${plan.status}' status.`);
    }

    const proposedActions = Array.isArray(plan.proposed_actions) ? plan.proposed_actions : JSON.parse(plan.proposed_actions || '[]');
    if (proposedActions.length === 0 || proposedActions[0].action === 'MANUAL_REMEDIATION_REQUIRED') {
      throw new Error(`Cannot submit automated reconciliation: Plan contains only manual recommendations (${plan.risk_assessment?.manualRecommendation || 'no automated actions'}).`);
    }

    const primaryAction = proposedActions[0];
    let lifecycleAction = 'start';
    if (primaryAction.action.toLowerCase().includes('scale')) {
      lifecycleAction = 'scale';
    } else if (primaryAction.action.toLowerCase().includes('stop')) {
      lifecycleAction = 'stop';
    }

    // Request lifecycle operation via existing two-person framework
    const idempotencyKey = `idemp_rec_${planId}_${Date.now()}`;
    const lifecycleOp = await lifecycleService.requestOperation({
      resourceId: plan.resource_id,
      action: lifecycleAction,
      idempotencyKey,
      user,
      targetReplicas: primaryAction.targetReplicas,
      reason: reason || `Drift Reconciliation for ${plan.drift_id}: ${primaryAction.description}`
    });

    lifecycleOp.parameters = {
      targetReplicas: primaryAction.targetReplicas
    };

    // Update plan status to 'requested'
    const updatedPlan = await driftGovernanceRepository.updateReconciliationPlanStatus(planId, 'requested', {
      operationId: lifecycleOp.id
    });

    // Update drift status to 'reconciling'
    await driftGovernanceRepository.updateDriftStatus(plan.drift_id, 'reconciling');

    await recordAuditEvent({
      userId: user.id || null,
      userEmail: user.email,
      action: 'CLOUD_RECONCILIATION_REQUESTED',
      resourceType: 'cloud_reconciliation_plan',
      resourceId: planId,
      details: { driftId: plan.drift_id, operationId: lifecycleOp.id, action: primaryAction.action }
    });

    return {
      reconciliationPlan: updatedPlan,
      lifecycleOperation: lifecycleOp
    };
  },

  /**
   * Acknowledges or ignores a drift event.
   */
  async acknowledgeOrIgnoreDrift(arg1, arg2, arg3, arg4) {
    let driftId, status = 'acknowledged', reason = null, user = null;
    if (typeof arg2 === 'object' && arg2 !== null) {
      driftId = arg1;
      status = arg2.status || 'acknowledged';
      reason = arg2.reason || null;
      user = arg2.user || null;
    } else {
      driftId = arg1;
      status = arg2 || 'acknowledged';
      reason = arg3 || null;
      user = arg4 || null;
    }

    if (user?.role === 'viewer') {
      throw new Error(`Forbidden: Role 'viewer' cannot acknowledge or ignore drift events.`);
    }

    if (!['acknowledged', 'ignored'].includes(status)) {
      throw new Error(`Invalid status '${status}'. Must be 'acknowledged' or 'ignored'.`);
    }

    const updated = await driftGovernanceRepository.updateDriftStatus(driftId, status, {
      resolvedBy: user?.email || 'admin',
      resolutionDetails: reason
    });

    await recordAuditEvent({
      userId: user?.id || null,
      userEmail: user?.email || 'admin',
      action: `CLOUD_DRIFT_${status.toUpperCase()}`,
      resourceType: 'cloud_drift_event',
      resourceId: driftId,
      details: { status, reason }
    });

    return updated;
  }
};
