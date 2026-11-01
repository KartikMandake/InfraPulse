// ==============================================================================
// InfraPulse - Infrastructure Drift & Baseline Governance Repository
// Phase 23G: Desired-State Baselines, State Snapshots, Drift Events & Reconciliations
// ==============================================================================

import crypto from 'crypto';
import { query, withTransaction } from '../db/connection.js';

function _hydrateBaseline(row) {
  if (!row) return null;
  const b = { ...row };
  b.resources = typeof b.resource_configurations === 'string'
    ? JSON.parse(b.resource_configurations || '{}')
    : (b.resource_configurations || {});
  return b;
}

function _hydrateDrift(drift) {
  if (!drift) return null;
  const d = { ...drift };
  const exp = typeof d.expected_configuration === 'string'
    ? JSON.parse(d.expected_configuration || '{}')
    : (d.expected_configuration || {});
  const act = typeof d.actual_configuration === 'string'
    ? JSON.parse(d.actual_configuration || '{}')
    : (d.actual_configuration || {});

  d.expected_state = exp.state || (d.drift_type?.toUpperCase() === 'UNEXPECTED_ADDITION' ? 'not_present' : 'running');
  d.actual_state = act.state || act.status || (d.drift_type?.toUpperCase() === 'MISSING_RESOURCE' ? 'missing' : (act.current_state || 'running'));
  d.expected_hash = exp.hash || exp.configuration_hash || 'BASELINE';
  d.actual_hash = act.hash || act.configuration_hash || (d.actual_state === 'missing' ? 'MISSING' : 'ACTUAL');
  d.reconciled_at = d.resolved_at;
  return d;
}

