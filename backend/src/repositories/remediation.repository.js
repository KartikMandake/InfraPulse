/**
 * Governed Infrastructure Remediation Repository — InfraPulse Phase 23J
 *
 * PostgreSQL persistence layer for:
 * - Remediation policy rules
 * - Remediation recommendations
 * - Immutable versioned remediation plans
 * - Multi-party approvals & separation of duties
 * - Execution lifecycle & post-action verification
 * - Execution audit events
 */

import crypto from 'crypto';
import { query } from '../db/connection.js';
import {remediationPlanHash} from '../security/planIntegrity.js';

export const remediationRepository = {
  // ===========================================================================
  // 1. Policy Rules
  // ===========================================================================
  async createPolicyRule(data) {
    const id = data.id || `pol_${crypto.randomBytes(6).toString('hex')}`;
    const sql = `
      INSERT INTO remediation_policy_rules (
        id, tenant_id, environment, provider, resource_type,
        allowed_actions, denied_actions, max_risk_level,
        requires_two_person_approval, execution_window_start,
        execution_window_end, cooldown_minutes, max_retries, enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `;
    const params = [
      id,
      data.tenantId || 'default_tenant',
      data.environment || 'staging',
      data.provider || 'all',
      data.resourceType || 'all',
      JSON.stringify(data.allowedActions || []),
      JSON.stringify(data.deniedActions || []),
      data.maxRiskLevel || 'HIGH',
      data.requiresTwoPersonApproval !== false,
      data.executionWindowStart || '00:00',
      data.executionWindowEnd || '23:59',
      data.cooldownMinutes ?? 15,
      data.maxRetries ?? 1,
      data.enabled !== false
    ];
    const res = await query(sql, params);
    return res.rows[0];
  },

  async listPolicyRules(tenantId = 'default_tenant', { environment = null, provider = null, enabled = null } = {}) {
    let sql = 'SELECT * FROM remediation_policy_rules WHERE tenant_id = $1';
    const params = [tenantId];
    if (environment) {
      params.push(environment);
      sql += ` AND (environment = $${params.length} OR environment = 'all')`;
    }
    if (provider) {
      params.push(provider);
      sql += ` AND (provider = $${params.length} OR provider = 'all')`;
    }
    if (enabled !== null) {
      params.push(enabled);
      sql += ` AND enabled = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC;';
    const res = await query(sql, params);
    return res.rows;
  },

  async getPolicyRuleById(id, tenantId = 'default_tenant') {
    const res = await query(
      'SELECT * FROM remediation_policy_rules WHERE id = $1 AND tenant_id = $2;',
      [id, tenantId]
    );
    return res.rows[0] || null;
  },

  // ===========================================================================
  // 2. Recommendations
  // ===========================================================================
  async createRecommendation(data) {
    const id = data.id || `rem_rec_${crypto.randomBytes(6).toString('hex')}`;
    const sql = `
      INSERT INTO remediation_recommendations (
        id, incident_id, tenant_id, environment, service_id, resource_id,
        detected_problem, proposed_action, expected_outcome, supporting_evidence,
        risk_level, risk_score, risk_rationale, confidence_score,
        blast_radius, eligibility_result, blocking_reasons, rollback_strategy, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *;
    `;
    const params = [
      id,
      data.incidentId,
      data.tenantId || 'default_tenant',
      data.environment || 'staging',
      data.serviceId,
      data.resourceId,
      data.detectedProblem,
      data.proposedAction,
      data.expectedOutcome,
      JSON.stringify(data.supportingEvidence || []),
      data.riskLevel || 'LOW',
      data.riskScore ?? 20,
      data.riskRationale || '',
      data.confidenceScore ?? 0.85,
      JSON.stringify(data.blastRadius || {}),
      JSON.stringify(data.eligibilityResult || {}),
      JSON.stringify(data.blockingReasons || []),
      JSON.stringify(data.rollbackStrategy || {}),
      data.status || 'PENDING'
    ];
    const res = await query(sql, params);
    return res.rows[0];
  },

  async getRecommendationById(id, tenantId = 'default_tenant') {
    const res = await query(
      'SELECT * FROM remediation_recommendations WHERE id = $1 AND tenant_id = $2;',
      [id, tenantId]
    );
    return res.rows[0] || null;
  },

  async listRecommendations(tenantId = 'default_tenant', { incidentId = null, environment = null, status = null, limit = 50 } = {}) {
    let sql = 'SELECT * FROM remediation_recommendations WHERE tenant_id = $1';
    const params = [tenantId];
    if (incidentId) {
      params.push(incidentId);
      sql += ` AND incident_id = $${params.length}`;
    }
    if (environment) {
      params.push(environment);
      sql += ` AND environment = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT ${Number(limit) || 50};`;
    const res = await query(sql, params);
    return res.rows;
  },

  async updateRecommendationStatus(id, status, tenantId = 'default_tenant') {
    const res = await query(
      `UPDATE remediation_recommendations
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *;`,
      [status, id, tenantId]
    );
    return res.rows[0] || null;
  },

  // ===========================================================================
  // 3. Versioned Plans
  // ===========================================================================
  async createPlan(data) {
    const id = data.id || `rem_plan_${crypto.randomBytes(6).toString('hex')}`;
    const sql = `
      INSERT INTO remediation_plans (
        id, recommendation_id, tenant_id, version, action,
        target_resource_id, target_resource_name, provider,
        parameters, preconditions, verification_criteria, rollback_plan,
        plan_hash, is_current_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `;
    const params = [
      id,
      data.recommendationId,
      data.tenantId || 'default_tenant',
      data.version || 1,
      data.action,
      data.targetResourceId,
      data.targetResourceName || data.targetResourceId,
      data.provider || 'docker',
      JSON.stringify(data.parameters || {}),
      JSON.stringify(data.preconditions || []),
      JSON.stringify(data.verificationCriteria || {}),
      JSON.stringify(data.rollbackPlan || {}),
      remediationPlanHash(data),
      data.isCurrentVersion !== false
    ];
    const res = await query(sql, params);
    return res.rows[0];
  },

  async getPlanById(id, tenantId = 'default_tenant') {
    const res = await query(
      'SELECT * FROM remediation_plans WHERE id = $1 AND tenant_id = $2;',
      [id, tenantId]
    );
    return res.rows[0] || null;
  },

  async getPlanByRecommendationId(recommendationId, tenantId = 'default_tenant') {
    const res = await query(
      'SELECT * FROM remediation_plans WHERE recommendation_id = $1 AND tenant_id = $2 AND is_current_version = true ORDER BY version DESC LIMIT 1;',
      [recommendationId, tenantId]
    );
    return res.rows[0] || null;
  },

  async invalidatePreviousPlanVersions(recommendationId, tenantId = 'default_tenant') {
    await query(
      `UPDATE remediation_plans
       SET is_current_version = false
       WHERE recommendation_id = $1 AND tenant_id = $2;`,
      [recommendationId, tenantId]
    );
  },

  // ===========================================================================
  // 4. Approvals
  // ===========================================================================
  async createApproval(data) {
    const id = data.id || `rem_app_${crypto.randomBytes(6).toString('hex')}`;
    let approvedPlanHash = data.approvedPlanHash || data.approved_plan_hash || null;
    if (!approvedPlanHash && data.approvalStatus === 'APPROVED' && data.planId) {
      const plan = await this.getPlanById(data.planId, data.tenantId || 'default_tenant');
      if (plan) approvedPlanHash = plan.plan_hash;
    }
    const sql = `
      INSERT INTO infra_remediation_approvals (
        id, plan_id, plan_version, tenant_id, requester_email, requester_role,
        approver_email, approver_role, second_approver_email, second_approver_role,
        approval_status, rejection_reason, revocation_reason, requested_at,
        expires_at, approved_plan_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14, $15)
      RETURNING *;
    `;
    const params = [
      id,
      data.planId,
      data.planVersion || 1,
      data.tenantId || 'default_tenant',
      data.requesterEmail,
      data.requesterRole || 'responder',
      data.approverEmail || null,
      data.approverRole || null,
      data.secondApproverEmail || null,
      data.secondApproverRole || null,
      data.approvalStatus || 'PENDING',
      data.rejectionReason || null,
      data.revocationReason || null,
      data.expiresAt || new Date(Date.now() + 3600000).toISOString(),
      approvedPlanHash
    ];
    const res = await query(sql, params);
    return res.rows[0];
  },

  async getApprovalById(id, tenantId = 'default_tenant') {
    const res = await query(
      'SELECT * FROM infra_remediation_approvals WHERE id = $1 AND tenant_id = $2;',
      [id, tenantId]
    );
    return res.rows[0] || null;
  },

  async getApprovalByPlanId(planId, tenantId = 'default_tenant') {
    const res = await query(
      'SELECT * FROM infra_remediation_approvals WHERE plan_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1;',
      [planId, tenantId]
    );
    return res.rows[0] || null;
  },

  async updateApprovalStatus(id, updates = {}, tenantId = 'default_tenant') {
    const current = await this.getApprovalById(id, tenantId);
    if (!current) return null;

    const sql = `
      UPDATE infra_remediation_approvals
      SET
        approval_status = COALESCE($1, approval_status),
        approver_email = COALESCE($2, approver_email),
        approver_role = COALESCE($3, approver_role),
        second_approver_email = COALESCE($4, second_approver_email),
        second_approver_role = COALESCE($5, second_approver_role),
        approved_at = CASE WHEN $1 = 'APPROVED' THEN NOW() ELSE approved_at END,
        rejection_reason = COALESCE($6, rejection_reason),
        revocation_reason = COALESCE($7, revocation_reason),
        updated_at = NOW()
      WHERE id = $8 AND tenant_id = $9
      RETURNING *;
    `;
    const res = await query(sql, [
      updates.approvalStatus || null,
      updates.approverEmail || null,
      updates.approverRole || null,
      updates.secondApproverEmail || null,
      updates.secondApproverRole || null,
      updates.rejectionReason || null,
      updates.revocationReason || null,
      id,
      tenantId
    ]);
    return res.rows[0];
  },

  // ===========================================================================
  // 5. Executions
  // ===========================================================================
  async createExecution(data) {
    const id = data.id || `rem_exec_${crypto.randomBytes(6).toString('hex')}`;
    const sql = `
      INSERT INTO remediation_executions (
        id, plan_id, approval_id, tenant_id, environment, resource_id,
        idempotency_key, status, is_dry_run, executed_by, pre_execution_state,
        post_execution_state, provider_response, started_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *;
    `;
    const params = [
      id,
      data.planId,
      data.approvalId || null,
      data.tenantId || 'default_tenant',
      data.environment || 'staging',
      data.resourceId,
      data.idempotencyKey,
      data.status || 'EXECUTING',
      data.isDryRun === true,
      data.executedBy || 'system',
      JSON.stringify(data.preExecutionState || {}),
      JSON.stringify(data.postExecutionState || {}),
      JSON.stringify(data.providerResponse || {})
    ];
    const res = await query(sql, params);
    return res.rows[0];
  },

  async getExecutionById(id, tenantId = 'default_tenant') {
    const res = await query(
      'SELECT * FROM remediation_executions WHERE id = $1 AND tenant_id = $2;',
      [id, tenantId]
    );
    return res.rows[0] || null;
  },

  async getExecutionByIdempotencyKey(key, tenantId = 'default_tenant') {
    if (!key) return null;
    const res = await query(
      'SELECT * FROM remediation_executions WHERE idempotency_key = $1 AND tenant_id = $2;',
      [key, tenantId]
    );
    return res.rows[0] || null;
  },

  async getActiveExecutionOnResource(resourceId, tenantId = 'default_tenant') {
    const res = await query(
      `SELECT * FROM remediation_executions
       WHERE resource_id = $1 AND tenant_id = $2 AND status = 'EXECUTING'
       ORDER BY started_at DESC LIMIT 1;`,
      [resourceId, tenantId]
    );
    return res.rows[0] || null;
  },

  async updateExecution(id, updates = {}, tenantId = 'default_tenant') {
    const sql = `
      UPDATE remediation_executions
      SET
        status = COALESCE($1, status),
        post_execution_state = COALESCE($2, post_execution_state),
        provider_response = COALESCE($3, provider_response),
        verification_result = COALESCE($4, verification_result),
        verification_details = COALESCE($5, verification_details),
        rollback_executed = COALESCE($6, rollback_executed),
        rollback_result = COALESCE($7, rollback_result),
        error_message = COALESCE($8, error_message),
        completed_at = CASE WHEN $1 IN ('COMPLETED', 'FAILED', 'ROLLED_BACK') THEN NOW() ELSE completed_at END,
        duration_ms = CASE WHEN $1 IN ('COMPLETED', 'FAILED', 'ROLLED_BACK') THEN EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000 ELSE duration_ms END
      WHERE id = $9 AND tenant_id = $10
      RETURNING *;
    `;
    const res = await query(sql, [
      updates.status || null,
      updates.postExecutionState ? JSON.stringify(updates.postExecutionState) : null,
      updates.providerResponse ? JSON.stringify(updates.providerResponse) : null,
      updates.verificationResult || null,
      updates.verificationDetails ? JSON.stringify(updates.verificationDetails) : null,
      updates.rollbackExecuted !== undefined ? updates.rollbackExecuted : null,
      updates.rollbackResult ? JSON.stringify(updates.rollbackResult) : null,
      updates.errorMessage || null,
      id,
      tenantId
    ]);
    return res.rows[0];
  },

  async listExecutions(tenantId = 'default_tenant', { environment = null, status = null, resourceId = null, limit = 50 } = {}) {
    let sql = 'SELECT * FROM remediation_executions WHERE tenant_id = $1';
    const params = [tenantId];
    if (environment) {
      params.push(environment);
      sql += ` AND environment = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (resourceId) {
      params.push(resourceId);
      sql += ` AND resource_id = $${params.length}`;
    }
    sql += ` ORDER BY started_at DESC LIMIT ${Number(limit) || 50};`;
    const res = await query(sql, params);
    return res.rows;
  },

  // ===========================================================================
  // 6. Audit Events
  // ===========================================================================
  async recordExecutionEvent(data) {
    const id = data.id || `rem_evt_${crypto.randomBytes(6).toString('hex')}`;
    const sql = `
      INSERT INTO remediation_execution_events (
        id, execution_id, tenant_id, event_type, severity, message, details, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *;
    `;
    const params = [
      id,
      data.executionId,
      data.tenantId || 'default_tenant',
      data.eventType,
      data.severity || 'info',
      data.message,
      JSON.stringify(data.details || {})
    ];
    const res = await query(sql, params);
    return res.rows[0];
  },

  async listExecutionEvents(executionId, tenantId = 'default_tenant') {
    const res = await query(
      `SELECT * FROM remediation_execution_events
       WHERE execution_id = $1 AND tenant_id = $2
       ORDER BY timestamp ASC;`,
      [executionId, tenantId]
    );
    return res.rows;
  }
};

