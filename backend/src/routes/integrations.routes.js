/**
 * Enterprise Integrations Routes — InfraPulse Phase 19 & Phase 23H
 */

import { Router } from 'express';
import * as changeController from '../controllers/change.controller.js';
import { integrationsController } from '../controllers/integrations.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Preserved Phase 16 deployment webhook
router.post('/deployments/webhook', changeController.handleDeploymentWebhook);

// External Webhook & Ingestion Endpoints (Authenticated via HMAC / OTLP Bearer Tokens)
router.post('/webhooks/github', integrationsController.handleGitHubWebhook);
router.post('/webhooks/grafana', integrationsController.handleGrafanaWebhook);
router.post('/otlp/v1/metrics', integrationsController.handleOtlpMetrics);
router.post('/otlp/v1/traces', integrationsController.handleOtlpTraces);
router.post('/otlp/v1/logs', integrationsController.handleOtlpLogs);

// Catalog of available ecosystem providers
router.get('/catalog', authenticate, integrationsController.listCatalog);
router.get('/dependencies', authenticate, integrationsController.getObservedDependencies);

// Management Routes (Admin for credentials/lifecycle; Responders for operational status/retries; Viewers read-only)
router.get('/', authenticate, integrationsController.listIntegrations);
router.post('/', authenticate, requireRole('admin'), integrationsController.createIntegration);
router.get('/:id', authenticate, integrationsController.getIntegrationById);
router.patch('/:id', authenticate, requireRole('admin'), integrationsController.updateIntegration);
router.delete('/:id', authenticate, requireRole('admin'), integrationsController.deleteIntegration);
router.post('/:id/test', authenticate, requireRole('admin'), integrationsController.testConnection);
router.post('/:id/sync', authenticate, requireRole('responder', 'admin'), integrationsController.syncIntegration);
router.get('/:id/stats', authenticate, integrationsController.getTelemetryStats);
router.get('/:id/freshness', authenticate, integrationsController.getFreshness);
router.get('/:id/dead-letter', authenticate, integrationsController.getDeadLetters);
router.get('/:id/health', authenticate, integrationsController.getHealth);
router.post('/:id/rotate-credentials', authenticate, requireRole('admin'), integrationsController.rotateCredentials);
router.get('/:id/deliveries', authenticate, integrationsController.getDeliveries);
router.post('/:id/retry/:deliveryId', authenticate, requireRole('admin', 'responder'), integrationsController.retryDelivery);

export default router;
