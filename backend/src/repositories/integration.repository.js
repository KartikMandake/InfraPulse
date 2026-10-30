/**
 * Integration Ecosystem Repository — InfraPulse Phase 19
 *
 * PostgreSQL persistence layer for:
 * - Integrations master records
 * - Encrypted integration credentials (AES-256-GCM)
 * - Sync states
 * - Idempotent webhook deliveries
 * - Health transition events
 */

import { query } from '../db/connection.js';

function mapIntegrationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    description: row.description,
    status: row.status,
    enabled: row.enabled,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}),
    lastSyncAt: row.last_sync_at,
    lastSuccessAt: row.last_success_at,
    errorMessage: row.error_message,
    tenantId: row.tenant_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const integrationRepository = {
  // === 1. Integrations ===
  async listIntegrations({ tenantId = 'default_tenant', provider = null, status = null } = {}) {
    let sql = 'SELECT * FROM integrations WHERE tenant_id = $1';
    const params = [tenantId];

    if (provider) {
      params.push(provider);
      sql += ` AND provider = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY created_at ASC';
    const result = await query(sql, params);
    return result.rows.map(mapIntegrationRow);
  },

  async findById(id, tenantId = 'default_tenant') {
    const result = await query(
      'SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return mapIntegrationRow(result.rows[0]);
  },

  async findByProvider(provider, tenantId = 'default_tenant') {
    const result = await query(
      'SELECT * FROM integrations WHERE provider = $1 AND tenant_id = $2 ORDER BY updated_at DESC LIMIT 1',
      [provider, tenantId]
    );
    return mapIntegrationRow(result.rows[0]);
  },

  async create(data, tenantId = 'default_tenant') {
    const result = await query(
      `INSERT INTO integrations (
        id, provider, name, description, status, enabled, config,
        last_sync_at, last_success_at, error_message, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;`,
      [
        data.id, data.provider, data.name, data.description || '',
        data.status || 'DISCONNECTED', data.enabled !== false,
        JSON.stringify(data.config || {}), data.lastSyncAt || null,
        data.lastSuccessAt || null, data.errorMessage || null, tenantId
      ]
    );
    return mapIntegrationRow(result.rows[0]);
  },

  async update(id, updates = {}, tenantId = 'default_tenant') {
    let sql = 'UPDATE integrations SET updated_at = NOW()';
    const params = [];

    if (updates.name !== undefined) {
      params.push(updates.name);
      sql += `, name = $${params.length}`;
    }
    if (updates.description !== undefined) {
      params.push(updates.description);
      sql += `, description = $${params.length}`;
    }
    if (updates.status !== undefined) {
      params.push(updates.status);
      sql += `, status = $${params.length}`;
    }
    if (updates.enabled !== undefined) {
      params.push(updates.enabled);
      sql += `, enabled = $${params.length}`;
    }
    if (updates.config !== undefined) {
      params.push(JSON.stringify(updates.config));
      sql += `, config = $${params.length}`;
    }
    if (updates.lastSyncAt !== undefined) {
      params.push(updates.lastSyncAt);
      sql += `, last_sync_at = $${params.length}`;
    }
    if (updates.lastSuccessAt !== undefined) {
      params.push(updates.lastSuccessAt);
      sql += `, last_success_at = $${params.length}`;
    }
    if (updates.errorMessage !== undefined) {
      params.push(updates.errorMessage);
      sql += `, error_message = $${params.length}`;
    }

    params.push(id, tenantId);
    sql += ` WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *;`;

    const result = await query(sql, params);
    return mapIntegrationRow(result.rows[0]);
  },

  async delete(id, tenantId = 'default_tenant') {
    const result = await query(
      'DELETE FROM integrations WHERE id = $1 AND tenant_id = $2 RETURNING id;',
      [id, tenantId]
    );
    return result.rowCount > 0;
  },

  // === 2. Credentials ===
  async upsertCredentials(integrationId, enc, tenantId = 'default_tenant') {
    const credId = `cred-${integrationId}`;
    const result = await query(
      `INSERT INTO integration_credentials (
        id, integration_id, key_version, encrypted_data, iv, auth_tag, redacted_preview, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        key_version = EXCLUDED.key_version,
        encrypted_data = EXCLUDED.encrypted_data,
        iv = EXCLUDED.iv,
        auth_tag = EXCLUDED.auth_tag,
        redacted_preview = EXCLUDED.redacted_preview,
        updated_at = NOW()
      RETURNING *;`,
      [
        credId, integrationId, enc.keyVersion || 1,
        enc.encryptedData, enc.iv, enc.authTag,
        JSON.stringify(enc.redactedPreview || {}), tenantId
      ]
    );
    return result.rows[0];
  },

  async findCredentials(integrationId, tenantId = 'default_tenant') {
    const result = await query(
      'SELECT * FROM integration_credentials WHERE integration_id = $1 AND tenant_id = $2 LIMIT 1',
      [integrationId, tenantId]
    );
    return result.rows[0] || null;
  },

  // === 3. Webhook Deliveries ===
  async recordWebhookDelivery(del, tenantId = 'default_tenant') {
    const result = await query(
      `INSERT INTO integration_webhook_deliveries (
        id, integration_id, provider, delivery_id, event_type, status,
        retry_count, payload_preview, error_details, processed_at, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING
      RETURNING *;`,
      [
        del.id, del.integrationId || null, del.provider, del.deliveryId || null,
        del.eventType, del.status || 'RECEIVED', del.retryCount || 0,
        JSON.stringify(del.payloadPreview || {}), del.errorDetails || null,
        del.processedAt || null, tenantId
      ]
    );
    return result.rows[0];
  },

  async findDeliveryById(deliveryId, tenantId = 'default_tenant') {
    const result = await query(
      'SELECT * FROM integration_webhook_deliveries WHERE (id = $1 OR delivery_id = $1) AND tenant_id = $2 LIMIT 1',
      [deliveryId, tenantId]
    );
    return result.rows[0] || null;
  },

  async updateDeliveryStatus(deliveryId, status, details = null) {
    const result = await query(
      `UPDATE integration_webhook_deliveries
       SET status = $1, error_details = $2, processed_at = NOW()
       WHERE id = $3 RETURNING *;`,
      [status, details, deliveryId]
    );
    return result.rows[0];
  },

  async listDeliveries(integrationId, tenantId = 'default_tenant', limit = 20) {
    let sql = 'SELECT * FROM integration_webhook_deliveries WHERE tenant_id = $1';
    const params = [tenantId];
    if (integrationId) {
      params.push(integrationId);
      sql += ` AND integration_id = $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length};`;

    const result = await query(sql, params);
    return result.rows;
  },

  // === 4. Health Events ===
  async recordHealthEvent(ev, tenantId = 'default_tenant') {
    const result = await query(
      `INSERT INTO integration_health_events (
        id, integration_id, provider, previous_status, new_status, reason, latency_ms, metadata, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;`,
      [
        ev.id, ev.integrationId, ev.provider, ev.previousStatus || null,
        ev.newStatus, ev.reason, ev.latencyMs || null,
        JSON.stringify(ev.metadata || {}), tenantId
      ]
    );
    return result.rows[0];
  },

  async listHealthEvents(integrationId, tenantId = 'default_tenant', limit = 20) {
    const result = await query(
      `SELECT * FROM integration_health_events
       WHERE integration_id = $1 AND tenant_id = $2
       ORDER BY recorded_at DESC LIMIT $3;`,
      [integrationId, tenantId, limit]
    );
    return result.rows;
  }
};
