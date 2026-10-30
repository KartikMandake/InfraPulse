import { query } from '../db/connection.js';

function mapSimulationRow(row) {
  if (!row) return null;
  return {
    simulationId: row.id,
    id: row.id,
    scenarioId: row.scenario_id,
    targetServiceId: row.target_service_id,
    targetServiceName: row.target_service_name,
    faultType: row.fault_type,
    severity: row.severity,
    expectedRootCauseServiceId: row.expected_root_cause_service_id,
    expectedDownstreamAffected: row.expected_downstream_affected || [],
    propagatedServices: row.propagated_services || [],
    simulatedIncident: typeof row.simulated_incident === 'string' ? JSON.parse(row.simulated_incident) : (row.simulated_incident || {}),
    evaluation: typeof row.evaluation === 'string' ? JSON.parse(row.evaluation) : (row.evaluation || {}),
    baselineMetrics: typeof row.baseline_metrics === 'string' ? JSON.parse(row.baseline_metrics) : (row.baseline_metrics || {}),
    createdAt: row.created_at
  };
}

export async function findSimulationById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM fault_simulations WHERE id = $1;', [id]);
  return mapSimulationRow(res.rows[0]);
}

export async function saveSimulationRecord(simData, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `INSERT INTO fault_simulations (
      id, scenario_id, target_service_id, target_service_name,
      fault_type, severity, expected_root_cause_service_id,
      expected_downstream_affected, propagated_services,
      simulated_incident, evaluation, baseline_metrics
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    ON CONFLICT (id) DO UPDATE SET
      evaluation = EXCLUDED.evaluation,
      simulated_incident = EXCLUDED.simulated_incident
    RETURNING *;`,
    [
      simData.simulationId || simData.id,
      simData.scenarioId,
      simData.targetServiceId,
      simData.targetServiceName,
      simData.faultType,
      simData.severity,
      simData.expectedRootCauseServiceId,
      simData.expectedDownstreamAffected || [],
      simData.propagatedServices || [],
      JSON.stringify(simData.simulatedIncident || {}),
      JSON.stringify(simData.evaluation || {}),
      JSON.stringify(simData.baselineMetrics || {})
    ]
  );
  return mapSimulationRow(res.rows[0]);
}

export async function deleteSimulationRecord(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('DELETE FROM fault_simulations WHERE id = $1 RETURNING id;', [id]);
  return res.rows.length > 0;
}

