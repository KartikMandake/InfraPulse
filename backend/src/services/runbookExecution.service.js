import * as runbooksRepo from '../repositories/runbooks.repository.js';
import * as executionsRepo from '../repositories/runbookExecutions.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import { findIncidentById } from './incidents.service.js';
import { simulationAdapter } from '../integrations/remediation/simulationAdapter.js';
import {
  validateExecutionEligibility,
  evaluatePreconditions,
  generatePlanHash,
  validateExecutionPreflight,
  RISK_LEVELS,
  EXECUTION_MODES
} from './remediationPolicy.service.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAuditEvent } from './audit.service.js';

export async function generateDryRunPlan({ incidentId = null, runbookId, targetServiceId = null, user }) {
  const runbook = await runbooksRepo.findRunbookById(runbookId);
  if (!runbook) throw ApiError.notFound(`Runbook "${runbookId}" not found.`);

  let incident = null;
  if (incidentId) {
    incident = await findIncidentById(incidentId).catch(() => null);
  }

  const effectiveServiceId = targetServiceId || incident?.serviceId || '*';

  // 1. Validate eligibility
  validateExecutionEligibility({
    user,
    runbook,
    targetServiceId: effectiveServiceId,
    incident
  });

  // 2. Fetch runbook version definition
  const versionRecord = await runbooksRepo.findRunbookVersion(runbookId, runbook.version);
  const definition = versionRecord?.definition || {};
  const steps = definition.steps || [];

  // 3. Evaluate preconditions
  const service = await servicesRepo.findServiceById(effectiveServiceId).catch(() => null);
  const { allMet, details: preconditionDetails } = evaluatePreconditions(runbook, {
    incident,
    targetService: service
  });

  // 4. Compute deterministic plan hash
  const planHash = generatePlanHash({
    runbookId: runbook.id,
    runbookVersion: runbook.version,
    targetServiceId: effectiveServiceId,
    steps
  });

  return {
    runbookId: runbook.id,
    runbookTitle: runbook.title,
    runbookVersion: runbook.version,
    incidentId: incident?.id || null,
    targetServiceId: effectiveServiceId,
    executionMode: runbook.executionMode,
    riskLevel: runbook.riskLevel,
    requiredApprovalRole: runbook.requiredApprovalRole,
    planHash,
    preconditionsMet: allMet,
    preconditionDetails,
    steps: steps.map(s => ({
      stepNumber: s.stepNumber,
      name: s.name,
      description: s.description,
      adapterAction: s.adapterAction,
      isRemediation: Boolean(s.isRemediation),
      parameters: s.parameters || {},
      compensationAction: s.compensationAction || null
    })),
    expectedOutcome: runbook.expectedOutcome,
    verificationProcedure: runbook.verificationProcedure,
    rollbackProcedure: runbook.rollbackProcedure,
    simulated: true,
    safetyNotice: 'Simulated Execution Mode: No real infrastructure mutations will occur.'
  };
}