export const driftGovernanceRepository = {
  // --------------------------------------------------------------------------
  // 1. Desired-State Baselines
  // --------------------------------------------------------------------------

  async createBaseline(data, client = null) {
    const q = client ? client.query.bind(client) : query;
    const baselineId = data.id || `base_${crypto.randomBytes(6).toString('hex')}`;
    const resourcesObj = data.resourceConfigurations || data.resource_configurations || data.resources || {};
    const configHash = data.configurationHash || data.configuration_hash || crypto.createHash('sha256').update(JSON.stringify(resourcesObj)).digest('hex');

    const res = await q(
      `INSERT INTO cloud_desired_state_baselines (
        id, tenant_id, organization_id, environment, name, version,
        is_active, resource_configurations, configuration_hash, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;`,
      [
        baselineId,
        data.tenantId || data.tenant_id || 'default_tenant',
        data.organizationId || data.organization_id || 'default_tenant',
        data.environment || 'staging',
        data.name || 'Baseline',
        data.version || 1,
        data.isActive !== undefined ? data.isActive : true,
        JSON.stringify(resourcesObj),
        configHash,
        data.createdBy || data.created_by || 'system'
      ]
    );
    return _hydrateBaseline(res.rows[0]);
  },

  async getActiveBaseline(environment = 'staging', tenantId = 'default_tenant') {
    const res = await query(
      `SELECT * FROM cloud_desired_state_baselines
       WHERE (tenant_id = $1 OR organization_id = $1)
         AND environment = $2
         AND is_active = true
       ORDER BY version DESC
       LIMIT 1;`,
      [tenantId, environment]
    );
    return _hydrateBaseline(res.rows[0]);
  },

  async getBaselineById(id) {
    const res = await query(
      `SELECT * FROM cloud_desired_state_baselines WHERE id = $1;`,
      [id]
    );
    return _hydrateBaseline(res.rows[0]);
  },

  async getBaselineHistory(environment = 'staging', tenantId = 'default_tenant', limit = 20) {
    const res = await query(
      `SELECT * FROM cloud_desired_state_baselines
       WHERE (tenant_id = $1 OR organization_id = $1)
         AND environment = $2
       ORDER BY version DESC, created_at DESC
       LIMIT $3;`,
      [tenantId, environment, limit]
    );
    return res.rows.map(_hydrateBaseline);
  },

  async deactivateBaselinesForEnv(environment, tenantId = 'default_tenant', client = null) {
    const q = client ? client.query.bind(client) : query;
    await q(
      `UPDATE cloud_desired_state_baselines
       SET is_active = false, updated_at = NOW()
       WHERE (tenant_id = $1 OR organization_id = $1)
         AND environment = $2;`,
      [tenantId, environment]
    );
  },

  // --------------------------------------------------------------------------
  // 2. Infrastructure State Snapshots
  // --------------------------------------------------------------------------

  async createSnapshot(data, client = null) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(
      `INSERT INTO cloud_state_snapshots (
        id, tenant_id, organization_id, environment, provider, resource_type,
        resource_id, resource_configuration, configuration_hash, snapshot_version,
        collection_status, source_provider, observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;`,
      [
        data.id,
        data.tenantId || data.tenant_id || 'default_tenant',
        data.organizationId || data.organization_id || 'default_tenant',
        data.environment || 'staging',
        data.provider,
        data.resourceType || data.resource_type,
        data.resourceId || data.resource_id,
        JSON.stringify(data.resourceConfiguration || data.resource_configuration || {}),
        data.configurationHash || data.configuration_hash,
        data.snapshotVersion || data.snapshot_version || 1,
        data.collectionStatus || data.collection_status || 'success',
        data.sourceProvider || data.source_provider || data.provider,
        data.observedAt || data.observed_at || new Date().toISOString()
      ]
    );
    return res.rows[0];
  },

  async getLatestSnapshots(environment = 'staging', tenantId = 'default_tenant') {
    const res = await query(
      `SELECT DISTINCT ON (resource_id) *
       FROM cloud_state_snapshots
       WHERE (tenant_id = $1 OR organization_id = $1)
         AND environment = $2
       ORDER BY resource_id, observed_at DESC;`,
      [tenantId, environment]
    );
    return res.rows;
  },

  async getLatestSnapshotForResource(resourceId) {
    const res = await query(
      `SELECT * FROM cloud_state_snapshots
       WHERE resource_id = $1
       ORDER BY observed_at DESC
       LIMIT 1;`,
      [resourceId]
    );
    return res.rows[0] || null;
  },

  async getResourceSnapshotHistory(resourceId, limit = 20) {
    const res = await query(
      `SELECT * FROM cloud_state_snapshots
       WHERE resource_id = $1
       ORDER BY observed_at DESC
       LIMIT $2;`,
      [resourceId, limit]
    );
    return res.rows;
  },

  // --------------------------------------------------------------------------
  // 3. Infrastructure Drift Events
  // --------------------------------------------------------------------------

  async createDriftEvent(data, client = null) {
    const q = client ? client.query.bind(client) : query;
    const driftId = data.id || `drift_${crypto.randomBytes(6).toString('hex')}`;
    const res = await q(
      `INSERT INTO cloud_drift_events (
        id, tenant_id, organization_id, environment, resource_id, resource_name,
        provider, resource_type, drift_type, status, severity, severity_reason,
        severity_evidence, expected_configuration, actual_configuration, changed_fields,
        dependency_impact, baseline_id, baseline_version, snapshot_id, observation_count,
        first_detected_at, last_observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *;`,
      [
        driftId,
        data.tenantId || data.tenant_id || 'default_tenant',
        data.organizationId || data.organization_id || 'default_tenant',
        data.environment || 'staging',
        data.resourceId || data.resource_id,
        data.resourceName || data.resource_name,
        data.provider,
        data.resourceType || data.resource_type,
        data.driftType || data.drift_type,
        data.status || 'detected',
        data.severity || 'medium',
        data.severityReason || data.severity_reason || null,
        JSON.stringify(data.severityEvidence || data.severity_evidence || {}),
        JSON.stringify(data.expectedConfiguration || data.expected_configuration || {}),
        JSON.stringify(data.actualConfiguration || data.actual_configuration || {}),
        JSON.stringify(data.changedFields || data.changed_fields || []),
        JSON.stringify(data.dependencyImpact || data.dependency_impact || {}),
        data.baselineId || data.baseline_id || null,
        data.baselineVersion || data.baseline_version || null,
        data.snapshotId || data.snapshot_id || null,
        data.observationCount || data.observation_count || 1,
        data.firstDetectedAt || data.first_detected_at || new Date().toISOString(),
        data.lastObservedAt || data.last_observed_at || new Date().toISOString()
      ]
    );
    return _hydrateDrift(res.rows[0]);
  },

  async recordDriftEvent(data, client = null) {
    return this.createDriftEvent(data, client);
  },

  async findActiveDriftByResourceAndType(environment, resourceId, driftType, tenantId = 'default_tenant') {
    const res = await query(
      `SELECT * FROM cloud_drift_events
       WHERE (tenant_id = $1 OR organization_id = $1)
         AND environment = $2
         AND resource_id = $3
         AND UPPER(drift_type) = UPPER($4)
         AND status IN ('detected', 'acknowledged', 'reconciling')
       ORDER BY first_detected_at DESC
       LIMIT 1;`,
      [tenantId, environment, resourceId, driftType]
    );
    return _hydrateDrift(res.rows[0]);
  },

  async updateDriftObservation(driftId, { actualConfiguration, changedFields, severity, severityReason, severityEvidence, client = null } = {}) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(
      `UPDATE cloud_drift_events
       SET observation_count = observation_count + 1,
           last_observed_at = NOW(),
           actual_configuration = COALESCE($2, actual_configuration),
           changed_fields = COALESCE($3, changed_fields),
           severity = COALESCE($4, severity),
           severity_reason = COALESCE($5, severity_reason),
           severity_evidence = COALESCE($6, severity_evidence)
       WHERE id = $1
       RETURNING *;`,
      [
        driftId,
        actualConfiguration ? JSON.stringify(actualConfiguration) : null,
        changedFields ? JSON.stringify(changedFields) : null,
        severity || null,
        severityReason || null,
        severityEvidence ? JSON.stringify(severityEvidence) : null
      ]
    );
    return _hydrateDrift(res.rows[0]);
  },

  async updateDriftStatus(driftId, status, { resolvedBy = null, resolutionDetails = null, client = null } = {}) {
    const q = client ? client.query.bind(client) : query;
    const isResolved = status === 'reconciled' || status === 'ignored';
    const res = await q(
      `UPDATE cloud_drift_events
       SET status = $2,
           resolved_at = CASE WHEN $3 = true THEN NOW() ELSE resolved_at END,
           resolved_by = CASE WHEN $3 = true THEN $4 ELSE resolved_by END
       WHERE id = $1
       RETURNING *;`,
      [driftId, status, isResolved, resolvedBy]
    );
    return _hydrateDrift(res.rows[0]);
  },

  async getDriftById(id) {
    const res = await query(
      `SELECT * FROM cloud_drift_events WHERE id = $1;`,
      [id]
    );
    return _hydrateDrift(res.rows[0]);
  },

  async getAllDriftEvents({ environment, status, severity, provider, resourceId, tenantId = 'default_tenant', limit = 100 } = {}) {
    const conditions = [`(tenant_id = $1 OR organization_id = $1)`];
    const params = [tenantId];
    let idx = 2;

    if (environment) {
      conditions.push(`environment = $${idx++}`);
      params.push(environment);
    }
    if (status && status !== 'all') {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (severity && severity !== 'all') {
      conditions.push(`severity = $${idx++}`);
      params.push(severity);
    }
    if (provider && provider !== 'all') {
      conditions.push(`provider = $${idx++}`);
      params.push(provider);
    }
    if (resourceId) {
      conditions.push(`resource_id = $${idx++}`);
      params.push(resourceId);
    }

    params.push(limit);
    const sql = `
      SELECT * FROM cloud_drift_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        last_observed_at DESC
      LIMIT $${idx};
    `;

    const res = await query(sql, params);
    return res.rows.map(_hydrateDrift);
  },

  async listDriftEvents(options) {
    return this.getAllDriftEvents(options);
  },

  async getDriftStatistics(environment = null, tenantId = 'default_tenant') {
    const envFilter = environment ? `AND environment = $2` : '';
    const params = environment ? [tenantId, environment] : [tenantId];

    const res = await query(
      `SELECT
         COUNT(*)::int AS total_drifts,
         COUNT(*) FILTER (WHERE status = 'detected')::int AS active_unresolved,
         COUNT(*) FILTER (WHERE status = 'reconciled')::int AS reconciled,
         COUNT(*) FILTER (WHERE status = 'ignored')::int AS ignored,
         COUNT(*) FILTER (WHERE severity = 'critical' AND status != 'reconciled')::int AS critical_count,
         COUNT(*) FILTER (WHERE severity = 'high' AND status != 'reconciled')::int AS high_count,
         COUNT(*) FILTER (WHERE severity = 'medium' AND status != 'reconciled')::int AS medium_count,
         COUNT(*) FILTER (WHERE severity = 'low' AND status != 'reconciled')::int AS low_count,
         COUNT(DISTINCT resource_id) FILTER (WHERE status != 'reconciled')::int AS affected_resources_count
       FROM cloud_drift_events
       WHERE (tenant_id = $1 OR organization_id = $1)
       ${envFilter};`,
      params
    );
    return res.rows[0];
  },

  // --------------------------------------------------------------------------
  // 4. Drift Reconciliation Plans
  // --------------------------------------------------------------------------

  async createReconciliationPlan(data, client = null) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(
      `INSERT INTO cloud_reconciliation_plans (
        id, tenant_id, organization_id, environment, drift_id, resource_id,
        status, proposed_actions, field_diffs, affected_dependencies,
        risk_assessment, eligibility_result, operation_id, requested_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;`,
      [
        data.id,
        data.tenantId || data.tenant_id || 'default_tenant',
        data.organizationId || data.organization_id || 'default_tenant',
        data.environment || 'staging',
        data.driftId || data.drift_id,
        data.resourceId || data.resource_id,
        data.status || 'preview',
        JSON.stringify(data.proposedActions || data.proposed_actions || []),
        JSON.stringify(data.fieldDiffs || data.field_diffs || []),
        JSON.stringify(data.affectedDependencies || data.affected_dependencies || []),
        JSON.stringify(data.riskAssessment || data.risk_assessment || {}),
        JSON.stringify(data.eligibilityResult || data.eligibility_result || {}),
        data.operationId || data.operation_id || null,
        data.requestedBy || data.requested_by || null
      ]
    );
    return res.rows[0];
  },

  async getReconciliationPlanById(id) {
    const res = await query(
      `SELECT * FROM cloud_reconciliation_plans WHERE id = $1;`,
      [id]
    );
    return res.rows[0] || null;
  },

  async getReconciliationPlansByDriftId(driftId) {
    const res = await query(
      `SELECT * FROM cloud_reconciliation_plans
       WHERE drift_id = $1
       ORDER BY created_at DESC;`,
      [driftId]
    );
    return res.rows;
  },

  async updateReconciliationPlanStatus(id, status, { operationId = null, approvedBy = null, executionResult = null, client = null } = {}) {
    const q = client ? client.query.bind(client) : query;
    const isCompleted = status === 'completed' || status === 'failed';
    const res = await q(
      `UPDATE cloud_reconciliation_plans
       SET status = $2,
           operation_id = COALESCE($3, operation_id),
           approved_by = COALESCE($4, approved_by),
           executed_at = CASE WHEN $5 = true THEN NOW() ELSE executed_at END,
           execution_result = COALESCE($6, execution_result)
       WHERE id = $1
       RETURNING *;`,
      [
        id,
        status,
        operationId,
        approvedBy,
        isCompleted,
        executionResult ? JSON.stringify(executionResult) : null
      ]
    );
    return res.rows[0] || null;
  }
};
