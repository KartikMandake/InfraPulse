import { query } from '../db/connection.js';

export async function createChangeEvent(data) {
  const text = `
    INSERT INTO change_events (
      id, service_id, service_name, previous_version, new_version, environment,
      deployment_strategy, commit_sha, commit_message, actor, status, change_type,
      changed_components, idempotency_key, telemetry_source, is_simulated,
      evidence_quality, metadata, tenant_id, deployed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    )
    RETURNING *;
  `;
  const values = [
    data.id,
    data.serviceId || data.service_id,
    data.serviceName || data.service_name,
    data.previousVersion || data.previous_version || null,
    data.newVersion || data.new_version,
    data.environment || 'production',
    data.deploymentStrategy || data.deployment_strategy || 'rolling',
    data.commitSha || data.commit_sha || null,
    data.commitMessage || data.commit_message || null,
    data.actor || 'CI/CD Pipeline',
    data.status || 'successful',
    data.changeType || data.change_type || 'code_deployment',
    JSON.stringify(data.changedComponents || data.changed_components || []),
    data.idempotencyKey || data.idempotency_key || null,
    data.telemetrySource || data.telemetry_source || 'demo_adapter',
    data.isSimulated !== undefined ? data.isSimulated : true,
    data.evidenceQuality || data.evidence_quality || 'good',
    JSON.stringify(data.metadata || {}),
    data.tenantId || data.tenant_id || 'default_tenant',
    data.deployedAt || data.deployed_at || new Date().toISOString()
  ];
  const res = await query(text, values);
  return res.rows[0];
}

export async function findChangeEventById(id) {
  const text = `SELECT * FROM change_events WHERE id = $1;`;
  const res = await query(text, [id]);
  return res.rows[0] || null;
}

export async function findChangeEventByIdempotencyKey(key) {
  if (!key) return null;
  const text = `SELECT * FROM change_events WHERE idempotency_key = $1;`;
  const res = await query(text, [key]);
  return res.rows[0] || null;
}

export async function listChangeEvents(filters = {}) {
  let text = `SELECT * FROM change_events WHERE 1=1`;
  const values = [];

  if (filters.serviceId) {
    values.push(filters.serviceId);
    text += ` AND service_id = $${values.length}`;
  }
  if (filters.environment) {
    values.push(filters.environment);
    text += ` AND environment = $${values.length}`;
  }
  if (filters.status) {
    values.push(filters.status);
    text += ` AND status = $${values.length}`;
  }
  if (filters.tenantId) {
    values.push(filters.tenantId);
    text += ` AND tenant_id = $${values.length}`;
  }

  text += ` ORDER BY deployed_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  values.push(filters.limit || 50, filters.offset || 0);

  const res = await query(text, values);
  return res.rows;
}

export async function countChangeEvents(filters = {}) {
  let text = `SELECT COUNT(*) FROM change_events WHERE 1=1`;
  const values = [];
  if (filters.serviceId) {
    values.push(filters.serviceId);
    text += ` AND service_id = $${values.length}`;
  }
  if (filters.environment) {
    values.push(filters.environment);
    text += ` AND environment = $${values.length}`;
  }
  const res = await query(text, values);
  return parseInt(res.rows[0].count, 10);
}

export async function createChangeAssessment(data) {
  const text = `
    INSERT INTO change_assessments (
      id, change_id, service_id, environment, target_version, risk_score,
      risk_category, recommendation, factor_breakdowns, blast_radius_summary,
      supporting_evidence, missing_evidence, recommended_verifications,
      confidence, tenant_id, assessed_by, assessed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    )
    RETURNING *;
  `;
  const values = [
    data.id,
    data.changeId || data.change_id || null,
    data.serviceId || data.service_id,
    data.environment || 'production',
    data.targetVersion || data.target_version,
    data.riskScore !== undefined ? data.riskScore : data.risk_score,
    data.riskCategory || data.risk_category,
    data.recommendation,
    JSON.stringify(data.factorBreakdowns || data.factor_breakdowns || {}),
    JSON.stringify(data.blastRadiusSummary || data.blast_radius_summary || {}),
    JSON.stringify(data.supportingEvidence || data.supporting_evidence || []),
    JSON.stringify(data.missingEvidence || data.missing_evidence || []),
    JSON.stringify(data.recommendedVerifications || data.recommended_verifications || []),
    data.confidence || 'medium',
    data.tenantId || data.tenant_id || 'default_tenant',
    data.assessedBy || data.assessed_by || 'risk-engine',
    data.assessedAt || data.assessed_at || new Date().toISOString()
  ];
  const res = await query(text, values);
  return res.rows[0];
}

export async function findAssessmentByChangeId(changeId) {
  const text = `SELECT * FROM change_assessments WHERE change_id = $1 ORDER BY assessed_at DESC LIMIT 1;`;
  const res = await query(text, [changeId]);
  return res.rows[0] || null;
}

export async function findAssessmentById(id) {
  const text = `SELECT * FROM change_assessments WHERE id = $1;`;
  const res = await query(text, [id]);
  return res.rows[0] || null;
}

export async function createImpactedServices(records = []) {
  if (records.length === 0) return [];
  const inserted = [];
  for (const r of records) {
    const text = `
      INSERT INTO change_impact_services (
        id, change_id, assessment_id, service_id, service_name, relationship_type,
        dependency_path, criticality, has_active_incident, has_slo, confidence, explanation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const values = [
      r.id,
      r.changeId || r.change_id || null,
      r.assessmentId || r.assessment_id || null,
      r.serviceId || r.service_id,
      r.serviceName || r.service_name,
      r.relationshipType || r.relationship_type,
      JSON.stringify(r.dependencyPath || r.dependency_path || []),
      r.criticality ?? 1,
      !!(r.hasActiveIncident || r.has_active_incident),
      !!(r.hasSlo || r.has_slo),
      r.confidence ?? 1.0,
      r.explanation || ''
    ];
    const res = await query(text, values);
    inserted.push(res.rows[0]);
  }
  return inserted;
}

