import { query } from '../db/connection.js';

function mapExecutionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    runbookId: row.runbook_id,
    runbookVersion: Number(row.runbook_version),
    incidentId: row.incident_id,
    targetServiceId: row.target_service_id,
    executionMode: row.execution_mode,
    riskLevel: row.risk_level,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    planHash: row.plan_hash,
    dryRunPlan: typeof row.dry_run_plan === 'string' ? JSON.parse(row.dry_run_plan) : row.dry_run_plan,
    preconditionsMet: Boolean(row.preconditions_met),
    preconditionDetails: typeof row.precondition_details === 'string'
      ? JSON.parse(row.precondition_details)
      : (row.precondition_details || []),
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    compensationStatus: row.compensation_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStepRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    executionId: row.execution_id,
    stepNumber: Number(row.step_number),
    name: row.name,
    adapterAction: row.adapter_action,
    isRemediation: Boolean(row.is_remediation),
    status: row.status,
    parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : (row.parameters || {}),
    result: typeof row.result === 'string' ? JSON.parse(row.result) : (row.result || {}),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message
  };
}

function mapApprovalRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    executionId: row.execution_id,
    runbookId: row.runbook_id,
    runbookVersion: Number(row.runbook_version),
    planHash: row.plan_hash,
    riskLevel: row.risk_level,
    requiredRole: row.required_role,
    requestedBy: row.requested_by,
    approverId: row.approver_id,
    status: row.status,
    approvalNotes: row.approval_notes,
    twoFactorConfirmed: Boolean(row.two_factor_confirmed),
    requestedAt: row.requested_at,
    decidedAt: row.decided_at
  };
}

function mapLogRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    executionId: row.execution_id,
    stepId: row.step_id,
    action: row.action,
    adapterType: row.adapter_type,
    targetServiceId: row.target_service_id,
    parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : (row.parameters || {}),
    result: typeof row.result === 'string' ? JSON.parse(row.result) : (row.result || {}),
    outcome: row.outcome,
    executedBy: row.executed_by,
    createdAt: row.created_at
  };
}

export async function createExecution(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `INSERT INTO runbook_executions (
      id, runbook_id, runbook_version, incident_id, target_service_id,
      execution_mode, risk_level, status, idempotency_key, plan_hash,
      dry_run_plan, preconditions_met, precondition_details, requested_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    RETURNING *;`,
    [
      data.id,
      data.runbookId,
      data.runbookVersion,
      data.incidentId || null,
      data.targetServiceId,
      data.executionMode,
      data.riskLevel,
      data.status || 'DRAFT',
      data.idempotencyKey,
      data.planHash,
      JSON.stringify(data.dryRunPlan),
      Boolean(data.preconditionsMet),
      JSON.stringify(data.preconditionDetails || []),
      data.requestedBy
    ]
  );
  return mapExecutionRow(res.rows[0]);
}

export async function findExecutionById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM runbook_executions WHERE id = $1;', [id]);
  return mapExecutionRow(res.rows[0]);
}

export async function findExecutionByIdempotencyKey(key, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM runbook_executions WHERE idempotency_key = $1;', [key]);
  return mapExecutionRow(res.rows[0]);
}

export async function findActiveExecutionForIncident(incidentId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `SELECT * FROM runbook_executions 
     WHERE incident_id = $1 AND status IN ('PENDING_APPROVAL', 'APPROVED', 'RUNNING') 
     ORDER BY created_at DESC LIMIT 1;`,
    [incidentId]
  );
  return mapExecutionRow(res.rows[0]);
}

export async function updateExecution(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const fields = [];
  const params = [id];

  if (updates.status !== undefined) {
    params.push(updates.status);
    fields.push(`status = $${params.length}`);
  }
  if (updates.startedAt !== undefined) {
    params.push(updates.startedAt);
    fields.push(`started_at = $${params.length}`);
  }
  if (updates.completedAt !== undefined) {
    params.push(updates.completedAt);
    fields.push(`completed_at = $${params.length}`);
  }
  if (updates.errorMessage !== undefined) {
    params.push(updates.errorMessage);
    fields.push(`error_message = $${params.length}`);
  }
  if (updates.compensationStatus !== undefined) {
    params.push(updates.compensationStatus);
    fields.push(`compensation_status = $${params.length}`);
  }

  fields.push('updated_at = NOW()');

  const res = await q(
    `UPDATE runbook_executions SET ${fields.join(', ')} WHERE id = $1 RETURNING *;`,
    params
  );
  return mapExecutionRow(res.rows[0]);
}

