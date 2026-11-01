import {otlpIdentity,inIngestionTenant,signedIntegrationIdentity} from '../security/ingestionIdentity.js';
/**
 * Enterprise Integrations Controller — InfraPulse Phase 19
 */

import { integrationService } from '../services/integration.service.js';
import { integrationRegistry } from '../integrations/core/IntegrationRegistry.js';
import { integrationRepository } from '../repositories/integration.repository.js';
import { ingestEvent } from '../services/eventNormalizer.service.js';
import { telemetryPipelineService } from '../services/telemetryPipeline.service.js';
import { serviceMappingService } from '../services/serviceMapping.service.js';
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
      const identity=await signedIntegrationIdentity(req,'github');
      const eventType = req.headers['x-github-event'] || 'push';
      const tenantId = identity.tenant_id;

      const result = await inIngestionTenant(identity,()=>integrationService.processWebhook({
        integrationId:identity.id,
        providerKey: 'github',
        eventType,
        payload: req.body,
        rawBody: req.rawBody,
        headers: req.headers,
        tenantId
      }));

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async handleGrafanaWebhook(req, res, next) {
    try {
      const identity=await signedIntegrationIdentity(req,'grafana');
      const tenantId = identity.tenant_id;

      const result = await inIngestionTenant(identity,()=>integrationService.processWebhook({
        integrationId:identity.id,
        providerKey: 'grafana',
        eventType: 'alert',
        payload: req.body,
        rawBody: req.rawBody,
        headers: req.headers,
        tenantId
      }));

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },


  async syncIntegration(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const result = await integrationService.syncIntegration(req.params.id, req.user, tenantId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getTelemetryStats(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const stats = await integrationService.getTelemetryStats(req.params.id, tenantId);
      res.status(200).json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  },

    async getFreshness(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const freshness = await telemetryPipelineService.getTelemetryFreshness(req.params.id, tenantId);
      res.status(200).json({ success: true, data: freshness });
    } catch (err) {
      next(err);
    }
  },

  async getDeadLetters(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const deadLetters = await integrationRepository.listDeadLetters(tenantId, {
        integrationId: req.params.id,
        limit: req.query.limit || 50
      });
      res.status(200).json({ success: true, count: deadLetters.length, data: deadLetters });
    } catch (err) {
      next(err);
    }
  },

  async getObservedDependencies(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const environment = req.query.environment || 'staging';
      const dependencies = await serviceMappingService.getServiceDependencies(tenantId, environment);
      res.status(200).json({ success: true, count: dependencies.length, data: dependencies });
    } catch (err) {
      next(err);
    }
  },

  handleOtlpMetrics(req,res,next){return ingestOtlp(req,res,next,'metric');},
  handleOtlpTraces(req,res,next){return ingestOtlp(req,res,next,'trace');},
  handleOtlpLogs(req,res,next){return ingestOtlp(req,res,next,'log');}
};
async function ingestOtlp(req,res,next,type){
 try{
  const identity=await otlpIdentity(req);
  return await inIngestionTenant(identity,async()=>{
   const provider=integrationRegistry.get('opentelemetry');
   let events;try{events=provider[type==='metric'?'normalizeMetricPayload':type==='trace'?'normalizeTracePayload':'normalizeLogPayload'](req.body);}catch(e){throw ApiError.badRequest(e.message);}
   const environment=identity.environment||identity.config?.environment||'staging';
   events=events.map(event=>({...event,environment,tenantId:identity.tenant_id,telemetryMode:'live',isSimulated:false}));
   const data=await telemetryPipelineService.normalizeAndRouteTelemetry({integrationId:identity.id,tenantId:identity.tenant_id,environment,provider:'opentelemetry',telemetryType:type,events,rawBytes:Buffer.byteLength(req.rawBody||'')});
   res.status(data.rejectedCount&&data.processedCount===0?422:200).json({success:data.rejectedCount===0,ingestedCount:data.processedCount,duplicateCount:data.duplicateCount,data});
  });
 }catch(e){next(e);}
}