export async function findImpactedServicesByChangeId(changeId) {
  const text = `SELECT * FROM change_impact_services WHERE change_id = $1;`;
  const res = await query(text, [changeId]);
  return res.rows;
}

export async function findImpactedServicesByAssessmentId(assessmentId) {
  const text = `SELECT * FROM change_impact_services WHERE assessment_id = $1;`;
  const res = await query(text, [assessmentId]);
  return res.rows;
}

export async function createDeploymentRegression(data) {
  const text = `
    INSERT INTO deployment_regressions (
      id, change_id, service_id, metric_name, baseline_value, current_value,
      delta_percent, regression_severity, observation_window_minutes,
      temporal_association, causality_status, evidence_quality, related_incidents,
      related_alerts, explanation, detected_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )
    RETURNING *;
  `;
  const values = [
    data.id,
    data.changeId || data.change_id,
    data.serviceId || data.service_id,
    data.metricName || data.metric_name,
    data.baselineValue ?? data.baseline_value,
    data.currentValue ?? data.current_value,
    data.deltaPercent ?? data.delta_percent,
    data.regressionSeverity || data.regression_severity || 'warning',
    data.observationWindowMinutes || data.observation_window_minutes || 30,
    data.temporalAssociation !== undefined ? data.temporalAssociation : true,
    data.causalityStatus || data.causality_status || 'correlated_temporal',
    data.evidenceQuality || data.evidence_quality || 'good',
    JSON.stringify(data.relatedIncidents || data.related_incidents || []),
    JSON.stringify(data.relatedAlerts || data.related_alerts || []),
    data.explanation || '',
    data.detectedAt || data.detected_at || new Date().toISOString()
  ];
  const res = await query(text, values);
  return res.rows[0];
}

export async function findRegressionsByChangeId(changeId) {
  const text = `SELECT * FROM deployment_regressions WHERE change_id = $1 ORDER BY detected_at DESC;`;
  const res = await query(text, [changeId]);
  return res.rows;
}

export async function findRegressionsByServiceId(serviceId) {
  const text = `SELECT * FROM deployment_regressions WHERE service_id = $1 ORDER BY detected_at DESC;`;
  const res = await query(text, [serviceId]);
  return res.rows;
}

export async function createRiskEvidence(records = []) {
  if (records.length === 0) return [];
  const inserted = [];
  for (const r of records) {
    const text = `
      INSERT INTO change_risk_evidence (
        id, change_id, assessment_id, evidence_type, title, description,
        metric_ref, impact_points, is_contradictory, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;
    const values = [
      r.id,
      r.changeId || r.change_id || null,
      r.assessmentId || r.assessment_id || null,
      r.evidenceType || r.evidence_type,
      r.title,
      r.description,
      r.metricRef || r.metric_ref || null,
      r.impactPoints ?? r.impact_points ?? 0,
      !!(r.isContradictory || r.is_contradictory),
      JSON.stringify(r.metadata || {})
    ];
    const res = await query(text, values);
    inserted.push(res.rows[0]);
  }
  return inserted;
}

export async function findRiskEvidenceByAssessmentId(assessmentId) {
  const text = `SELECT * FROM change_risk_evidence WHERE assessment_id = $1;`;
  const res = await query(text, [assessmentId]);
  return res.rows;
}

export async function createChangeOutcome(data) {
  const text = `
    INSERT INTO change_outcomes (
      id, change_id, observed_outcome, incident_id, rollback_performed,
      time_to_recovery_minutes, post_deployment_notes, recorded_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;
  const values = [
    data.id,
    data.changeId || data.change_id,
    data.observedOutcome || data.observed_outcome,
    data.incidentId || data.incident_id || null,
    !!(data.rollbackPerformed || data.rollback_performed),
    data.timeToRecoveryMinutes ?? data.time_to_recovery_minutes ?? null,
    data.postDeploymentNotes || data.post_deployment_notes || null,
    data.recordedAt || data.recorded_at || new Date().toISOString()
  ];
  const res = await query(text, values);
  return res.rows[0];
}

export async function findOutcomeByChangeId(changeId) {
  const text = `SELECT * FROM change_outcomes WHERE change_id = $1;`;
  const res = await query(text, [changeId]);
  return res.rows[0] || null;
}

export async function findAllHistoricalDeployments(serviceId = null) {
  let text = `SELECT * FROM change_events WHERE 1=1`;
  const values = [];
  if (serviceId) {
    values.push(serviceId);
    text += ` AND service_id = $1`;
  }
  text += ` ORDER BY deployed_at DESC;`;
  const res = await query(text, values);
  return res.rows;
}
