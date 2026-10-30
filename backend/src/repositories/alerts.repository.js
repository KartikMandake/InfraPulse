import { query } from '../db/connection.js';

function mapAlertRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ruleId: row.rule_id,
    title: row.title,
    severity: row.severity,
    status: row.status,
    state: row.state,
    serviceId: row.service_id,
    serviceName: row.service_name,
    region: row.region,
    metric: row.metric,
    operator: row.operator,
    threshold: row.threshold,
    currentValue: row.current_value,
    observedValue: row.observed_value !== null ? (isNaN(Number(row.observed_value)) ? row.observed_value : Number(row.observed_value)) : null,
    firedAt: row.fired_at,
    triggeredAt: row.triggered_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    silenceDuration: row.silence_duration,
    incidentId: row.incident_id,
    occurrenceCount: Number(row.occurrence_count),
    source: row.source,
    evidenceRefs: typeof row.evidence_refs === 'string' ? JSON.parse(row.evidence_refs) : (row.evidence_refs || []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findAllAlerts(filters = {}, client = null) {
  const q = client ? client.query.bind(client) : query;
  const conditions = [];
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`(status = $${params.length} OR ($${params.length} = 'active' AND state = 'firing'))`);
  }
  if (filters.state) {
    params.push(filters.state);
    conditions.push(`(state = $${params.length} OR status = $${params.length})`);
  }
  if (filters.severity) {
    params.push(filters.severity.toLowerCase());
    conditions.push(`LOWER(severity) = $${params.length}`);
  }
  if (filters.serviceId) {
    params.push(filters.serviceId);
    conditions.push(`service_id = $${params.length}`);
  }
  if (filters.incidentId) {
    params.push(filters.incidentId);
    conditions.push(`incident_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM alerts ${whereClause} ORDER BY triggered_at DESC;`;

  const res = await q(sql, params);
  return res.rows.map(mapAlertRow);
}

export async function findAlertById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM alerts WHERE id = $1;', [id]);
  return mapAlertRow(res.rows[0]);
}

export async function createAlertRecord(alertData, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = alertData.id || `ALT-${Math.floor(1000 + Math.random() * 9000)}`;

  let computedStatus = alertData.status || 'active';
  let computedState = alertData.state || (computedStatus === 'active' ? 'firing' : computedStatus);

  const res = await q(
    `INSERT INTO alerts (
      id, rule_id, title, severity, status, state, service_id, service_name,
      region, metric, operator, threshold, current_value, observed_value,
      fired_at, triggered_at, acknowledged_at, resolved_at, silence_duration,
      incident_id, occurrence_count, source, evidence_refs
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
    )
    ON CONFLICT (id) DO UPDATE SET
      current_value = EXCLUDED.current_value,
      observed_value = EXCLUDED.observed_value,
      occurrence_count = alerts.occurrence_count + 1,
      fired_at = EXCLUDED.fired_at,
      updated_at = NOW()
    RETURNING *;`,
    [
      id,
      alertData.ruleId || null,
      alertData.title,
      alertData.severity || 'warning',
      computedStatus,
      computedState,
      alertData.serviceId,
      alertData.serviceName || alertData.serviceId,
      alertData.region || 'us-east-1',
      alertData.metric || 'unknown',
      alertData.operator || '>',
      String(alertData.threshold || '0'),
      String(alertData.currentValue || alertData.observedValue || '0'),
      alertData.observedValue !== undefined && alertData.observedValue !== null ? String(alertData.observedValue) : null,
      alertData.firedAt || new Date().toISOString().substring(11, 19) + ' UTC',
      alertData.triggeredAt || new Date().toISOString(),
      alertData.acknowledgedAt || null,
      alertData.resolvedAt || null,
      alertData.silenceDuration || null,
      alertData.incidentId || null,
      alertData.occurrenceCount || 1,
      alertData.source || 'rule_evaluator',
      JSON.stringify(alertData.evidenceRefs || [])
    ]
  );
  return mapAlertRow(res.rows[0]);
}

export async function updateAlertRecord(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const current = await findAlertById(id, client);
  if (!current) return null;

  let computedStatus = updates.status || current.status;
  let computedState = updates.state || current.state;

  if (updates.status && !updates.state) {
    computedState = updates.status === 'active' ? 'firing' : updates.status;
  } else if (updates.state && !updates.status) {
    computedStatus = updates.state === 'firing' ? 'active' : updates.state;
  }

  const merged = {
    ...current,
    ...updates,
    status: computedStatus,
    state: computedState
  };

  const res = await q(
    `UPDATE alerts SET
      title = $1,
      severity = $2,
      status = $3,
      state = $4,
      current_value = $5,
      observed_value = $6,
      fired_at = $7,
      acknowledged_at = $8,
      resolved_at = $9,
      silence_duration = $10,
      incident_id = $11,
      occurrence_count = $12,
      evidence_refs = $13,
      updated_at = NOW()
    WHERE id = $14
    RETURNING *;`,
    [
      merged.title,
      merged.severity,
      merged.status,
      merged.state,
      String(merged.currentValue),
      merged.observedValue !== undefined && merged.observedValue !== null ? String(merged.observedValue) : null,
      merged.firedAt,
      merged.acknowledgedAt,
      merged.resolvedAt,
      merged.silenceDuration,
      merged.incidentId,
      merged.occurrenceCount,
      JSON.stringify(merged.evidenceRefs),
      id
    ]
  );

  return mapAlertRow(res.rows[0]);
}
