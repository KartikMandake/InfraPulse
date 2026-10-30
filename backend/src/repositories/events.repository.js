import { query } from '../db/connection.js';

export async function insertNormalizedEvent(event) {
  const text = `
    INSERT INTO normalized_events (
      id, event_type, source_system, source_ref_id, tenant_id, service_id,
      service_name, environment, event_timestamp, ingestion_timestamp, severity,
      title, summary, correlation_ids, related_incident_id, related_deployment_id,
      telemetry_mode, evidence_quality, normalized_attributes, original_source_ref
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    )
    ON CONFLICT (source_system, source_ref_id, event_type)
    DO UPDATE SET
      severity = EXCLUDED.severity,
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      correlation_ids = EXCLUDED.correlation_ids,
      normalized_attributes = EXCLUDED.normalized_attributes,
      evidence_quality = EXCLUDED.evidence_quality
    RETURNING *;
  `;
  const values = [
    event.id,
    event.eventType,
    event.sourceSystem,
    event.sourceRefId,
    event.tenantId || 'default_tenant',
    event.serviceId || null,
    event.serviceName || null,
    event.environment || 'production',
    event.eventTimestamp,
    event.ingestionTimestamp || new Date().toISOString(),
    event.severity || 'info',
    event.title,
    event.summary,
    JSON.stringify(event.correlationIds || []),
    event.relatedIncidentId || null,
    event.relatedDeploymentId || null,
    event.telemetryMode || 'simulated',
    event.evidenceQuality || 'good',
    JSON.stringify(event.normalizedAttributes || {}),
    JSON.stringify(event.originalSourceRef || {})
  ];
  const res = await query(text, values);
  return res.rows[0];
}

export async function findNormalizedEventById(id) {
  const text = `SELECT * FROM normalized_events WHERE id = $1;`;
  const res = await query(text, [id]);
  return res.rows[0] || null;
}

export async function listNormalizedEvents(filters = {}) {
  let text = `SELECT * FROM normalized_events WHERE 1=1`;
  const values = [];

  if (filters.serviceId) {
    values.push(filters.serviceId);
    text += ` AND service_id = $${values.length}`;
  }
  if (filters.eventType) {
    values.push(filters.eventType);
    text += ` AND event_type = $${values.length}`;
  }
  if (filters.severity) {
    values.push(filters.severity);
    text += ` AND severity = $${values.length}`;
  }
  if (filters.relatedIncidentId) {
    values.push(filters.relatedIncidentId);
    text += ` AND related_incident_id = $${values.length}`;
  }
  if (filters.telemetryMode) {
    values.push(filters.telemetryMode);
    text += ` AND telemetry_mode = $${values.length}`;
  }
  if (filters.windowStart) {
    values.push(filters.windowStart);
    text += ` AND event_timestamp >= $${values.length}`;
  }
  if (filters.windowEnd) {
    values.push(filters.windowEnd);
    text += ` AND event_timestamp <= $${values.length}`;
  }
  if (filters.tenantId) {
    values.push(filters.tenantId);
    text += ` AND tenant_id = $${values.length}`;
  }

  text += ` ORDER BY event_timestamp DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  values.push(filters.limit || 100, filters.offset || 0);

  const res = await query(text, values);
  return res.rows;
}

export async function countNormalizedEvents(filters = {}) {
  let text = `SELECT COUNT(*) FROM normalized_events WHERE 1=1`;
  const values = [];
  if (filters.serviceId) {
    values.push(filters.serviceId);
    text += ` AND service_id = $${values.length}`;
  }
  if (filters.relatedIncidentId) {
    values.push(filters.relatedIncidentId);
    text += ` AND related_incident_id = $${values.length}`;
  }
  const res = await query(text, values);
  return parseInt(res.rows[0].count, 10);
}

export async function recordNormalizationFailure(failure) {
  const text = `
    INSERT INTO event_normalization_failures (id, source_system, raw_payload, error_reason, tenant_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const values = [
    failure.id,
    failure.sourceSystem || 'unknown',
    JSON.stringify(failure.rawPayload || {}),
    failure.errorReason,
    failure.tenantId || 'default_tenant'
  ];
  const res = await query(text, values);
  return res.rows[0];
}

export async function insertEventCorrelation(corr) {
  const text = `
    INSERT INTO event_correlations (
      id, source_event_id, target_event_id, relationship_type, correlation_score,
      supporting_reasons, contradictory_evidence, time_difference_ms,
      dependency_path, confidence, tenant_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;
  const values = [
    corr.id,
    corr.sourceEventId || corr.source_event_id,
    corr.targetEventId || corr.target_event_id,
    corr.relationshipType || corr.relationship_type,
    corr.correlationScore ?? corr.correlation_score,
    JSON.stringify(corr.supportingReasons || corr.supporting_reasons || []),
    JSON.stringify(corr.contradictoryEvidence || corr.contradictory_evidence || []),
    corr.timeDifferenceMs ?? corr.time_difference_ms ?? 0,
    JSON.stringify(corr.dependencyPath || corr.dependency_path || []),
    corr.confidence || 'medium',
    corr.tenantId || corr.tenant_id || 'default_tenant'
  ];
  const res = await query(text, values);
  return res.rows[0];
}

export async function listEventCorrelations(filters = {}) {
  let text = `SELECT * FROM event_correlations WHERE 1=1`;
  const values = [];
  if (filters.sourceEventId) {
    values.push(filters.sourceEventId);
    text += ` AND (source_event_id = $${values.length} OR target_event_id = $${values.length})`;
  }
  if (filters.relationshipType) {
    values.push(filters.relationshipType);
    text += ` AND relationship_type = $${values.length}`;
  }
  text += ` ORDER BY correlation_score DESC LIMIT $${values.length + 1}`;
  values.push(filters.limit || 100);

  const res = await query(text, values);
  return res.rows;
}

export async function insertGraphSnapshot(snapshot) {
  const text = `
    INSERT INTO investigation_graph_snapshots (
      id, incident_id, nodes, edges, correlation_summary, window_start, window_end, tenant_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;
  const values = [
    snapshot.id,
    snapshot.incidentId,
    JSON.stringify(snapshot.nodes || []),
    JSON.stringify(snapshot.edges || []),
    JSON.stringify(snapshot.correlationSummary || {}),
    snapshot.windowStart,
    snapshot.windowEnd,
    snapshot.tenantId || 'default_tenant'
  ];
  const res = await query(text, values);
  return res.rows[0];
}

export async function findLatestGraphSnapshotByIncident(incidentId) {
  const text = `
    SELECT * FROM investigation_graph_snapshots
    WHERE incident_id = $1
    ORDER BY created_at DESC
    LIMIT 1;
  `;
  const res = await query(text, [incidentId]);
  return res.rows[0] || null;
}

