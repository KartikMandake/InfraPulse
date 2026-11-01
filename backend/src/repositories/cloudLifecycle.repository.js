// ==============================================================================
// InfraPulse - Cloud Lifecycle Repository
// PostgreSQL persistence for resources, operations, schedules & cost estimates
// ==============================================================================

import { query } from '../db/connection.js';

export const cloudLifecycleRepository = {
  // Resources
  async getAllResources({ provider, environment, currentState } = {}) {
    let sql = 'SELECT * FROM cloud_resources WHERE 1=1';
    const params = [];

    if (provider) {
      params.push(provider);
      sql += ` AND provider = $${params.length}`;
    }
    if (environment) {
      params.push(environment);
      sql += ` AND environment = $${params.length}`;
    }
    if (currentState) {
      params.push(currentState);
      sql += ` AND current_state = $${params.length}`;
    }

    sql += ' ORDER BY provider ASC, name ASC;';
    const res = await query(sql, params);
    return res.rows;
  },

  async getResourceById(id) {
    const res = await query('SELECT * FROM cloud_resources WHERE id = $1;', [id]);
    return res.rows[0] || null;
  },

  async updateResourceState(id, newState, operationType = null) {
    const res = await query(
      `UPDATE cloud_resources
       SET current_state = $1,
           last_lifecycle_operation = COALESCE($2, last_lifecycle_operation),
           last_operation_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *;`,
      [newState, operationType, id]
    );
    return res.rows[0] || null;
  },

  async updateResourceHealth(id, healthStatus) {
    const res = await query(
      `UPDATE cloud_resources
       SET last_health_check_status = $1,
           last_health_check_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *;`,
      [healthStatus, id]
    );
    return res.rows[0] || null;
  },

  async upsertResource(resData) {
    const res = await query(
      `INSERT INTO cloud_resources (
         id, name, provider, resource_type, region, environment, current_state,
         estimated_hourly_cost, cost_breakdown, dependencies, persistence_requirements,
         is_critical_dependency, metadata, last_lifecycle_operation, last_health_check_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         current_state = EXCLUDED.current_state,
         estimated_hourly_cost = EXCLUDED.estimated_hourly_cost,
         cost_breakdown = EXCLUDED.cost_breakdown,
         dependencies = EXCLUDED.dependencies,
         persistence_requirements = EXCLUDED.persistence_requirements,
         is_critical_dependency = EXCLUDED.is_critical_dependency,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING *;`,
      [
        resData.id,
        resData.name,
        resData.provider,
        resData.resource_type,
        resData.region || 'ap-south-1',
        resData.environment || 'staging',
        resData.current_state || 'running',
        resData.estimated_hourly_cost || 0.0,
        JSON.stringify(resData.cost_breakdown || {}),
        JSON.stringify(resData.dependencies || []),
        JSON.stringify(resData.persistence_requirements || {}),
        resData.is_critical_dependency || false,
        JSON.stringify(resData.metadata || {}),
        resData.last_lifecycle_operation || null,
        resData.last_health_check_status || 'healthy'
      ]
    );
    return res.rows[0];
  },

  // Operations
  async createOperation(opData) {
    const res = await query(
      `INSERT INTO cloud_lifecycle_operations (
         id, resource_id, action, status, is_dry_run, safety_checks,
         requested_by, requester_role, idempotency_key, rejection_reason, execution_logs
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *;`,
      [
        opData.id,
        opData.resource_id,
        opData.action,
        opData.status || 'pending_approval',
        opData.is_dry_run || false,
        JSON.stringify(opData.safety_checks || {}),
        opData.requested_by,
        opData.requester_role || 'viewer',
        opData.idempotency_key || null,
        opData.rejection_reason || null,
        JSON.stringify(opData.execution_logs || [])
      ]
    );
    return res.rows[0];
  },

  async getOperationById(id) {
    const res = await query('SELECT * FROM cloud_lifecycle_operations WHERE id = $1;', [id]);
    return res.rows[0] || null;
  },

  async getOperationByIdempotencyKey(key) {
    if (!key) return null;
    const res = await query('SELECT * FROM cloud_lifecycle_operations WHERE idempotency_key = $1;', [key]);
    return res.rows[0] || null;
  },

  async getActiveOperationOnResource(resourceId) {
    const res = await query(
      `SELECT * FROM cloud_lifecycle_operations
       WHERE resource_id = $1
         AND is_dry_run = false
         AND status IN ('pending_approval', 'approved', 'executing')
       LIMIT 1;`,
      [resourceId]
    );
    return res.rows[0] || null;
  },

  async getAllOperations({ resourceId, status, limit = 50 } = {}) {
    let sql = `
      SELECT o.*, r.name as resource_name, r.provider, r.resource_type
      FROM cloud_lifecycle_operations o
      LEFT JOIN cloud_resources r ON o.resource_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (resourceId) {
      params.push(resourceId);
      sql += ` AND o.resource_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND o.status = $${params.length}`;
    }

    params.push(limit);
    sql += ` ORDER BY o.created_at DESC LIMIT $${params.length};`;

    const res = await query(sql, params);
    return res.rows;
  },

  async updateOperationStatus(id, { status, approved_by, approved_at, executed_at, completed_at, rejection_reason, execution_logs }) {
    const updates = [];
    const params = [id];

    if (status !== undefined) {
      params.push(status);
      updates.push(`status = $${params.length}`);
    }
    if (approved_by !== undefined) {
      params.push(approved_by);
      updates.push(`approved_by = $${params.length}`);
    }
    if (approved_at !== undefined) {
      params.push(approved_at);
      updates.push(`approved_at = $${params.length}`);
    }
    if (executed_at !== undefined) {
      params.push(executed_at);
      updates.push(`executed_at = $${params.length}`);
    }
    if (completed_at !== undefined) {
      params.push(completed_at);
      updates.push(`completed_at = $${params.length}`);
    }
    if (rejection_reason !== undefined) {
      params.push(rejection_reason);
      updates.push(`rejection_reason = $${params.length}`);
    }
    if (execution_logs !== undefined) {
      params.push(JSON.stringify(execution_logs));
      updates.push(`execution_logs = $${params.length}`);
    }

    if (updates.length === 0) return this.getOperationById(id);

    const sql = `UPDATE cloud_lifecycle_operations SET ${updates.join(', ')} WHERE id = $1 RETURNING *;`;
    const res = await query(sql, params);
    return res.rows[0] || null;
  },

  // Schedules
  async getAllSchedules() {
    const res = await query(
      `SELECT s.*, r.name as resource_name, r.provider, r.current_state
       FROM cloud_schedules s
       LEFT JOIN cloud_resources r ON s.resource_id = r.id
       ORDER BY s.created_at DESC;`
    );
    return res.rows;
  },

  async getScheduleById(id) {
    const res = await query('SELECT * FROM cloud_schedules WHERE id = $1;', [id]);
    return res.rows[0] || null;
  },

  async upsertSchedule(schedData) {
    const res = await query(
      `INSERT INTO cloud_schedules (
         id, resource_id, name, action, cron_expression, timezone,
         enabled, is_paused, days_of_week, time_of_day, missed_execution_recovery, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         action = EXCLUDED.action,
         cron_expression = EXCLUDED.cron_expression,
         timezone = EXCLUDED.timezone,
         enabled = EXCLUDED.enabled,
         is_paused = EXCLUDED.is_paused,
         days_of_week = EXCLUDED.days_of_week,
         time_of_day = EXCLUDED.time_of_day,
         missed_execution_recovery = EXCLUDED.missed_execution_recovery,
         updated_at = NOW()
       RETURNING *;`,
      [
        schedData.id,
        schedData.resource_id,
        schedData.name,
        schedData.action,
        schedData.cron_expression,
        schedData.timezone || 'Asia/Kolkata',
        schedData.enabled !== false,
        schedData.is_paused || false,
        JSON.stringify(schedData.days_of_week || [1, 2, 3, 4, 5]),
        schedData.time_of_day || '20:00',
        schedData.missed_execution_recovery !== false,
        schedData.created_by
      ]
    );
    return res.rows[0];
  },

  async updateSchedule(id, updates) {
    const fields = [];
    const params = [id];

    if (updates.enabled !== undefined) {
      params.push(updates.enabled);
      fields.push(`enabled = $${params.length}`);
    }
    if (updates.is_paused !== undefined) {
      params.push(updates.is_paused);
      fields.push(`is_paused = $${params.length}`);
    }
    if (updates.last_run_at !== undefined) {
      params.push(updates.last_run_at);
      fields.push(`last_run_at = $${params.length}`);
    }
    if (updates.next_run_at !== undefined) {
      params.push(updates.next_run_at);
      fields.push(`next_run_at = $${params.length}`);
    }

    fields.push('updated_at = NOW()');
    const sql = `UPDATE cloud_schedules SET ${fields.join(', ')} WHERE id = $1 RETURNING *;`;
    const res = await query(sql, params);
    return res.rows[0] || null;
  },

  // Cost estimates
  async saveCostEstimate(estimateData) {
    const res = await query(
      `INSERT INTO cloud_cost_estimates (
         id, environment, total_hourly_compute, total_hourly_storage, total_hourly_ipv4,
         total_hourly_networking, total_hourly_managed, estimated_daily_total,
         estimated_monthly_total, estimated_monthly_savings, ongoing_monthly_storage_cost,
         currency, is_simulated
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *;`,
      [
        estimateData.id,
        estimateData.environment,
        estimateData.total_hourly_compute,
        estimateData.total_hourly_storage,
        estimateData.total_hourly_ipv4,
        estimateData.total_hourly_networking,
        estimateData.total_hourly_managed,
        estimateData.estimated_daily_total,
        estimateData.estimated_monthly_total,
        estimateData.estimated_monthly_savings,
        estimateData.ongoing_monthly_storage_cost,
        estimateData.currency || 'USD',
        estimateData.is_simulated !== false
      ]
    );
    return res.rows[0];
  },

  async getLatestCostEstimate(environment = 'staging') {
    const res = await query(
      `SELECT * FROM cloud_cost_estimates
       WHERE environment = $1
       ORDER BY calculated_at DESC
       LIMIT 1;`,
      [environment]
    );
    return res.rows[0] || null;
  }
};

