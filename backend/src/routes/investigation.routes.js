import { Router } from 'express';
import * as investigationController from '../controllers/investigation.controller.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.get('/:incidentId', investigationController.getInvestigation);
router.post('/:incidentId/run', requireRole('admin', 'responder'), investigationController.runInvestigation);

export default router;

