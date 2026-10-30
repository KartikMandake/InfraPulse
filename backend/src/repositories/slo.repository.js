import { query } from '../db/connection.js';

function mapSloRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    serviceId: row.service_id,
    sliType: row.sli_type,
    sliDefinition: row.sli_definition,
    targetPercent: Number(row.target_percent),
    latencyThresholdMs: row.latency_threshold_ms !== null ? Number(row.latency_threshold_ms) : null,
    rollingWindowDays: Number(row.rolling_window_days),
    evaluationIntervalMinutes: Number(row.evaluation_interval_minutes),
    owner: row.owner,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEvaluationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sloId: row.slo_id,
    evaluatedAt: row.evaluated_at,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    totalEvents: Number(row.total_events),
    goodEvents: Number(row.good_events),
    badEvents: Number(row.bad_events),
    sliValue: row.sli_value !== null ? Number(row.sli_value) : null,
    targetPercent: Number(row.target_percent),
    errorBudgetPercent: Number(row.error_budget_percent),
    allowedBadEvents: Number(row.allowed_bad_events),
    remainingBudgetPercent: Number(row.remaining_budget_percent),
    budgetConsumedPercent: Number(row.budget_consumed_percent),
    burnRate1h: Number(row.burn_rate_1h || 0),
    burnRate6h: Number(row.burn_rate_6h || 0),
    burnRate24h: Number(row.burn_rate_24h || 0),
    status: row.status,
    dataQuality: row.data_quality,
    isSimulated: Boolean(row.is_simulated),
    telemetrySource: row.telemetry_source
  };
}

function mapHistoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sloId: row.slo_id,
    timestamp: row.timestamp,
    budgetRemainingPercent: Number(row.budget_remaining_percent),
    burnRate: Number(row.burn_rate),
    badEventsDelta: Number(row.bad_events_delta)
  };
}

function mapPolicyRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sloId: row.slo_id,
    fastBurnThreshold: Number(row.fast_burn_threshold),
    slowBurnThreshold: Number(row.slow_burn_threshold),
    exhaustionThreshold: Number(row.exhaustion_threshold),
    minEventsRequired: Number(row.min_events_required),
    cooldownMinutes: Number(row.cooldown_minutes),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at
  };
}

function mapAlertEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sloId: row.slo_id,
    policyId: row.policy_id,
    incidentId: row.incident_id,
    alertType: row.alert_type,
    severity: row.severity,
    burnRate: Number(row.burn_rate),
    budgetRemainingPercent: Number(row.budget_remaining_percent),
    triggeredAt: row.triggered_at,
    resolvedAt: row.resolved_at,
    status: row.status,
    message: row.message
  };
}

function mapSnapshotRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    serviceId: row.service_id,
    calculatedAt: row.calculated_at,
    reliabilityScore: Number(row.reliability_score),
    status: row.status,
    trendDirection: row.trend_direction,
    contributingFactors: typeof row.contributing_factors === 'string' ? JSON.parse(row.contributing_factors) : (row.contributing_factors || []),
    recommendations: typeof row.recommendations === 'string' ? JSON.parse(row.recommendations) : (row.recommendations || []),
    dataQuality: row.data_quality,
    slosEvaluatedCount: Number(row.slos_evaluated_count),
    slosBreachedCount: Number(row.slos_breached_count),
    totalBudgetConsumedPercent: Number(row.total_budget_consumed_percent)
  };
}

export async function findAllSlos(filters = {}, client = null) {
  const q = client ? client.query.bind(client) : query;
  let sql = 'SELECT * FROM slos WHERE 1=1';
  const params = [];

  if (filters.enabled !== undefined) {
    params.push(Boolean(filters.enabled));
    sql += ` AND enabled = $${params.length}`;
  }
  if (filters.serviceId) {
    params.push(filters.serviceId);
    sql += ` AND service_id = $${params.length}`;
  }
  if (filters.sliType) {
    params.push(filters.sliType);
    sql += ` AND sli_type = $${params.length}`;
  }

  sql += ' ORDER BY name ASC;';
  const res = await q(sql, params);
  return res.rows.map(mapSloRow);
}

export async function findSloById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM slos WHERE id = $1;', [id]);
  return mapSloRow(res.rows[0]);
}

