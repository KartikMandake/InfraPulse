/**
 * SRE Intelligence Routes — InfraPulse Phase 23K
 */

import { Router } from 'express';
import { sreIntelligenceController } from '../controllers/sreIntelligence.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Observational & Intelligence endpoints (requireAuth for any logged-in user: viewer, responder, admin)
router.get('/overview', requireAuth, sreIntelligenceController.getOverview);
router.get('/health', requireAuth, sreIntelligenceController.getHealth);
router.get('/predictive-risks', requireAuth, sreIntelligenceController.getPredictiveRisks);
router.get('/slo-summary', requireAuth, sreIntelligenceController.getSloSummary);
router.get('/capacity-optimization', requireAuth, sreIntelligenceController.getCapacityOptimization);
router.get('/recommendations', requireAuth, sreIntelligenceController.getRecommendations);

// Status updates on recommendations (responder / admin)
router.patch('/recommendations/:id/status', requireAuth, requireRole('responder', 'admin'), sreIntelligenceController.updateRecommendationStatus);

export default router;

