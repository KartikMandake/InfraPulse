/**
 * Enterprise Integrations Controller — InfraPulse Phase 19
 */

import { integrationService } from '../services/integration.service.js';
import { integrationRegistry } from '../integrations/core/IntegrationRegistry.js';
import { integrationRepository } from '../repositories/integration.repository.js';
import { ingestEvent } from '../services/eventNormalizer.service.js';
import { ApiError } from '../utils/ApiError.js';

export const integrationsController = {
  async listCatalog(req, res, next) {
    try {
      const catalog = integrationRegistry.list();
      res.status(200).json({ success: true, count: catalog.length, data: catalog });
    } catch (err) {
      next(err);
    }
  },

  async listIntegrations(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { provider, status } = req.query;
      const list = await integrationService.listIntegrations({ provider, status }, tenantId);
      res.status(200).json({ success: true, count: list.length, data: list });
    } catch (err) {
      next(err);
    }
  },

  async getIntegrationById(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const item = await integrationService.getIntegrationById(req.params.id, tenantId);
      res.status(200).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  },

  async createIntegration(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const created = await integrationService.createIntegration(req.body, req.user, tenantId);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },

  async updateIntegration(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const updated = await integrationService.updateIntegration(req.params.id, req.body, req.user, tenantId);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  async deleteIntegration(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const result = await integrationService.deleteIntegration(req.params.id, req.user, tenantId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async testConnection(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const result = await integrationService.testConnection(req.params.id, tenantId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getHealth(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const events = await integrationRepository.listHealthEvents(req.params.id, tenantId, 10);
      res.status(200).json({ success: true, count: events.length, data: events });
    } catch (err) {
      next(err);
    }
  },

  async rotateCredentials(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const result = await integrationService.rotateCredentials(req.params.id, req.body.credentials, req.user, tenantId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getDeliveries(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const deliveries = await integrationService.listDeliveries(req.params.id, tenantId);
      res.status(200).json({ success: true, count: deliveries.length, data: deliveries });
    } catch (err) {
      next(err);
    }
  },

  async retryDelivery(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const result = await integrationService.retryWebhookDelivery(req.params.deliveryId, tenantId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // === Provider-Specific Webhook Handlers ===
  async handleGitHubWebhook(req, res, next) {
    try {
      const eventType = req.headers['x-github-event'] || 'push';
      const tenantId = req.query.tenantId || req.user?.tenantId || 'default_tenant';

      const result = await integrationService.processWebhook({
        providerKey: 'github',
        eventType,
        payload: req.body,
        rawBody: req.rawBody,
        headers: req.headers,
        tenantId
      });

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async handleGrafanaWebhook(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.tenantId || 'default_tenant';

      const result = await integrationService.processWebhook({
        providerKey: 'grafana',
        eventType: 'alert',
        payload: req.body,
        rawBody: req.rawBody,
        headers: req.headers,
        tenantId
      });

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // === OTLP Ingestion Handlers ===
  async handleOtlpMetrics(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.tenantId || 'default_tenant';
      const provider = integrationRegistry.get('opentelemetry');

      // Enforce 2MB request payload size
      const bodyBytes = Buffer.byteLength(JSON.stringify(req.body || {}));
      if (bodyBytes > 2097152) {
        throw ApiError.badRequest('OTLP Payload Too Large: Exceeds 2MB limit.');
      }

      // Check auth if configured
      const integration = await integrationRepository.findByProvider('opentelemetry', tenantId);
      if (integration) {
        const credRecord = await integrationRepository.findCredentials(integration.id, tenantId);
        if (credRecord) {
          const authOk = provider.authenticateRequest(req.headers, {
            ingestionKey: credRecord.redacted_preview?.ingestionKey
          });
          if (!authOk) {
            throw ApiError.unauthorized('Invalid or missing OTLP ingestion credentials.');
          }
        }
      }

      const events = provider.normalizeMetricPayload(req.body);
      for (const ev of events) {
        await ingestEvent(ev, tenantId);
      }

      res.status(200).json({ success: true, ingestedCount: events.length });
    } catch (err) {
      next(err);
    }
  },

  async handleOtlpTraces(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.tenantId || 'default_tenant';
      const provider = integrationRegistry.get('opentelemetry');

      const bodyBytes = Buffer.byteLength(JSON.stringify(req.body || {}));
      if (bodyBytes > 2097152) {
        throw ApiError.badRequest('OTLP Payload Too Large: Exceeds 2MB limit.');
      }

      const integration = await integrationRepository.findByProvider('opentelemetry', tenantId);
      if (integration) {
        const credRecord = await integrationRepository.findCredentials(integration.id, tenantId);
        if (credRecord) {
          const authOk = provider.authenticateRequest(req.headers, {
            ingestionKey: credRecord.redacted_preview?.ingestionKey
          });
          if (!authOk) {
            throw ApiError.unauthorized('Invalid or missing OTLP ingestion credentials.');
          }
        }
      }

      const events = provider.normalizeTracePayload(req.body);
      for (const ev of events) {
        await ingestEvent(ev, tenantId);
      }

      res.status(200).json({ success: true, ingestedCount: events.length });
    } catch (err) {
      next(err);
    }
  },

  async handleOtlpLogs(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.tenantId || 'default_tenant';
      const provider = integrationRegistry.get('opentelemetry');

      const bodyBytes = Buffer.byteLength(JSON.stringify(req.body || {}));
      if (bodyBytes > 2097152) {
        throw ApiError.badRequest('OTLP Payload Too Large: Exceeds 2MB limit.');
      }

      const integration = await integrationRepository.findByProvider('opentelemetry', tenantId);
      if (integration) {
        const credRecord = await integrationRepository.findCredentials(integration.id, tenantId);
        if (credRecord) {
          const authOk = provider.authenticateRequest(req.headers, {
            ingestionKey: credRecord.redacted_preview?.ingestionKey
          });
          if (!authOk) {
            throw ApiError.unauthorized('Invalid or missing OTLP ingestion credentials.');
          }
        }
      }

      const events = provider.normalizeLogPayload(req.body);
      for (const ev of events) {
        await ingestEvent(ev, tenantId);
      }

      res.status(200).json({ success: true, ingestedCount: events.length });
    } catch (err) {
      next(err);
    }
  }
};

