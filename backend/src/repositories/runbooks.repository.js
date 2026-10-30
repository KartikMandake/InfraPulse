import { query } from '../db/connection.js';

function mapRunbookRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    riskLevel: row.risk_level,
    executionMode: row.execution_mode,
    supportedIncidentTypes: typeof row.supported_incident_types === 'string'
      ? JSON.parse(row.supported_incident_types)
      : (row.supported_incident_types || []),
    applicableServices: typeof row.applicable_services === 'string'
      ? JSON.parse(row.applicable_services)
      : (row.applicable_services || []),
    preconditions: typeof row.preconditions === 'string'
      ? JSON.parse(row.preconditions)
      : (row.preconditions || []),
    expectedOutcome: row.expected_outcome,
    verificationProcedure: row.verification_procedure,
    rollbackProcedure: row.rollback_procedure,
    requiredApprovalRole: row.required_approval_role,
    version: Number(row.version),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapVersionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    runbookId: row.runbook_id,
    version: Number(row.version),
    definition: typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition,
    changelog: row.changelog,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export async function findAllRunbooks(filters = {}, client = null) {
  const q = client ? client.query.bind(client) : query;
  let sql = 'SELECT * FROM runbooks WHERE 1=1';
  const params = [];

  if (filters.enabled !== undefined) {
    params.push(Boolean(filters.enabled));
    sql += ` AND enabled = $${params.length}`;
  }
  if (filters.riskLevel) {
    params.push(filters.riskLevel);
    sql += ` AND risk_level = $${params.length}`;
  }
  if (filters.executionMode) {
    params.push(filters.executionMode);
    sql += ` AND execution_mode = $${params.length}`;
  }

  sql += ' ORDER BY risk_level ASC, title ASC;';
  const res = await q(sql, params);
  let runbooks = res.rows.map(mapRunbookRow);

  // Filter in-memory for array fields if requested
  if (filters.serviceId) {
    runbooks = runbooks.filter(rb => 
      rb.applicableServices.includes('*') || rb.applicableServices.includes(filters.serviceId)
    );
  }
  if (filters.incidentType) {
    runbooks = runbooks.filter(rb =>
      rb.supportedIncidentTypes.some(t => t.toLowerCase() === filters.incidentType.toLowerCase())
    );
  }

  return runbooks;
}

export async function findRunbookById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM runbooks WHERE id = $1;', [id]);
  return mapRunbookRow(res.rows[0]);
}

export async function createRunbook(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `INSERT INTO runbooks (
      id, title, description, risk_level, execution_mode,
      supported_incident_types, applicable_services, preconditions,
      expected_outcome, verification_procedure, rollback_procedure,
      required_approval_role, version, enabled
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    RETURNING *;`,
    [
      data.id,
      data.title,
      data.description,
      data.riskLevel,
      data.executionMode,
      JSON.stringify(data.supportedIncidentTypes || []),
      JSON.stringify(data.applicableServices || ['*']),
      JSON.stringify(data.preconditions || []),
      data.expectedOutcome,
      data.verificationProcedure,
      data.rollbackProcedure || null,
      data.requiredApprovalRole || 'responder',
      data.version || 1,
      data.enabled !== false
    ]
  );
  return mapRunbookRow(res.rows[0]);
}

export async function updateRunbook(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const fields = [];
  const params = [id];

  if (updates.title !== undefined) {
    params.push(updates.title);
    fields.push(`title = $${params.length}`);
  }
  if (updates.description !== undefined) {
    params.push(updates.description);
    fields.push(`description = $${params.length}`);
  }
  if (updates.riskLevel !== undefined) {
    params.push(updates.riskLevel);
    fields.push(`risk_level = $${params.length}`);
  }
  if (updates.executionMode !== undefined) {
    params.push(updates.executionMode);
    fields.push(`execution_mode = $${params.length}`);
  }
  if (updates.supportedIncidentTypes !== undefined) {
    params.push(JSON.stringify(updates.supportedIncidentTypes));
    fields.push(`supported_incident_types = $${params.length}`);
  }
  if (updates.applicableServices !== undefined) {
    params.push(JSON.stringify(updates.applicableServices));
    fields.push(`applicable_services = $${params.length}`);
  }
  if (updates.preconditions !== undefined) {
    params.push(JSON.stringify(updates.preconditions));
    fields.push(`preconditions = $${params.length}`);
  }
  if (updates.expectedOutcome !== undefined) {
    params.push(updates.expectedOutcome);
    fields.push(`expected_outcome = $${params.length}`);
  }
  if (updates.verificationProcedure !== undefined) {
    params.push(updates.verificationProcedure);
    fields.push(`verification_procedure = $${params.length}`);
  }
  if (updates.rollbackProcedure !== undefined) {
    params.push(updates.rollbackProcedure);
    fields.push(`rollback_procedure = $${params.length}`);
  }
  if (updates.requiredApprovalRole !== undefined) {
    params.push(updates.requiredApprovalRole);
    fields.push(`required_approval_role = $${params.length}`);
  }
  if (updates.version !== undefined) {
    params.push(updates.version);
    fields.push(`version = $${params.length}`);
  }
  if (updates.enabled !== undefined) {
    params.push(Boolean(updates.enabled));
    fields.push(`enabled = $${params.length}`);
  }

  fields.push('updated_at = NOW()');

  const res = await q(
    `UPDATE runbooks SET ${fields.join(', ')} WHERE id = $1 RETURNING *;`,
    params
  );
  return mapRunbookRow(res.rows[0]);
}

export async function findRunbookVersion(runbookId, version, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    'SELECT * FROM runbook_versions WHERE runbook_id = $1 AND version = $2;',
    [runbookId, version]
  );
  return mapVersionRow(res.rows[0]);
}

export async function createRunbookVersion(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `${data.runbookId}-v${data.version}`;
  const res = await q(
    `INSERT INTO runbook_versions (
      id, runbook_id, version, definition, changelog, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6
    )
    ON CONFLICT (runbook_id, version) DO UPDATE SET
      definition = EXCLUDED.definition,
      changelog = EXCLUDED.changelog
    RETURNING *;`,
    [
      id,
      data.runbookId,
      data.version,
      JSON.stringify(data.definition),
      data.changelog || 'Version snapshot',
      data.createdBy || null
    ]
  );
  return mapVersionRow(res.rows[0]);
}

