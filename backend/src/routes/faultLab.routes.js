import { Router } from 'express';
import * as faultLabController from '../controllers/faultLab.controller.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.get('/scenarios', faultLabController.getScenarios);
router.post('/simulations', requireRole('admin', 'responder'), faultLabController.createSimulation);
router.get('/simulations/:simulationId', faultLabController.getSimulation);
router.post('/simulations/:simulationId/investigate', requireRole('admin', 'responder'), faultLabController.investigateSimulation);
router.post('/simulations/:simulationId/reset', requireRole('admin', 'responder'), faultLabController.resetSimulation);

export default router;
