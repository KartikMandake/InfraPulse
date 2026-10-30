import { Router } from 'express';
import * as sloController from '../controllers/slo.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Public / Authenticated read endpoints
router.get('/', sloController.listSlos);
router.get('/:sloId', sloController.getSloById);
router.get('/:sloId/error-budget', sloController.getErrorBudget);
router.get('/:sloId/burn-rate', sloController.getBurnRate);

// Management & Evaluation endpoints
router.post('/', requireAuth, requireRole('admin', 'responder'), sloController.createSlo);
router.patch('/:sloId', requireAuth, requireRole('admin', 'responder'), sloController.updateSlo);
router.delete('/:sloId', requireAuth, requireRole('admin'), sloController.deleteSlo);
router.post('/:sloId/evaluate', requireAuth, requireRole('admin', 'responder'), sloController.evaluateSlo);

export default router;