export async function createSlo(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `INSERT INTO slos (
      id, name, description, service_id, sli_type, sli_definition,
      target_percent, latency_threshold_ms, rolling_window_days,
      evaluation_interval_minutes, owner, enabled
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    RETURNING *;`,
    [
      data.id,
      data.name,
      data.description || '',
      data.serviceId,
      data.sliType,
      data.sliDefinition,
      data.targetPercent,
      data.latencyThresholdMs || null,
      data.rollingWindowDays || 30,
      data.evaluationIntervalMinutes || 5,
      data.owner || 'SRE Reliability Team',
      data.enabled !== false
    ]
  );
  return mapSloRow(res.rows[0]);
}

export async function updateSlo(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const fields = [];
  const params = [id];

  if (updates.name !== undefined) {
    params.push(updates.name);
    fields.push(`name = $${params.length}`);
  }
  if (updates.description !== undefined) {
    params.push(updates.description);
    fields.push(`description = $${params.length}`);
  }
  if (updates.serviceId !== undefined) {
    params.push(updates.serviceId);
    fields.push(`service_id = $${params.length}`);
  }
  if (updates.sliType !== undefined) {
    params.push(updates.sliType);
    fields.push(`sli_type = $${params.length}`);
  }
  if (updates.sliDefinition !== undefined) {
    params.push(updates.sliDefinition);
    fields.push(`sli_definition = $${params.length}`);
  }
  if (updates.targetPercent !== undefined) {
    params.push(updates.targetPercent);
    fields.push(`target_percent = $${params.length}`);
  }
  if (updates.latencyThresholdMs !== undefined) {
    params.push(updates.latencyThresholdMs);
    fields.push(`latency_threshold_ms = $${params.length}`);
  }
  if (updates.rollingWindowDays !== undefined) {
    params.push(updates.rollingWindowDays);
    fields.push(`rolling_window_days = $${params.length}`);
  }
  if (updates.owner !== undefined) {
    params.push(updates.owner);
    fields.push(`owner = $${params.length}`);
  }
  if (updates.enabled !== undefined) {
    params.push(Boolean(updates.enabled));
    fields.push(`enabled = $${params.length}`);
  }

  fields.push('updated_at = NOW()');

  const res = await q(
    `UPDATE slos SET ${fields.join(', ')} WHERE id = $1 RETURNING *;`,
    params
  );
  return mapSloRow(res.rows[0]);
}

export async function deleteSlo(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('DELETE FROM slos WHERE id = $1 RETURNING id;', [id]);
  return res.rowCount > 0;
}

export async function createEvaluation(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `eval-${data.sloId}-${Date.now()}`;
  const res = await q(
    `INSERT INTO slo_evaluations (
      id, slo_id, evaluated_at, window_start, window_end,
      total_events, good_events, bad_events, sli_value, target_percent,
      error_budget_percent, allowed_bad_events, remaining_budget_percent,
      budget_consumed_percent, burn_rate_1h, burn_rate_6h, burn_rate_24h,
      status, data_quality, is_simulated, telemetry_source
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    )
    RETURNING *;`,
    [
      id,
      data.sloId,
      data.evaluatedAt || new Date().toISOString(),
      data.windowStart,
      data.windowEnd,
      data.totalEvents || 0,
      data.goodEvents || 0,
      data.badEvents || 0,
      data.sliValue,
      data.targetPercent,
      data.errorBudgetPercent,
      data.allowedBadEvents || 0,
      data.remainingBudgetPercent,
      data.budgetConsumedPercent,
      data.burnRate1h || 0,
      data.burnRate6h || 0,
      data.burnRate24h || 0,
      data.status || 'nominal',
      data.dataQuality || 'good',
      data.isSimulated !== false,
      data.telemetrySource || 'demo_adapter'
    ]
  );
  return mapEvaluationRow(res.rows[0]);
}

export async function findLatestEvaluationBySloId(sloId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    'SELECT * FROM slo_evaluations WHERE slo_id = $1 ORDER BY evaluated_at DESC LIMIT 1;',
    [sloId]
  );
  return mapEvaluationRow(res.rows[0]);
}

export async function findEvaluationsBySloId(sloId, limit = 50, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    'SELECT * FROM slo_evaluations WHERE slo_id = $1 ORDER BY evaluated_at DESC LIMIT $2;',
    [sloId, limit]
  );
  return res.rows.map(mapEvaluationRow);
}

