import { Router } from 'express';
import * as reliabilityController from '../controllers/reliability.controller.js';
import * as changeController from '../controllers/change.controller.js';

const router = Router();

router.get('/overview', reliabilityController.getReliabilityOverview);
router.get('/change-intelligence', changeController.getChangeIntelligenceOverview);

export default router;