export async function createExecutionPlan({ incidentId = null, runbookId, targetServiceId = null, idempotencyKey, user }) {
  if (!runbookId) throw ApiError.badRequest('runbookId is required.');
  if (!idempotencyKey) throw ApiError.badRequest('idempotencyKey is required for idempotency protection.');

  // 1. Check idempotency: Return existing execution if key already recorded
  const existingKeyRecord = await executionsRepo.findExecutionByIdempotencyKey(idempotencyKey);
  if (existingKeyRecord) {
    return getExecutionDetails(existingKeyRecord.id);
  }

  // 2. Concurrency protection: Check for active running or pending execution on same incident
  if (incidentId) {
    const active = await executionsRepo.findActiveExecutionForIncident(incidentId);
    if (active) {
      throw ApiError.conflict(
        `Another execution (${active.id}) is currently ${active.status} for incident "${incidentId}". Concurrent executions are restricted.`
      );
    }
  }

  // 3. Generate dry-run plan
  const dryRunPlan = await generateDryRunPlan({
    incidentId,
    runbookId,
    targetServiceId,
    user
  });

  const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const isDiagnosticLowRisk = dryRunPlan.executionMode === EXECUTION_MODES.DIAGNOSTIC && dryRunPlan.riskLevel === RISK_LEVELS.LOW;

  // Diagnostic low-risk runbooks can be auto-approved for execution; remediation requires approval
  const initialStatus = isDiagnosticLowRisk ? 'APPROVED' : 'DRAFT';

  const execution = await executionsRepo.createExecution({
    id: executionId,
    runbookId: dryRunPlan.runbookId,
    runbookVersion: dryRunPlan.runbookVersion,
    incidentId: dryRunPlan.incidentId,
    targetServiceId: dryRunPlan.targetServiceId,
    executionMode: dryRunPlan.executionMode,
    riskLevel: dryRunPlan.riskLevel,
    status: initialStatus,
    idempotencyKey,
    planHash: dryRunPlan.planHash,
    dryRunPlan,
    preconditionsMet: dryRunPlan.preconditionsMet,
    preconditionDetails: dryRunPlan.preconditionDetails,
    requestedBy: user.id
  });

  // 4. Create individual step tracking records
  for (const step of dryRunPlan.steps) {
    const stepId = `step_${executionId}_${step.stepNumber}`;
    await executionsRepo.createExecutionStep({
      id: stepId,
      executionId,
      stepNumber: step.stepNumber,
      name: step.name,
      adapterAction: step.adapterAction,
      isRemediation: step.isRemediation,
      status: 'PENDING',
      parameters: step.parameters,
      result: {}
    });
  }

  await recordAuditEvent({
    actor: user,
    action: 'RUNBOOK_EXECUTION_CREATED',
    resourceType: 'runbook_execution',
    resourceId: executionId,
    outcome: 'success',
    metadata: {
      runbookId: dryRunPlan.runbookId,
      mode: dryRunPlan.executionMode,
      riskLevel: dryRunPlan.riskLevel,
      status: initialStatus
    }
  }).catch(() => {});

  return getExecutionDetails(executionId);
}

