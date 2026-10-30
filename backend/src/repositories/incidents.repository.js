import { query, withTransaction } from '../db/connection.js';

function mapIncidentRow(row, events = []) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    status: row.status,
    serviceId: row.service_id,
    serviceName: row.service_name,
    lead: row.lead,
    leadRole: row.lead_role,
    channel: row.channel,
    startedAt: row.started_at,
    durationMinutes: Number(row.duration_minutes),
    dropRatePercent: Number(row.drop_rate_percent),
    estimatedCostPerMin: Number(row.estimated_cost_per_min),
    sloBreached: Boolean(row.slo_breached),
    sloCurrent: Number(row.slo_current),
    sloTarget: Number(row.slo_target),
    aiConfidencePercent: Number(row.ai_confidence_percent),
    aiHypothesis: row.ai_hypothesis,
    aiRemediationRecommendation: row.ai_remediation_recommendation,
    canaryVersion: row.canary_version,
    stableVersion: row.stable_version,
    timeline: events.map(e => ({
      id: e.id,
      time: e.time,
      title: e.title,
      description: e.description,
      source: e.source,
      isKeyMilestone: Boolean(e.is_key_milestone),
      evidenceRef: typeof e.evidence_ref === 'string' ? JSON.parse(e.evidence_ref) : (e.evidence_ref || {})
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findAllIncidents(client = null) {
  const q = client ? client.query.bind(client) : query;
  const incRes = await q('SELECT * FROM incidents ORDER BY created_at DESC;');
  const eventsRes = await q('SELECT * FROM incident_events ORDER BY created_at ASC;');

  const eventsByIncId = {};
  for (const e of eventsRes.rows) {
    if (!eventsByIncId[e.incident_id]) eventsByIncId[e.incident_id] = [];
    eventsByIncId[e.incident_id].push(e);
  }

  return incRes.rows.map(r => mapIncidentRow(r, eventsByIncId[r.id] || []));
}

export async function findIncidentById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const incRes = await q('SELECT * FROM incidents WHERE id = $1;', [id]);
  if (!incRes.rows[0]) return null;

  const eventsRes = await q('SELECT * FROM incident_events WHERE incident_id = $1 ORDER BY created_at ASC;', [id]);
  return mapIncidentRow(incRes.rows[0], eventsRes.rows);
}

export async function createIncidentRecord(incidentData, client = null) {
  const runner = async (c) => {
    const incId = incidentData.id || `INC-${Math.floor(1000 + Math.random() * 9000)}`;

    const incRes = await c.query(
      `INSERT INTO incidents (
        id, title, summary, severity, status, service_id, service_name,
        lead, lead_role, channel, started_at, duration_minutes, drop_rate_percent,
        estimated_cost_per_min, slo_breached, slo_current, slo_target,
        ai_confidence_percent, ai_hypothesis, ai_remediation_recommendation,
        canary_version, stable_version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *;`,
      [
        incId,
        incidentData.title || 'Untitled Incident',
        incidentData.summary || 'Incident declared.',
        incidentData.severity || 'SEV-2',
        incidentData.status || 'investigating',
        incidentData.serviceId,
        incidentData.serviceName || incidentData.serviceId,
        incidentData.lead || 'On-Call SRE',
        incidentData.leadRole || 'Incident Commander',
        incidentData.channel || `#inc-${Math.floor(1000 + Math.random() * 9000)}`,
        incidentData.startedAt || new Date().toISOString().substring(11, 19) + ' UTC',
        incidentData.durationMinutes || 0,
        incidentData.dropRatePercent || 0,
        incidentData.estimatedCostPerMin || 0,
        Boolean(incidentData.sloBreached),
        incidentData.sloCurrent || 100,
        incidentData.sloTarget || 99.9,
        incidentData.aiConfidencePercent || 75,
        incidentData.aiHypothesis || '',
        incidentData.aiRemediationRecommendation || '',
        incidentData.canaryVersion || null,
        incidentData.stableVersion || null
      ]
    );

    const events = [];
    if (Array.isArray(incidentData.timeline)) {
      for (let idx = 0; idx < incidentData.timeline.length; idx++) {
        const item = incidentData.timeline[idx];
        const eventId = item.id || `evt-${incId}-${Date.now()}-${idx}`;
        const evRes = await c.query(
          `INSERT INTO incident_events (
            id, incident_id, type, time, title, description, source, is_key_milestone, evidence_ref
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING *;`,
          [
            eventId,
            incId,
            item.type || 'incident_milestone',
            item.time || new Date().toISOString().substring(11, 19) + ' UTC',
            item.title || 'Milestone',
            item.description || '',
            item.source || 'ai_engine',
            Boolean(item.isKeyMilestone),
            JSON.stringify(item.evidenceRef || {})
          ]
        );
        if (evRes.rows[0]) events.push(evRes.rows[0]);
      }
    }

    return mapIncidentRow(incRes.rows[0], events);
  };

  return client ? runner(client) : withTransaction(runner);
}

export async function updateIncidentRecord(id, updates, client = null) {
  const runner = async (c) => {
    const current = await findIncidentById(id, c);
    if (!current) return null;

    const merged = { ...current, ...updates };

    const res = await c.query(
      `UPDATE incidents SET
        title = $1,
        summary = $2,
        severity = $3,
        status = $4,
        service_id = $5,
        service_name = $6,
        lead = $7,
        lead_role = $8,
        channel = $9,
        started_at = $10,
        duration_minutes = $11,
        drop_rate_percent = $12,
        estimated_cost_per_min = $13,
        slo_breached = $14,
        slo_current = $15,
        slo_target = $16,
        ai_confidence_percent = $17,
        ai_hypothesis = $18,
        ai_remediation_recommendation = $19,
        canary_version = $20,
        stable_version = $21,
        updated_at = NOW()
      WHERE id = $22
      RETURNING *;`,
      [
        merged.title,
        merged.summary,
        merged.severity,
        merged.status,
        merged.serviceId,
        merged.serviceName,
        merged.lead,
        merged.leadRole,
        merged.channel,
        merged.startedAt,
        merged.durationMinutes,
        merged.dropRatePercent,
        merged.estimatedCostPerMin,
        merged.sloBreached,
        merged.sloCurrent,
        merged.sloTarget,
        merged.aiConfidencePercent,
        merged.aiHypothesis,
        merged.aiRemediationRecommendation,
        merged.canaryVersion,
        merged.stableVersion,
        id
      ]
    );

    // If new timeline items were provided
    if (Array.isArray(updates.timeline)) {
      for (let idx = 0; idx < updates.timeline.length; idx++) {
        const item = updates.timeline[idx];
        const eventId = item.id || `evt-${id}-${Date.now()}-${idx}`;
        await c.query(
          `INSERT INTO incident_events (
            id, incident_id, type, time, title, description, source, is_key_milestone, evidence_ref
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
          ON CONFLICT (id) DO NOTHING;`,
          [
            eventId,
            id,
            item.type || 'incident_milestone',
            item.time || new Date().toISOString().substring(11, 19) + ' UTC',
            item.title || 'Milestone',
            item.description || '',
            item.source || 'ai_engine',
            Boolean(item.isKeyMilestone),
            JSON.stringify(item.evidenceRef || {})
          ]
        );
      }
    }

    const eventsRes = await c.query('SELECT * FROM incident_events WHERE incident_id = $1 ORDER BY created_at ASC;', [id]);
    return mapIncidentRow(res.rows[0], eventsRes.rows);
  };

  return client ? runner(client) : withTransaction(runner);
}

export async function addIncidentEvent(incidentId, eventData, client = null) {
  const q = client ? client.query.bind(client) : query;
  const eventId = eventData.id || `evt-${incidentId}-${Date.now()}`;
  const res = await q(
    `INSERT INTO incident_events (
      id, incident_id, type, time, title, description, source, is_key_milestone, evidence_ref
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING *;`,
    [
      eventId,
      incidentId,
      eventData.type || 'incident_milestone',
      eventData.time || new Date().toISOString().substring(11, 19) + ' UTC',
      eventData.title,
      eventData.description || '',
      eventData.source || 'ai_engine',
      Boolean(eventData.isKeyMilestone),
      JSON.stringify(eventData.evidenceRef || {})
    ]
  );
  return res.rows[0];
}

