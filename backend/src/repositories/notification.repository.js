import { query } from '../db/connection.js';

function mapChannelRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: row.enabled,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPreferenceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channel_id,
    eventType: row.event_type,
    minSeverity: row.min_severity,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDeliveryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    channelId: row.channel_id,
    channelType: row.channel_type,
    eventType: row.event_type,
    incidentId: row.incident_id,
    recipient: row.recipient,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {}),
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at,
    lastError: row.last_error,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findAllChannels(client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM notification_channels ORDER BY name ASC;');
  return res.rows.map(mapChannelRow);
}

export async function findChannelById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM notification_channels WHERE id = $1;', [id]);
  return mapChannelRow(res.rows[0]);
}

export async function updateChannel(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const fields = [];
  const params = [id];

  if (updates.name !== undefined) {
    params.push(updates.name);
    fields.push(`name = $${params.length}`);
  }
  if (updates.enabled !== undefined) {
    params.push(updates.enabled);
    fields.push(`enabled = $${params.length}`);
  }
  if (updates.config !== undefined) {
    params.push(JSON.stringify(updates.config));
    fields.push(`config = $${params.length}`);
  }

  if (fields.length === 0) return findChannelById(id, client);

  fields.push('updated_at = NOW()');
  const sql = `
    UPDATE notification_channels
    SET ${fields.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;
  const res = await q(sql, params);
  return mapChannelRow(res.rows[0]);
}

export async function findAllPreferences(client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM notification_preferences ORDER BY event_type ASC;');
  return res.rows.map(mapPreferenceRow);
}

export async function findPreferencesByEvent(eventType, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM notification_preferences WHERE event_type = $1 AND enabled = true;', [eventType]);
  return res.rows.map(mapPreferenceRow);
}

export async function updatePreference(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const fields = [];
  const params = [id];

  if (updates.minSeverity !== undefined) {
    params.push(updates.minSeverity);
    fields.push(`min_severity = $${params.length}`);
  }
  if (updates.enabled !== undefined) {
    params.push(updates.enabled);
    fields.push(`enabled = $${params.length}`);
  }

  if (fields.length === 0) return null;
  fields.push('updated_at = NOW()');

  const sql = `
    UPDATE notification_preferences
    SET ${fields.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;
  const res = await q(sql, params);
  return mapPreferenceRow(res.rows[0]);
}

export async function createDeliveryRecord(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `notif_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

  const res = await q(
    `INSERT INTO notification_deliveries (
      id, idempotency_key, channel_id, channel_type, event_type,
      incident_id, recipient, payload, status, attempt_count,
      max_attempts, next_retry_at, last_error, sent_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING *;`,
    [
      id,
      data.idempotencyKey,
      data.channelId || null,
      data.channelType,
      data.eventType,
      data.incidentId || null,
      data.recipient || null,
      JSON.stringify(data.payload || {}),
      data.status || 'pending',
      data.attemptCount || 0,
      data.maxAttempts || 3,
      data.nextRetryAt || null,
      data.lastError || null,
      data.sentAt || null
    ]
  );

  return mapDeliveryRow(res.rows[0]);
}

export async function findDeliveryById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM notification_deliveries WHERE id = $1;', [id]);
  return mapDeliveryRow(res.rows[0]);
}

export async function findDeliveryByIdempotencyKey(key, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM notification_deliveries WHERE idempotency_key = $1;', [key]);
  return mapDeliveryRow(res.rows[0]);
}

export async function findDeliveries(filters = {}, client = null) {
  const q = client ? client.query.bind(client) : query;
  const conditions = [];
  const params = [];

  if (filters.incidentId) {
    params.push(filters.incidentId);
    conditions.push(`incident_id = $${params.length}`);
  }
  if (filters.channelType) {
    params.push(filters.channelType);
    conditions.push(`channel_type = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.eventType) {
    params.push(filters.eventType);
    conditions.push(`event_type = $${params.length}`);
  }

  const limit = Math.min(Number(filters.limit) || 50, 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*)::int as total FROM notification_deliveries ${whereClause};`;
  const countRes = await q(countSql, params);
  const total = countRes.rows[0]?.total || 0;

  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  params.push(offset);
  const offsetPlaceholder = `$${params.length}`;

  const dataSql = `
    SELECT * FROM notification_deliveries
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
  `;

  const res = await q(dataSql, params);
  return {
    total,
    limit,
    offset,
    items: res.rows.map(mapDeliveryRow)
  };
}

/**
 * Atomically claims pending or retry-eligible deliveries.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent race conditions across parallel workers.
 */
export async function claimPendingDeliveries(batchSize = 10, client = null) {
  const q = client ? client.query.bind(client) : query;

  const claimSql = `
    WITH eligible AS (
      SELECT id
      FROM notification_deliveries
      WHERE status IN ('pending', 'failed')
        AND attempt_count < max_attempts
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE notification_deliveries
    SET status = 'processing', updated_at = NOW()
    WHERE id IN (SELECT id FROM eligible)
    RETURNING *;
  `;

  const res = await q(claimSql, [batchSize]);
  return res.rows.map(mapDeliveryRow);
}

export async function updateDeliveryStatus(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const fields = ['updated_at = NOW()'];
  const params = [id];

  if (updates.status !== undefined) {
    params.push(updates.status);
    fields.push(`status = $${params.length}`);
  }
  if (updates.attemptCount !== undefined) {
    params.push(updates.attemptCount);
    fields.push(`attempt_count = $${params.length}`);
  }
  if (updates.nextRetryAt !== undefined) {
    params.push(updates.nextRetryAt);
    fields.push(`next_retry_at = $${params.length}`);
  }
  if (updates.lastError !== undefined) {
    params.push(updates.lastError);
    fields.push(`last_error = $${params.length}`);
  }
  if (updates.sentAt !== undefined) {
    params.push(updates.sentAt);
    fields.push(`sent_at = $${params.length}`);
  }

  const sql = `
    UPDATE notification_deliveries
    SET ${fields.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;

  const res = await q(sql, params);
  return mapDeliveryRow(res.rows[0]);
}

