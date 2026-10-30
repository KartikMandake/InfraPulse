import { Router } from 'express';
import * as incidentsController from '../controllers/incidents.controller.js';
import * as investigationController from '../controllers/investigation.controller.js';
import * as timelineController from '../controllers/timeline.controller.js';
import * as assistantController from '../controllers/assistant.controller.js';
import * as runbooksController from '../controllers/runbooks.controller.js';
import * as reliabilityController from '../controllers/reliability.controller.js';
import * as eventsController from '../controllers/events.controller.js';
import { requireRole } from '../middleware/authorize.js';
import { requireAuth } from '../middleware/authenticate.js';

const router = Router();

router.get('/', incidentsController.getAllIncidents);
router.post('/', requireRole('admin', 'responder'), incidentsController.createIncident);
router.get('/:incidentId', incidentsController.getIncidentById);
router.patch('/:incidentId', requireRole('admin', 'responder'), incidentsController.updateIncident);

// Nested timeline subroute
router.get('/:incidentId/timeline', timelineController.getIncidentTimeline);

// Nested investigation subroutes
router.get('/:incidentId/investigation', investigationController.getInvestigation);
router.post('/:incidentId/investigation/run', requireRole('admin', 'responder'), investigationController.runInvestigation);

// Nested AI Assistant subroutes
router.post('/:incidentId/assistant/chat', requireAuth, assistantController.chatWithAssistant);
router.get('/:incidentId/assistant/conversations', requireAuth, assistantController.getIncidentConversations);

// Nested Runbook Orchestration subroutes
router.get('/:incidentId/runbooks', runbooksController.getIncidentRunbooks);
router.get('/:incidentId/executions', runbooksController.listIncidentExecutions);
router.post('/:incidentId/runbooks/:runbookId/dry-run', requireAuth, requireRole('admin', 'responder'), runbooksController.dryRunIncidentRunbook);
router.post('/:incidentId/runbooks/:runbookId/executions', requireAuth, requireRole('admin', 'responder'), runbooksController.createIncidentExecution);

// Nested SLO Impact subroute
router.get('/:incidentId/slo-impact', reliabilityController.getIncidentSloImpact);

// Unified Observability & Correlation subroutes (Phase 17)
router.get('/:incidentId/unified-timeline', eventsController.getIncidentUnifiedTimeline);
router.get('/:incidentId/investigation-graph', eventsController.getIncidentInvestigationGraph);
router.get('/:incidentId/correlation-summary', eventsController.getIncidentCorrelationSummary);
router.get('/:incidentId/evidence', eventsController.getIncidentEvidence);

export default router;
