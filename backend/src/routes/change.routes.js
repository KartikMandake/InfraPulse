import { Router } from 'express';
import * as changeController from '../controllers/change.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Change Events & Assessments
router.get('/', authenticate, changeController.listChanges);
router.post('/', authenticate, requireRole('responder'), changeController.createChange);
router.post('/assess', authenticate, changeController.assessProposedChange);
router.get('/:changeId', authenticate, changeController.getChangeById);
router.get('/:changeId/assessment', authenticate, changeController.getChangeAssessment);
router.get('/:changeId/blast-radius', authenticate, changeController.getChangeBlastRadius);
router.get('/:changeId/regressions', authenticate, changeController.getChangeRegressions);
router.post('/:changeId/evaluate-regression', authenticate, requireRole('responder'), changeController.evaluateChangeRegression);

export default router;

