import * as executionsRepo from '../repositories/runbookExecutions.repository.js';
import * as runbooksRepo from '../repositories/runbooks.repository.js';
import { validateApprovalPolicy } from './remediationPolicy.service.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAuditEvent } from './audit.service.js';

export async function requestApproval({ executionId, user }) {
  const execution = await executionsRepo.findExecutionById(executionId);
  if (!execution) throw ApiError.notFound(`Execution "${executionId}" not found.`);

  if (execution.status !== 'DRAFT' && execution.status !== 'PENDING_APPROVAL') {
    throw ApiError.badRequest(`Cannot request approval for execution in "${execution.status}" status.`);
  }

  const runbook = await runbooksRepo.findRunbookById(execution.runbookId);
  if (!runbook) throw ApiError.notFound(`Runbook "${execution.runbookId}" not found.`);

  // Check if approval record exists or create new
  let approval = await executionsRepo.findApprovalByExecutionId(executionId);
  if (!approval) {
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    approval = await executionsRepo.createApproval({
      id: approvalId,
      executionId,
      runbookId: execution.runbookId,
      runbookVersion: execution.runbookVersion,
      planHash: execution.planHash,
      riskLevel: execution.riskLevel,
      requiredRole: runbook.requiredApprovalRole || 'responder',
      requestedBy: user.id,
      status: 'PENDING'
    });
  }

  await executionsRepo.updateExecution(executionId, { status: 'PENDING_APPROVAL' });

  await recordAuditEvent({
    actor: user,
    action: 'REMEDIATION_APPROVAL_REQUESTED',
    resourceType: 'remediation_approval',
    resourceId: approval.id,
    outcome: 'success',
    metadata: { executionId, runbookId: execution.runbookId, riskLevel: execution.riskLevel }
  }).catch(() => {});

  return {
    approval,
    executionStatus: 'PENDING_APPROVAL'
  };
}

export async function approveExecution({ executionId, user, approvalNotes = '', twoFactorConfirmed = false }) {
  const execution = await executionsRepo.findExecutionById(executionId);
  if (!execution) throw ApiError.notFound(`Execution "${executionId}" not found.`);

  if (execution.status !== 'PENDING_APPROVAL') {
    throw ApiError.badRequest(`Execution is in "${execution.status}" status, expected "PENDING_APPROVAL".`);
  }

  const runbook = await runbooksRepo.findRunbookById(execution.runbookId);
  if (!runbook) throw ApiError.notFound(`Runbook "${execution.runbookId}" not found.`);

  // Enforce policy (risk checks, self-approval prevention)
  validateApprovalPolicy({
    user,
    execution,
    runbook,
    twoFactorConfirmed
  });

  const approval = await executionsRepo.findApprovalByExecutionId(executionId);
  if (!approval) {
    throw ApiError.notFound(`No pending approval found for execution "${executionId}".`);
  }

  const updatedApproval = await executionsRepo.updateApproval(approval.id, {
    status: 'APPROVED',
    approverId: user.id,
    approvalNotes,
    twoFactorConfirmed,
    decidedAt: new Date().toISOString()
  });

  await executionsRepo.updateExecution(executionId, { status: 'APPROVED' });

  await recordAuditEvent({
    actor: user,
    action: 'REMEDIATION_APPROVED',
    resourceType: 'remediation_approval',
    resourceId: approval.id,
    outcome: 'success',
    metadata: {
      executionId,
      runbookId: execution.runbookId,
      riskLevel: execution.riskLevel,
      approverId: user.id
    }
  }).catch(() => {});

  return {
    approval: updatedApproval,
    executionStatus: 'APPROVED'
  };
}

export async function rejectExecution({ executionId, user, rejectionReason = '' }) {
  const execution = await executionsRepo.findExecutionById(executionId);
  if (!execution) throw ApiError.notFound(`Execution "${executionId}" not found.`);

  if (execution.status !== 'PENDING_APPROVAL') {
    throw ApiError.badRequest(`Cannot reject execution in "${execution.status}" status.`);
  }

  if (!user || user.role === 'viewer') {
    throw ApiError.forbidden('Viewers cannot reject remediation requests.');
  }

  const approval = await executionsRepo.findApprovalByExecutionId(executionId);
  if (approval) {
    await executionsRepo.updateApproval(approval.id, {
      status: 'REJECTED',
      approverId: user.id,
      approvalNotes: rejectionReason,
      decidedAt: new Date().toISOString()
    });
  }

  const updatedExecution = await executionsRepo.updateExecution(executionId, {
    status: 'CANCELLED',
    errorMessage: `Remediation rejected by ${user.name || user.email}: ${rejectionReason}`
  });

  await recordAuditEvent({
    actor: user,
    action: 'REMEDIATION_REJECTED',
    resourceType: 'remediation_approval',
    resourceId: approval?.id || executionId,
    outcome: 'success',
    metadata: { executionId, rejectionReason, rejectedBy: user.id }
  }).catch(() => {});

  return {
    execution: updatedExecution,
    rejectionReason
  };
}
