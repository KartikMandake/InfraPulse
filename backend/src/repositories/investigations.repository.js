import { query } from '../db/connection.js';

function mapInvestigationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    incidentId: row.incident_id,
    executedAt: row.executed_at,
    candidateCount: Number(row.candidate_count),
    topCandidateServiceId: row.top_candidate_service_id,
    topCandidateScore: Number(row.top_candidate_score),
    hypotheses: typeof row.hypotheses === 'string' ? JSON.parse(row.hypotheses) : (row.hypotheses || []),
    correlatedTraces: typeof row.correlated_traces === 'string' ? JSON.parse(row.correlated_traces) : (row.correlated_traces || []),
    weights: typeof row.weights === 'string' ? JSON.parse(row.weights) : (row.weights || {}),
    createdAt: row.created_at
  };
}

export async function findLatestInvestigationByIncidentId(incidentId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    'SELECT * FROM investigation_runs WHERE incident_id = $1 ORDER BY executed_at DESC LIMIT 1;',
    [incidentId]
  );
  return mapInvestigationRow(res.rows[0]);
}

export async function createInvestigationRunRecord(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `inv-${data.incidentId}-${Date.now()}`;
  const topCandidate = data.hypotheses?.[0];

  const res = await q(
    `INSERT INTO investigation_runs (
      id, incident_id, executed_at, candidate_count, top_candidate_service_id,
      top_candidate_score, hypotheses, correlated_traces, weights
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    RETURNING *;`,
    [
      id,
      data.incidentId,
      data.executedAt || new Date().toISOString(),
      data.hypotheses?.length || 0,
      topCandidate?.candidateServiceId || null,
      topCandidate?.score || 0,
      JSON.stringify(data.hypotheses || []),
      JSON.stringify(data.correlatedTraces || []),
      JSON.stringify(data.weights || {})
    ]
  );

  return mapInvestigationRow(res.rows[0]);
}

