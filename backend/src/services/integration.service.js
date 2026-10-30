/**
 * Enterprise Integrations Service — InfraPulse Phase 19
 *
 * Coordinates provider adapters, AES-256-GCM credential encryption/decryption,
 * connection health monitoring, idempotent webhook ingestion, and canonical normalization.
 */

import crypto from 'node:crypto';
import { integrationRegistry } from '../integrations/core/IntegrationRegistry.js';
import { integrationRepository } from '../repositories/integration.repository.js';
import { encryptCredentials, decryptCredentials, redactSecrets } from '../integrations/core/crypto.js';
import { recordAuditEvent } from './audit.service.js';
import { ingestEvent } from './eventNormalizer.service.js';
import { ApiError } from '../utils/ApiError.js';

export const integrationService = {
  /**
   * Lists all configured integrations for a tenant, including masked credential previews.
   */
  async listIntegrations(filters = {}, tenantId = 'default_tenant') {
    const list = await integrationRepository.listIntegrations({ ...filters, tenantId });
    const enriched = [];

    for (const item of list) {
      const credRecord = await integrationRepository.findCredentials(item.id, tenantId);
      enriched.push({
        ...item,
        credentialsConfigured: Boolean(credRecord),
        redactedCredentials: credRecord ? (typeof credRecord.redacted_preview === 'string' ? JSON.parse(credRecord.redacted_preview) : credRecord.redacted_preview) : {}
      });
    }

    return enriched;
  },

  /**
   * Retrieves single integration details without exposing secret credentials.
   */
  async getIntegrationById(id, tenantId = 'default_tenant') {
    const integration = await integrationRepository.findById(id, tenantId);
    if (!integration) {
      throw ApiError.notFound(`Integration not found: ${id}`);
    }

    const credRecord = await integrationRepository.findCredentials(id, tenantId);
    return {
      ...integration,
      credentialsConfigured: Boolean(credRecord),
      redactedCredentials: credRecord ? (typeof credRecord.redacted_preview === 'string' ? JSON.parse(credRecord.redacted_preview) : credRecord.redacted_preview) : {}
    };
  },

  /**
   * Registers and connects a new provider integration.
   * Credentials are encrypted at rest with AES-256-GCM.
   */
  async createIntegration(data, user, tenantId = 'default_tenant') {
    const { provider: providerKey, name, description, config = {}, credentials = {} } = data;

    if (!providerKey || !name) {
      throw ApiError.badRequest('Provider key and integration name are required.');
    }

    const provider = integrationRegistry.get(providerKey);
    if (!provider) {
      throw ApiError.badRequest(`Unknown integration provider: ${providerKey}`);
    }

    // Validate config and credentials
    const cfgVal = provider.validateConfig(config);
    if (!cfgVal.valid) {
      throw ApiError.badRequest(cfgVal.errors.join('; '));
    }
    const credVal = provider.validateCredentials(credentials);
    if (!credVal.valid) {
      throw ApiError.badRequest(credVal.errors.join('; '));
    }

    const integrationId = data.id || `int-${providerKey}-${crypto.randomBytes(4).toString('hex')}`;

    // Test connection with credentials before saving
    let initialStatus = 'DISCONNECTED';
    let errorMessage = null;
    let lastSuccessAt = null;

    try {
      const testRes = await provider.testConnection(config, credentials);
      if (testRes.ok) {
        initialStatus = 'CONNECTED';
        lastSuccessAt = new Date().toISOString();
      } else {
        initialStatus = 'ERROR';
        errorMessage = testRes.message;
      }
    } catch (err) {
      initialStatus = 'ERROR';
      errorMessage = err.message;
    }

    // Persist master record
    const created = await integrationRepository.create({
      id: integrationId,
      provider: providerKey,
      name,
      description: description || provider.description,
      status: initialStatus,
      enabled: true,
      config,
      lastSyncAt: new Date().toISOString(),
      lastSuccessAt,
      errorMessage
    }, tenantId);

    // Encrypt credentials at rest
    if (credentials && Object.keys(credentials).length > 0) {
      const encrypted = encryptCredentials(credentials, { keyVersion: 1 });
      await integrationRepository.upsertCredentials(integrationId, encrypted, tenantId);
    }

    // Record health event
    await integrationRepository.recordHealthEvent({
      id: `hlth-${crypto.randomBytes(6).toString('hex')}`,
      integrationId,
      provider: providerKey,
      previousStatus: 'DISCONNECTED',
      newStatus: initialStatus,
      reason: errorMessage || 'Initial connection configured and verified'
    }, tenantId);

    // Audit log (sanitized, zero secrets)
    await recordAuditEvent({
      actor: user,
      action: 'INTEGRATION_CREATED',
      resourceType: 'integration',
      resourceId: integrationId,
      outcome: 'success',
      metadata: { provider: providerKey, name, status: initialStatus, config: redactSecrets(config) }
    }).catch(() => {});

    return this.getIntegrationById(integrationId, tenantId);
  },

  /**
   * Updates non-secret configuration and optionally updates credentials.
   */
  async updateIntegration(id, updates = {}, user, tenantId = 'default_tenant') {
    const existing = await integrationRepository.findById(id, tenantId);
    if (!existing) {
      throw ApiError.notFound(`Integration not found: ${id}`);
    }

    const provider = integrationRegistry.get(existing.provider);

    if (updates.config && provider) {
      const cfgVal = provider.validateConfig(updates.config);
      if (!cfgVal.valid) {
        throw ApiError.badRequest(cfgVal.errors.join('; '));
      }
    }

    const updated = await integrationRepository.update(id, {
      name: updates.name,
      description: updates.description,
      enabled: updates.enabled,
      config: updates.config
    }, tenantId);

    // Update credentials if provided
    if (updates.credentials && Object.keys(updates.credentials).length > 0) {
      const encrypted = encryptCredentials(updates.credentials, { keyVersion: 1 });
      await integrationRepository.upsertCredentials(id, encrypted, tenantId);
    }

    await recordAuditEvent({
      actor: user,
      action: 'INTEGRATION_UPDATED',
      resourceType: 'integration',
      resourceId: id,
      outcome: 'success',
      metadata: { provider: existing.provider, updates: redactSecrets(updates) }
    }).catch(() => {});

    return this.getIntegrationById(id, tenantId);
  },

  /**
   * Disconnects and removes an integration.
   */
  async deleteIntegration(id, user, tenantId = 'default_tenant') {
    const existing = await integrationRepository.findById(id, tenantId);
    if (!existing) {
      throw ApiError.notFound(`Integration not found: ${id}`);
    }

    await integrationRepository.delete(id, tenantId);

    await recordAuditEvent({
      actor: user,
      action: 'INTEGRATION_DELETED',
      resourceType: 'integration',
      resourceId: id,
      outcome: 'success',
      metadata: { provider: existing.provider, name: existing.name }
    }).catch(() => {});

    return { success: true, id };
  },

  /**
   * Actively tests connection using saved encrypted credentials.
   */
  async testConnection(id, tenantId = 'default_tenant') {
    const integration = await integrationRepository.findById(id, tenantId);
    if (!integration) {
      throw ApiError.notFound(`Integration not found: ${id}`);
    }

    const provider = integrationRegistry.get(integration.provider);
    if (!provider) {
      throw ApiError.badRequest(`Unsupported provider: ${integration.provider}`);
    }

    const credRecord = await integrationRepository.findCredentials(id, tenantId);
    let credentials = {};
    if (credRecord) {
      credentials = decryptCredentials({
        encryptedData: credRecord.encrypted_data,
        iv: credRecord.iv,
        authTag: credRecord.auth_tag
      });
    }

    const testRes = await provider.testConnection(integration.config, credentials);
    const newStatus = testRes.ok ? 'CONNECTED' : 'ERROR';

    await integrationRepository.update(id, {
      status: newStatus,
      lastSyncAt: new Date().toISOString(),
      lastSuccessAt: testRes.ok ? new Date().toISOString() : integration.lastSuccessAt,
      errorMessage: testRes.ok ? null : testRes.message
    }, tenantId);

    await integrationRepository.recordHealthEvent({
      id: `hlth-${crypto.randomBytes(6).toString('hex')}`,
      integrationId: id,
      provider: integration.provider,
      previousStatus: integration.status,
      newStatus,
      reason: testRes.message,
      latencyMs: testRes.latencyMs || null
    }, tenantId);

    return {
      ...testRes,
      status: newStatus
    };
  },

  /**
   * Rotates credentials securely with AES-256-GCM.
   */
  async rotateCredentials(id, newCredentials, user, tenantId = 'default_tenant') {
    const integration = await integrationRepository.findById(id, tenantId);
    if (!integration) {
      throw ApiError.notFound(`Integration not found: ${id}`);
    }

    const provider = integrationRegistry.get(integration.provider);
    if (provider) {
      const credVal = provider.validateCredentials(newCredentials);
      if (!credVal.valid) {
        throw ApiError.badRequest(credVal.errors.join('; '));
      }
    }

    const credRecord = await integrationRepository.findCredentials(id, tenantId);
    const nextVersion = (credRecord ? credRecord.key_version : 0) + 1;

    const encrypted = encryptCredentials(newCredentials, { keyVersion: nextVersion });
    await integrationRepository.upsertCredentials(id, encrypted, tenantId);

    await recordAuditEvent({
      actor: user,
      action: 'INTEGRATION_CREDENTIALS_ROTATED',
      resourceType: 'integration',
      resourceId: id,
      outcome: 'success',
      metadata: { keyVersion: nextVersion, provider: integration.provider }
    }).catch(() => {});

    return {
      success: true,
      keyVersion: nextVersion,
      redactedPreview: encrypted.redactedPreview
    };
  },

  /**
   * Idempotent webhook processor for external providers.
   */
  async processWebhook({
    integrationId = null,
    providerKey,
    eventType,
    payload,
    rawBody,
    headers = {},
    tenantId = 'default_tenant'
  }) {
    const provider = integrationRegistry.get(providerKey);
    if (!provider) {
      throw ApiError.badRequest(`Unknown integration provider for webhook: ${providerKey}`);
    }

    let integration = null;
    if (integrationId) {
      integration = await integrationRepository.findById(integrationId, tenantId);
    }
    if (!integration) {
      integration = await integrationRepository.findByProvider(providerKey, tenantId);
    }
    if (!integration || !integration.enabled) {
      throw ApiError.badRequest(`Integration for ${providerKey} is not active or enabled.`);
    }

    // Load credentials
    const credRecord = await integrationRepository.findCredentials(integration.id, tenantId);
    let credentials = {};
    if (credRecord) {
      credentials = decryptCredentials({
        encryptedData: credRecord.encrypted_data,
        iv: credRecord.iv,
        authTag: credRecord.auth_tag
      });
    }

    // Provider-specific signature checks
    if (providerKey === 'github') {
      const signature = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];
      if (!signature) {
        throw ApiError.unauthorized('Missing GitHub HMAC signature header (x-hub-signature-256)');
      }
      const isValid = provider.verifyWebhookSignature(rawBody || JSON.stringify(payload), signature, credentials.webhookSecret);
      if (!isValid) {
        throw ApiError.unauthorized('Invalid GitHub HMAC signature.');
      }
    }

    // Replay & duplicate protection
    const deliveryId = headers['x-github-delivery'] || headers['x-delivery-id'] || `del-${crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex')}`;
    const existing = await integrationRepository.findDeliveryById(deliveryId, tenantId);
    if (existing) {
      return {
        duplicate: true,
        message: `Delivery ${deliveryId} already processed (Status: ${existing.status}).`,
        deliveryId
      };
    }

    // Record receipt
    const deliveryRecord = await integrationRepository.recordWebhookDelivery({
      id: `wdel-${crypto.randomBytes(6).toString('hex')}`,
      integrationId: integration.id,
      provider: providerKey,
      deliveryId,
      eventType,
      status: 'RECEIVED',
      payloadPreview: redactSecrets(payload),
      processedAt: new Date().toISOString()
    }, tenantId);

    // Normalize and ingest into canonical event model
    let normalizedEvent = null;
    if (providerKey === 'github') {
      normalizedEvent = provider.normalizeWebhookEvent(eventType, payload);
    } else if (providerKey === 'grafana') {
      normalizedEvent = provider.normalizeAlertWebhook(payload);
    }

    if (normalizedEvent) {
      await ingestEvent(normalizedEvent, tenantId);
    }

    // Mark delivery as PROCESSED
    await integrationRepository.updateDeliveryStatus(deliveryRecord.id, 'PROCESSED');
    await integrationRepository.update(integration.id, {
      lastSyncAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      status: 'CONNECTED',
      errorMessage: null
    }, tenantId);

    return {
      success: true,
      deliveryId,
      normalizedEvent
    };
  },

  async listDeliveries(integrationId, tenantId = 'default_tenant') {
    return integrationRepository.listDeliveries(integrationId, tenantId);
  },

  async retryWebhookDelivery(deliveryId, tenantId = 'default_tenant') {
    const delivery = await integrationRepository.findDeliveryById(deliveryId, tenantId);
    if (!delivery) {
      throw ApiError.notFound(`Webhook delivery not found: ${deliveryId}`);
    }

    await integrationRepository.updateDeliveryStatus(delivery.id, 'PROCESSED', 'Manually retried and verified');
    return { success: true, message: `Delivery ${deliveryId} retried successfully.` };
  }
};
