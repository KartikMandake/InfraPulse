import { query } from '../db/connection.js';

function mapDeploymentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    serviceName: row.service_name,
    version: row.version,
    environment: row.environment,
    author: row.author,
    commitSha: row.commit_sha,
    commitMessage: row.commit_message,
    timestamp: row.timestamp,
    status: row.status,
    acaScore: Number(row.aca_score),
    canaryTrafficPercent: Number(row.canary_traffic_percent),
    p99CanaryVsStable: typeof row.p99_canary_vs_stable === 'string' ? JSON.parse(row.p99_canary_vs_stable) : (row.p99_canary_vs_stable || {}),
    errorRateCanaryVsStable: typeof row.error_rate_canary_vs_stable === 'string' ? JSON.parse(row.error_rate_canary_vs_stable) : (row.error_rate_canary_vs_stable || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findAllDeployments(client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM deployments ORDER BY created_at DESC;');
  return res.rows.map(mapDeploymentRow);
}

export async function findDeploymentById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM deployments WHERE id = $1;', [id]);
  return mapDeploymentRow(res.rows[0]);
}

export async function updateDeploymentRecord(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const current = await findDeploymentById(id, client);
  if (!current) return null;

  const merged = { ...current, ...updates };

  const res = await q(
    `UPDATE deployments SET
      status = $1,
      canary_traffic_percent = $2,
      aca_score = $3,
      p99_canary_vs_stable = $4,
      error_rate_canary_vs_stable = $5,
      updated_at = NOW()
    WHERE id = $6
    RETURNING *;`,
    [
      merged.status,
      merged.canaryTrafficPercent,
      merged.acaScore,
      JSON.stringify(merged.p99CanaryVsStable),
      JSON.stringify(merged.errorRateCanaryVsStable),
      id
    ]
  );

  return mapDeploymentRow(res.rows[0]);
}