export async function createErrorBudgetHistory(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `hist-${data.sloId}-${Date.now()}`;
  const res = await q(
    `INSERT INTO slo_error_budget_history (
      id, slo_id, timestamp, budget_remaining_percent, burn_rate, bad_events_delta
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;`,
    [
      id,
      data.sloId,
      data.timestamp || new Date().toISOString(),
      data.budgetRemainingPercent,
      data.burnRate,
      data.badEventsDelta || 0
    ]
  );
  return mapHistoryRow(res.rows[0]);
}

export async function findErrorBudgetHistory(sloId, limit = 30, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    'SELECT * FROM slo_error_budget_history WHERE slo_id = $1 ORDER BY timestamp DESC LIMIT $2;',
    [sloId, limit]
  );
  return res.rows.map(mapHistoryRow);
}

export async function findAlertPolicyBySloId(sloId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM slo_alert_policies WHERE slo_id = $1 LIMIT 1;', [sloId]);
  return mapPolicyRow(res.rows[0]);
}

export async function createAlertPolicy(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `policy-${data.sloId}`;
  const res = await q(
    `INSERT INTO slo_alert_policies (
      id, slo_id, fast_burn_threshold, slow_burn_threshold,
      exhaustion_threshold, min_events_required, cooldown_minutes, enabled
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;`,
    [
      id,
      data.sloId,
      data.fastBurnThreshold || 14.4,
      data.slowBurnThreshold || 3.0,
      data.exhaustionThreshold || 1.0,
      data.minEventsRequired || 50,
      data.cooldownMinutes || 30,
      data.enabled !== false
    ]
  );
  return mapPolicyRow(res.rows[0]);
}

export async function createAlertEvent(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `slo-alt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const res = await q(
    `INSERT INTO slo_alert_events (
      id, slo_id, policy_id, incident_id, alert_type, severity,
      burn_rate, budget_remaining_percent, triggered_at, status, message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;`,
    [
      id,
      data.sloId,
      data.policyId || null,
      data.incidentId || null,
      data.alertType,
      data.severity || 'warning',
      data.burnRate,
      data.budgetRemainingPercent,
      data.triggeredAt || new Date().toISOString(),
      data.status || 'firing',
      data.message
    ]
  );
  return mapAlertEventRow(res.rows[0]);
}

export async function findActiveAlertEvents(sloId = null, client = null) {
  const q = client ? client.query.bind(client) : query;
  let sql = 'SELECT * FROM slo_alert_events WHERE status = \'firing\'';
  const params = [];
  if (sloId) {
    params.push(sloId);
    sql += ` AND slo_id = $${params.length}`;
  }
  sql += ' ORDER BY triggered_at DESC;';
  const res = await q(sql, params);
  return res.rows.map(mapAlertEventRow);
}

export async function createReliabilitySnapshot(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `snap-${data.serviceId}-${Date.now()}`;
  const res = await q(
    `INSERT INTO service_reliability_snapshots (
      id, service_id, calculated_at, reliability_score, status,
      trend_direction, contributing_factors, recommendations,
      data_quality, slos_evaluated_count, slos_breached_count, total_budget_consumed_percent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *;`,
    [
      id,
      data.serviceId,
      data.calculatedAt || new Date().toISOString(),
      data.reliabilityScore,
      data.status || 'good',
      data.trendDirection || 'stable',
      JSON.stringify(data.contributingFactors || []),
      JSON.stringify(data.recommendations || []),
      data.dataQuality || 'good',
      data.slosEvaluatedCount || 0,
      data.slosBreachedCount || 0,
      data.totalBudgetConsumedPercent || 0
    ]
  );
  return mapSnapshotRow(res.rows[0]);
}

export async function findLatestReliabilitySnapshot(serviceId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    'SELECT * FROM service_reliability_snapshots WHERE service_id = $1 ORDER BY calculated_at DESC LIMIT 1;',
    [serviceId]
  );
  return mapSnapshotRow(res.rows[0]);
}

export async function findAllReliabilitySnapshots(client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `SELECT DISTINCT ON (service_id) * FROM service_reliability_snapshots 
     ORDER BY service_id, calculated_at DESC;`
  );
  return res.rows.map(mapSnapshotRow);
}

