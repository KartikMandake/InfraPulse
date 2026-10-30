import { Router } from 'express';
import * as investigationController from '../controllers/investigation.controller.js';

const router = Router();

router.get('/:incidentId', investigationController.getInvestigation);
router.post('/:incidentId/run', investigationController.runInvestigation);

export default router;