export async function createExecutionStep(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `INSERT INTO runbook_execution_steps (
      id, execution_id, step_number, name, adapter_action,
      is_remediation, status, parameters, result
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    RETURNING *;`,
    [
      data.id,
      data.executionId,
      data.stepNumber,
      data.name,
      data.adapterAction,
      Boolean(data.isRemediation),
      data.status || 'PENDING',
      JSON.stringify(data.parameters || {}),
      JSON.stringify(data.result || {})
    ]
  );
  return mapStepRow(res.rows[0]);
}

export async function updateExecutionStep(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const fields = [];
  const params = [id];

  if (updates.status !== undefined) {
    params.push(updates.status);
    fields.push(`status = $${params.length}`);
  }
  if (updates.result !== undefined) {
    params.push(JSON.stringify(updates.result));
    fields.push(`result = $${params.length}`);
  }
  if (updates.startedAt !== undefined) {
    params.push(updates.startedAt);
    fields.push(`started_at = $${params.length}`);
  }
  if (updates.completedAt !== undefined) {
    params.push(updates.completedAt);
    fields.push(`completed_at = $${params.length}`);
  }
  if (updates.errorMessage !== undefined) {
    params.push(updates.errorMessage);
    fields.push(`error_message = $${params.length}`);
  }

  const res = await q(
    `UPDATE runbook_execution_steps SET ${fields.join(', ')} WHERE id = $1 RETURNING *;`,
    params
  );
  return mapStepRow(res.rows[0]);
}

export async function findExecutionSteps(executionId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    'SELECT * FROM runbook_execution_steps WHERE execution_id = $1 ORDER BY step_number ASC;',
    [executionId]
  );
  return res.rows.map(mapStepRow);
}

export async function createApproval(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `INSERT INTO remediation_approvals (
      id, execution_id, runbook_id, runbook_version, plan_hash,
      risk_level, required_role, requested_by, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    RETURNING *;`,
    [
      data.id,
      data.executionId,
      data.runbookId,
      data.runbookVersion,
      data.planHash,
      data.riskLevel,
      data.requiredRole,
      data.requestedBy,
      data.status || 'PENDING'
    ]
  );
  return mapApprovalRow(res.rows[0]);
}

export async function findApprovalByExecutionId(executionId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    'SELECT * FROM remediation_approvals WHERE execution_id = $1 ORDER BY requested_at DESC LIMIT 1;',
    [executionId]
  );
  return mapApprovalRow(res.rows[0]);
}

export async function updateApproval(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const fields = [];
  const params = [id];

  if (updates.status !== undefined) {
    params.push(updates.status);
    fields.push(`status = $${params.length}`);
  }
  if (updates.approverId !== undefined) {
    params.push(updates.approverId);
    fields.push(`approver_id = $${params.length}`);
  }
  if (updates.approvalNotes !== undefined) {
    params.push(updates.approvalNotes);
    fields.push(`approval_notes = $${params.length}`);
  }
  if (updates.twoFactorConfirmed !== undefined) {
    params.push(Boolean(updates.twoFactorConfirmed));
    fields.push(`two_factor_confirmed = $${params.length}`);
  }
  if (updates.decidedAt !== undefined) {
    params.push(updates.decidedAt);
    fields.push(`decided_at = $${params.length}`);
  }

  const res = await q(
    `UPDATE remediation_approvals SET ${fields.join(', ')} WHERE id = $1 RETURNING *;`,
    params
  );
  return mapApprovalRow(res.rows[0]);
}

export async function createActionLog(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const res = await q(
    `INSERT INTO remediation_action_logs (
      id, execution_id, step_id, action, adapter_type,
      target_service_id, parameters, result, outcome, executed_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    )
    RETURNING *;`,
    [
      id,
      data.executionId,
      data.stepId || null,
      data.action,
      data.adapterType || 'simulation',
      data.targetServiceId,
      JSON.stringify(data.parameters || {}),
      JSON.stringify(data.result || {}),
      data.outcome,
      data.executedBy || null
    ]
  );
  return mapLogRow(res.rows[0]);
}

export async function findActionLogsByExecutionId(executionId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    'SELECT * FROM remediation_action_logs WHERE execution_id = $1 ORDER BY created_at ASC;',
    [executionId]
  );
  return res.rows.map(mapLogRow);
}

