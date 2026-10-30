import { query } from '../db/connection.js';

function mapAlertRuleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    targetServiceId: row.target_service_id,
    metric: row.metric,
    operator: row.operator,
    threshold: isNaN(Number(row.threshold)) ? row.threshold : Number(row.threshold),
    windowMinutes: Number(row.window_minutes),
    severity: row.severity,
    enabled: Boolean(row.enabled),
    cooldownMinutes: Number(row.cooldown_minutes),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findAllAlertRules(client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM alert_rules ORDER BY created_at ASC;');
  return res.rows.map(mapAlertRuleRow);
}

export async function findAlertRuleById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM alert_rules WHERE id = $1;', [id]);
  return mapAlertRuleRow(res.rows[0]);
}

export async function createAlertRuleRecord(ruleData, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = ruleData.id || `RULE-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const res = await q(
    `INSERT INTO alert_rules (
      id, name, description, type, target_service_id, metric, operator,
      threshold, window_minutes, severity, enabled, cooldown_minutes
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      threshold = EXCLUDED.threshold,
      severity = EXCLUDED.severity,
      enabled = EXCLUDED.enabled,
      updated_at = NOW()
    RETURNING *;`,
    [
      id,
      ruleData.name,
      ruleData.description || '',
      ruleData.type,
      ruleData.targetServiceId || '*',
      ruleData.metric,
      ruleData.operator,
      String(ruleData.threshold),
      ruleData.windowMinutes || 5,
      ruleData.severity || 'warning',
      ruleData.enabled !== false,
      ruleData.cooldownMinutes || 15
    ]
  );
  return mapAlertRuleRow(res.rows[0]);
}

export async function updateAlertRuleRecord(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const current = await findAlertRuleById(id, client);
  if (!current) return null;

  const merged = { ...current, ...updates };

  const res = await q(
    `UPDATE alert_rules SET
      name = $1,
      description = $2,
      type = $3,
      target_service_id = $4,
      metric = $5,
      operator = $6,
      threshold = $7,
      window_minutes = $8,
      severity = $9,
      enabled = $10,
      cooldown_minutes = $11,
      updated_at = NOW()
    WHERE id = $12
    RETURNING *;`,
    [
      merged.name,
      merged.description,
      merged.type,
      merged.targetServiceId,
      merged.metric,
      merged.operator,
      String(merged.threshold),
      merged.windowMinutes,
      merged.severity,
      merged.enabled,
      merged.cooldownMinutes,
      id
    ]
  );
  return mapAlertRuleRow(res.rows[0]);
}

