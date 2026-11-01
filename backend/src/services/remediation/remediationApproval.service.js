import {governanceError} from '../../utils/governanceError.js';
// ==============================================================================
// InfraPulse - Remediation Approval & Separation of Duties Service
// Phase 23J: Multi-Party Approvals, Plan Immutability & Expiration Governance
// ==============================================================================

import { config } from '../../config/env.js';
import { remediationRepository } from '../../repositories/remediation.repository.js';
import { recordAuditEvent } from '../audit.service.js';
import {assertPlanIntegrity} from '../../security/planIntegrity.js';
import {query} from '../../db/connection.js';

export const remediationApprovalService = {
  /**
   * 1. REQUEST APPROVAL
   */
  async requestApproval({
    planId,
    user,
    tenantId = 'default_tenant',
    ttlMinutes = config.remediationApprovalTtlMinutes
  }) {
    if (!user || !user.email) {
      throw governanceError('Unauthorized: Valid user credentials required to request remediation approval.');
    }

    if (user.role === 'viewer') {
      throw governanceError("Forbidden: Role 'viewer' cannot request infrastructure remediation approvals. Minimum role required: 'responder'.");
    }

    const plan = await remediationRepository.getPlanById(planId, tenantId);
    if (!plan) {
      throw governanceError(`Remediation Plan '${planId}' not found.`);
    }

    if (!plan.is_current_version) {
      throw governanceError(`Plan Version Invalid: Plan '${planId}' has been superseded by a newer version.`);
    }
    assertPlanIntegrity(plan);

    // Check if pending approval already exists
    const existing = await remediationRepository.getApprovalByPlanId(planId, tenantId);
    if (existing && existing.approval_status === 'PENDING') {
      const now = Date.now();
      if (now < new Date(existing.expires_at).getTime()) {
        return existing;
      }
    }

    const expiresAt = new Date(Date.now() + (ttlMinutes || 60) * 60000).toISOString();

    const approval = await remediationRepository.createApproval({
      planId: plan.id,
      planVersion: plan.version,
      tenantId,
      requesterEmail: user.email,
      requesterRole: user.role,
      approvalStatus: 'PENDING',
      expiresAt
    });

    await recordAuditEvent({
      userId: user.id || null,
      userEmail: user.email,
      action: 'REMEDIATION_APPROVAL_REQUESTED',
      resourceType: 'remediation_approval',
      resourceId: approval.id,
      details: {
        plan_id: plan.id,
        plan_version: plan.version,
        action: plan.action,
        target_resource: plan.target_resource_id,
        expires_at: expiresAt
      }
    });

    return approval;
  },

  /**
   * 2. APPROVE PLAN
   * Enforces Separation of Duties, Two-Person Approval, Plan Immutability, and Expiration.
   */
  async approvePlan({
    approvalId,
    user,
    planHash = null,
    tenantId = 'default_tenant'
  }) {
    if (!user || !user.email) {
      throw governanceError('Unauthorized: Authentication required.');
    }

    if (user.role !== 'admin' && user.role !== 'responder') {
      throw governanceError("Forbidden: Minimum role 'responder' or 'admin' required to approve remediation plans.");
    }

    const approval = await remediationRepository.getApprovalById(approvalId, tenantId);
    if (!approval) {
      throw governanceError(`Approval record '${approvalId}' not found.`);
    }

    // 1. Expiration Check
    if (Date.now() > new Date(approval.expires_at).getTime()) {
      await remediationRepository.updateApprovalStatus(approvalId, {
        approvalStatus: 'EXPIRED'
      }, tenantId);
      throw governanceError(`Approval Expired: Approval '${approvalId}' expired at ${approval.expires_at}. Request a new approval.`);
    }

    // 2. Status Check
    if (approval.approval_status === 'REJECTED' || approval.approval_status === 'REVOKED') {
      throw governanceError(`Approval Invalid: Approval is in '${approval.approval_status}' state and cannot be approved.`);
    }

    // 3. Separation of Duties: Requester cannot approve their own remediation
    if (approval.requester_email === user.email) {
      throw governanceError(`Separation of Duties Violation: Requester (${user.email}) cannot approve their own remediation plan.`);
    }

    // 4. Plan Immutability Check
    const plan = await remediationRepository.getPlanById(approval.plan_id, tenantId);
    if (!plan || !plan.is_current_version) {
      throw governanceError('Plan Invalidation: The underlying remediation plan has been modified or superseded.');
    }

    assertPlanIntegrity(plan);
    if (!planHash || plan.plan_hash !== planHash) {
      throw governanceError(`Plan Tampering Detected: Provided plan hash does not match immutable plan version hash (${plan.plan_hash}).`);
    }

    // 5. Check if two-person approval is needed
    const recommendation = await remediationRepository.getRecommendationById(plan.recommendation_id, tenantId);
    const requiresTwoPerson = recommendation?.risk_level === 'HIGH' || recommendation?.risk_level === 'CRITICAL' || recommendation?.environment === 'production';

    let finalStatus = 'APPROVED';
    const updates = {};

    if (requiresTwoPerson) {
      if (!approval.approver_email) {
        // First approval recorded
        updates.approverEmail = user.email;
        updates.approverRole = user.role;
        updates.approvalStatus = 'PENDING_SECOND_APPROVAL';
        finalStatus = 'PENDING_SECOND_APPROVAL';
      } else {
        // Second approval verification
        if (approval.approver_email === user.email) {
          throw governanceError(`Separation of Duties Violation: Second approval must be from a different administrator than the first approver (${approval.approver_email}).`);
        }
        updates.secondApproverEmail = user.email;
        updates.secondApproverRole = user.role;
        updates.approvalStatus = 'APPROVED';
        finalStatus = 'APPROVED';
      }
    } else {
      updates.approverEmail = user.email;
      updates.approverRole = user.role;
      updates.approvalStatus = 'APPROVED';
      finalStatus = 'APPROVED';
    }

    const updated = await remediationRepository.updateApprovalStatus(approvalId, updates, tenantId);
    await query('UPDATE infra_remediation_approvals SET approved_plan_hash=$1 WHERE id=$2 AND tenant_id=$3',[plan.plan_hash,approvalId,tenantId]);

    if (finalStatus === 'APPROVED') {
      await remediationRepository.updateRecommendationStatus(plan.recommendation_id, 'APPROVED', tenantId);
    }

    await recordAuditEvent({
      userId: user.id || null,
      userEmail: user.email,
      action: finalStatus === 'APPROVED' ? 'REMEDIATION_PLAN_APPROVED' : 'REMEDIATION_FIRST_APPROVAL_RECORDED',
      resourceType: 'remediation_approval',
      resourceId: approvalId,
      details: {
        plan_id: plan.id,
        plan_version: plan.version,
        approver: user.email,
        status: finalStatus
      }
    });

    return updated;
  },

  /**
   * 3. REJECT PLAN
   */
  async rejectPlan({
    approvalId,
    user,
    reason = 'Rejected by reviewer',
    tenantId = 'default_tenant'
  }) {
    const approval = await remediationRepository.getApprovalById(approvalId, tenantId);
    if (!approval) throw governanceError(`Approval '${approvalId}' not found.`);

    const updated = await remediationRepository.updateApprovalStatus(approvalId, {
      approvalStatus: 'REJECTED',
      rejectionReason: reason
    }, tenantId);

    const plan = await remediationRepository.getPlanById(approval.plan_id, tenantId);
    if (plan) {
      await remediationRepository.updateRecommendationStatus(plan.recommendation_id, 'REJECTED', tenantId);
    }

    await recordAuditEvent({
      userId: user?.id || null,
      userEmail: user?.email || 'reviewer',
      action: 'REMEDIATION_PLAN_REJECTED',
      resourceType: 'remediation_approval',
      resourceId: approvalId,
      details: { reason }
    });

    return updated;
  },

  /**
   * 4. REVOKE APPROVAL
   */
  async revokeApproval({
    approvalId,
    user,
    reason = 'Revoked prior to execution',
    tenantId = 'default_tenant'
  }) {
    const approval = await remediationRepository.getApprovalById(approvalId, tenantId);
    if (!approval) throw governanceError(`Approval '${approvalId}' not found.`);

    if (approval.approval_status !== 'APPROVED') {
      throw governanceError(`Cannot revoke approval in status '${approval.approval_status}'.`);
    }

    const updated = await remediationRepository.updateApprovalStatus(approvalId, {
      approvalStatus: 'REVOKED',
      revocationReason: reason
    }, tenantId);

    const plan = await remediationRepository.getPlanById(approval.plan_id, tenantId);
    if (plan) {
      await remediationRepository.updateRecommendationStatus(plan.recommendation_id, 'REVOKED', tenantId);
    }

    await recordAuditEvent({
      userId: user?.id || null,
      userEmail: user?.email || 'admin',
      action: 'REMEDIATION_APPROVAL_REVOKED',
      resourceType: 'remediation_approval',
      resourceId: approvalId,
      details: { reason }
    });

    return updated;
  }
};

