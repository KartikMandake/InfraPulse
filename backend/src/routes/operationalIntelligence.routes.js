/**
 * Operational Intelligence Routes — InfraPulse Phase 18
 */

import { Router } from 'express';
import { operationalIntelligenceController } from '../controllers/operationalIntelligence.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// 1. Dashboard Overview
router.get('/overview', authenticate, operationalIntelligenceController.getOverview);

// 2. Failure Patterns
router.get('/patterns', authenticate, operationalIntelligenceController.getPatterns);
router.post('/patterns/sync', authenticate, requireRole('responder'), operationalIntelligenceController.syncPatterns);
router.get('/patterns/:id', authenticate, operationalIntelligenceController.getPatternById);

// 3. Service Reliability Risk Profiles
router.get('/service-risks', authenticate, operationalIntelligenceController.getServiceRiskProfiles);
router.post('/service-risks/evaluate', authenticate, requireRole('responder'), operationalIntelligenceController.evaluateServiceRiskProfiles);
router.get('/service-risks/:serviceId', authenticate, operationalIntelligenceController.getServiceRiskProfile);

// 4. Early-Warning Signals
router.get('/early-warnings', authenticate, operationalIntelligenceController.getEarlyWarnings);
router.post('/early-warnings/sync', authenticate, requireRole('responder'), operationalIntelligenceController.syncEarlyWarnings);

// 5. Preventive Recommendations Lifecycle
router.get('/recommendations', authenticate, operationalIntelligenceController.getRecommendations);
router.post('/recommendations', authenticate, requireRole('responder'), operationalIntelligenceController.createRecommendation);
router.get('/recommendations/:id', authenticate, operationalIntelligenceController.getRecommendationById);
router.patch('/recommendations/:id/transition', authenticate, requireRole('responder'), operationalIntelligenceController.transitionRecommendationStatus);

// 6. Operational Trends & Snapshots
router.get('/trends', authenticate, operationalIntelligenceController.getTrends);
router.post('/trends/snapshot', authenticate, requireRole('responder'), operationalIntelligenceController.captureTrendSnapshot);

export default router;

