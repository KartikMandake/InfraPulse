/**
 * Integration Ecosystem Repository — InfraPulse Phase 19 / Phase 23H
 *
 * PostgreSQL persistence layer for:
 * - Integrations master records with environment & organization scoping
 * - Encrypted integration credentials (AES-256-GCM)
 * - Sync states
 * - Idempotent webhook deliveries
 * - Health transition events
 * - Telemetry ingestion statistics
 */

import crypto from 'crypto';
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
    environment: row.environment || 'staging',
    organizationId: row.organization_id || row.tenant_id || 'default_tenant',
    tenantId: row.tenant_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const integrationRepository = {
  // === 1. Integrations ===
  async listIntegrations({ tenantId = 'default_tenant', organizationId = null, environment = null, provider = null, status = null } = {}) {
    let sql = 'SELECT * FROM integrations WHERE (tenant_id = $1 OR organization_id = $1)';
    const params = [tenantId];

    if (organizationId) {
      params.push(organizationId);
      sql += ` AND organization_id = $${params.length}`;
    }
    if (environment) {
      params.push(environment);
      sql += ` AND environment = $${params.length}`;
    }
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
      'SELECT * FROM integrations WHERE id = $1 AND (tenant_id = $2 OR organization_id = $2)',
      [id, tenantId]
    );
    return mapIntegrationRow(result.rows[0]);
  },

  async findByProvider(provider, tenantId = 'default_tenant') {
    const result = await query(
      'SELECT * FROM integrations WHERE provider = $1 AND (tenant_id = $2 OR organization_id = $2) ORDER BY updated_at DESC LIMIT 1',
      [provider, tenantId]
    );
    return mapIntegrationRow(result.rows[0]);
  },

  async create(data, tenantId = 'default_tenant') {
    const orgId = data.organizationId || data.organization_id || tenantId;
    const env = data.environment || 'staging';

    const result = await query(
      `INSERT INTO integrations (
        id, provider, name, description, status, enabled, config,
        last_sync_at, last_success_at, error_message, tenant_id,
        environment, organization_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;`,
      [
        data.id, data.provider, data.name, data.description || '',
        data.status || 'DISCONNECTED', data.enabled !== false,
        JSON.stringify(data.config || {}), data.lastSyncAt || null,
        data.lastSuccessAt || null, data.errorMessage || null, tenantId,
        env, orgId
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
    if (updates.environment !== undefined) {
      params.push(updates.environment);
      sql += `, environment = $${params.length}`;
    }
    if (updates.organizationId !== undefined || updates.organization_id !== undefined) {
      params.push(updates.organizationId || updates.organization_id);
      sql += `, organization_id = $${params.length}`;
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
    sql += ` WHERE id = $${params.length - 1} AND (tenant_id = $${params.length} OR organization_id = $${params.length}) RETURNING *;`;

    const result = await query(sql, params);
    return mapIntegrationRow(result.rows[0]);
  },

  async delete(id, tenantId = 'default_tenant') {
    const result = await query(
      'DELETE FROM integrations WHERE id = $1 AND (tenant_id = $2 OR organization_id = $2) RETURNING id;',
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
  },

  // === 5. Telemetry Ingestion Stats ===
  async recordTelemetryStats(args = {}) {
    const integrationId = args.integrationId;
    const provider = args.provider || 'opentelemetry';
    const environment = args.environment || 'staging';
    const tenantId = args.tenantId || 'default_tenant';
    const organizationId = args.organizationId || 'default_org';
    const metricsCount = args.metricsCount ?? args.metricsReceived ?? 0;
    const logsCount = args.logsCount ?? args.logsReceived ?? 0;
    const tracesCount = args.tracesCount ?? args.tracesReceived ?? 0;
    const eventsCount = args.eventsCount ?? 0;
    const bytesCount = args.bytesCount ?? args.bytesReceived ?? 0;
    const errorMessage = args.errorMessage ?? args.lastError ?? null;
    const errorCount = args.errorCount ?? args.errorsEncountered ?? (errorMessage ? 1 : 0);

    const eventsRejected = args.eventsRejected ?? args.eventsRejectedCount ?? 0;
    const duplicateEvents = args.duplicateEvents ?? args.duplicateEventsCount ?? 0;
    const latencyMs = args.latencyMs ?? args.processingLatencyMs ?? 0;

    const id = `tstat-${integrationId}`;
    const result = await query(
      `INSERT INTO integration_telemetry_stats (
        id, integration_id, provider, environment, tenant_id, organization_id,
        metrics_ingested_count, logs_ingested_count, traces_ingested_count,
        events_ingested_count, bytes_ingested, last_ingested_at,
        error_count, last_error_message, last_error_at,
        events_rejected_count, duplicate_events_count, avg_processing_latency_ms,
        last_successful_ingestion_at, last_failed_ingestion_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13,
        CASE WHEN $13::text IS NOT NULL THEN NOW() ELSE NULL END,
        $14, $15, $16,
        CASE WHEN $13::text IS NULL THEN NOW() ELSE NULL END,
        CASE WHEN $13::text IS NOT NULL THEN NOW() ELSE NULL END
      )
      ON CONFLICT (id) DO UPDATE SET
        metrics_ingested_count = integration_telemetry_stats.metrics_ingested_count + EXCLUDED.metrics_ingested_count,
        logs_ingested_count = integration_telemetry_stats.logs_ingested_count + EXCLUDED.logs_ingested_count,
        traces_ingested_count = integration_telemetry_stats.traces_ingested_count + EXCLUDED.traces_ingested_count,
        events_ingested_count = integration_telemetry_stats.events_ingested_count + EXCLUDED.events_ingested_count,
        bytes_ingested = integration_telemetry_stats.bytes_ingested + EXCLUDED.bytes_ingested,
        last_ingested_at = NOW(),
        error_count = CASE WHEN EXCLUDED.last_error_message IS NOT NULL THEN integration_telemetry_stats.error_count + 1 ELSE integration_telemetry_stats.error_count END,
        last_error_message = COALESCE(EXCLUDED.last_error_message, integration_telemetry_stats.last_error_message),
        last_error_at = CASE WHEN EXCLUDED.last_error_message IS NOT NULL THEN NOW() ELSE integration_telemetry_stats.last_error_at END,
        events_rejected_count = integration_telemetry_stats.events_rejected_count + EXCLUDED.events_rejected_count,
        duplicate_events_count = integration_telemetry_stats.duplicate_events_count + EXCLUDED.duplicate_events_count,
        avg_processing_latency_ms = CASE
          WHEN EXCLUDED.avg_processing_latency_ms > 0
          THEN ROUND((integration_telemetry_stats.avg_processing_latency_ms + EXCLUDED.avg_processing_latency_ms) / 2.0, 2)
          ELSE integration_telemetry_stats.avg_processing_latency_ms
        END,
        last_successful_ingestion_at = CASE WHEN EXCLUDED.last_error_message IS NULL THEN NOW() ELSE integration_telemetry_stats.last_successful_ingestion_at END,
        last_failed_ingestion_at = CASE WHEN EXCLUDED.last_error_message IS NOT NULL THEN NOW() ELSE integration_telemetry_stats.last_failed_ingestion_at END,
        updated_at = NOW()
      RETURNING *;`,
      [
        id, integrationId, provider, environment, tenantId, organizationId,
        metricsCount, logsCount, tracesCount, eventsCount, bytesCount,
        errorMessage ? 1 : 0, errorMessage,
        eventsRejected, duplicateEvents, latencyMs
      ]
    );
    return result.rows[0];
  },

  async getTelemetryStats(integrationId, tenantId = 'default_tenant') {
    const result = await query(
      `SELECT * FROM integration_telemetry_stats
       WHERE integration_id = $1 AND (tenant_id = $2 OR organization_id = $2);`,
      [integrationId, tenantId]
    );
    return result.rows[0] || null;
  },

  // === 6. Dead-Letter Queue & Reliability Tracking ===
  async recordDeadLetter({
    id,
    integrationId = null,
    tenantId = 'default_tenant',
    environment = 'staging',
    provider = 'unknown',
    telemetryType = 'unknown',
    payload = {},
    errorReason = 'Unknown rejection',
    errorCode = 'INVALID_PAYLOAD'
  }) {
    const recordId = id || `dlq-${crypto.randomBytes(6).toString('hex')}`;
    const result = await query(
      `INSERT INTO telemetry_dead_letter (
        id, integration_id, tenant_id, environment, provider, telemetry_type,
        payload, error_reason, error_code, rejected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *;`,
      [
        recordId, integrationId, tenantId, environment, provider, telemetryType,
        JSON.stringify(payload), errorReason, errorCode
      ]
    );
    return result.rows[0];
  },

  async listDeadLetters(tenantId = 'default_tenant', { integrationId = null, limit = 50 } = {}) {
    let sql = `SELECT * FROM telemetry_dead_letter WHERE tenant_id = $1`;
    const params = [tenantId];
    if (integrationId) {
      params.push(integrationId);
      sql += ` AND integration_id = $2`;
    }
    sql += ` ORDER BY rejected_at DESC LIMIT ${Number(limit) || 50};`;
    const res = await query(sql, params);
    return res.rows;
  }
};