export async function executeRunbook({ executionId, user }) {
  const execution = await executionsRepo.findExecutionById(executionId);
  if (!execution) throw ApiError.notFound(`Execution "${executionId}" not found.`);

  const runbook = await runbooksRepo.findRunbookById(execution.runbookId);
  if (!runbook) throw ApiError.notFound(`Runbook "${execution.runbookId}" not found.`);

  const approval = await executionsRepo.findApprovalByExecutionId(executionId);

  // 1. Strict preflight verification
  validateExecutionPreflight({
    execution,
    approval,
    currentRunbook: runbook
  });

  // 2. Transition execution status to RUNNING
  await executionsRepo.updateExecution(executionId, {
    status: 'RUNNING',
    startedAt: new Date().toISOString()
  });

  const steps = await executionsRepo.findExecutionSteps(executionId);
  let failedStep = null;

  // 3. Sequentially execute steps via controlled simulation adapter
  for (const step of steps) {
    await executionsRepo.updateExecutionStep(step.id, {
      status: 'RUNNING',
      startedAt: new Date().toISOString()
    });

    try {
      const adapterResult = await simulationAdapter.executeAction({
        action: step.adapterAction,
        targetServiceId: execution.targetServiceId,
        parameters: step.parameters,
        context: {
          executionId,
          incidentId: execution.incidentId,
          stepNumber: step.stepNumber
        }
      });

      if (!adapterResult.success) {
        throw new Error(adapterResult.error || `Adapter action "${step.adapterAction}" returned failure.`);
      }

      await executionsRepo.updateExecutionStep(step.id, {
        status: 'SUCCEEDED',
        result: adapterResult,
        completedAt: new Date().toISOString()
      });

      // Log action execution
      await executionsRepo.createActionLog({
        executionId,
        stepId: step.id,
        action: step.adapterAction,
        adapterType: 'simulation',
        targetServiceId: execution.targetServiceId,
        parameters: step.parameters,
        result: adapterResult,
        outcome: 'success',
        executedBy: user.id
      });
    } catch (stepErr) {
      failedStep = step;
      await executionsRepo.updateExecutionStep(step.id, {
        status: 'FAILED',
        errorMessage: stepErr.message,
        completedAt: new Date().toISOString()
      });

      await executionsRepo.createActionLog({
        executionId,
        stepId: step.id,
        action: step.adapterAction,
        adapterType: 'simulation',
        targetServiceId: execution.targetServiceId,
        parameters: step.parameters,
        result: { error: stepErr.message },
        outcome: 'failure',
        executedBy: user.id
      });

      // 4. Compensation Handling if defined
      const plannedStep = execution.dryRunPlan?.steps?.find(s => s.stepNumber === step.stepNumber);
      if (plannedStep?.compensationAction) {
        try {
          const compResult = await simulationAdapter.executeAction({
            action: plannedStep.compensationAction.action,
            targetServiceId: execution.targetServiceId,
            parameters: plannedStep.compensationAction.parameters || {},
            context: { executionId, stepNumber: step.stepNumber, isCompensation: true }
          });

          await executionsRepo.createActionLog({
            executionId,
            stepId: step.id,
            action: plannedStep.compensationAction.action,
            adapterType: 'simulation',
            targetServiceId: execution.targetServiceId,
            parameters: plannedStep.compensationAction.parameters,
            result: compResult,
            outcome: compResult.success ? 'compensation_success' : 'compensation_failure',
            executedBy: user.id
          });

          await executionsRepo.updateExecution(executionId, { compensationStatus: 'EXECUTED' });
        } catch (compErr) {
          await executionsRepo.updateExecution(executionId, { compensationStatus: 'FAILED' });
        }
      }

      break;
    }
  }

  // 5. Finalize execution status
  if (failedStep) {
    await executionsRepo.updateExecution(executionId, {
      status: 'FAILED',
      errorMessage: `Execution stopped at step ${failedStep.stepNumber} (${failedStep.name}).`,
      completedAt: new Date().toISOString()
    });

    await recordAuditEvent({
      actor: user,
      action: 'RUNBOOK_EXECUTION_FAILED',
      resourceType: 'runbook_execution',
      resourceId: executionId,
      outcome: 'failure',
      metadata: { failedStepNumber: failedStep.stepNumber, action: failedStep.adapterAction }
    }).catch(() => {});
  } else {
    await executionsRepo.updateExecution(executionId, {
      status: 'SUCCEEDED',
      completedAt: new Date().toISOString()
    });

    await recordAuditEvent({
      actor: user,
      action: 'RUNBOOK_EXECUTION_SUCCEEDED',
      resourceType: 'runbook_execution',
      resourceId: executionId,
      outcome: 'success',
      metadata: { stepsExecuted: steps.length, targetServiceId: execution.targetServiceId }
    }).catch(() => {});
  }

  return getExecutionDetails(executionId);
}

export async function cancelExecution({ executionId, user, reason = 'Cancelled by user' }) {
  const execution = await executionsRepo.findExecutionById(executionId);
  if (!execution) throw ApiError.notFound(`Execution "${executionId}" not found.`);

  if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(execution.status)) {
    throw ApiError.badRequest(`Cannot cancel execution in terminal status "${execution.status}".`);
  }

  const updated = await executionsRepo.updateExecution(executionId, {
    status: 'CANCELLED',
    errorMessage: reason,
    completedAt: new Date().toISOString()
  });

  await recordAuditEvent({
    actor: user,
    action: 'RUNBOOK_EXECUTION_CANCELLED',
    resourceType: 'runbook_execution',
    resourceId: executionId,
    outcome: 'success',
    metadata: { reason }
  }).catch(() => {});

  return updated;
}

export async function getExecutionDetails(executionId) {
  const execution = await executionsRepo.findExecutionById(executionId);
  if (!execution) throw ApiError.notFound(`Execution "${executionId}" not found.`);

  const [steps, approval, logs] = await Promise.all([
    executionsRepo.findExecutionSteps(executionId),
    executionsRepo.findApprovalByExecutionId(executionId),
    executionsRepo.findActionLogsByExecutionId(executionId)
  ]);

  return {
    ...execution,
    steps,
    approval,
    logs
  };
}

export async function listIncidentExecutions(incidentId) {
  const q = 'SELECT * FROM runbook_executions WHERE incident_id = $1 ORDER BY created_at DESC;';
  const res = await (await import('../db/connection.js')).query(q, [incidentId]);
  return Promise.all(res.rows.map(r => getExecutionDetails(r.id)));
}
