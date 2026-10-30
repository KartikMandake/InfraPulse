import { Router } from 'express';
import * as executionsController from '../controllers/runbookExecutions.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Execution lifecycle endpoints
router.get('/:executionId', requireAuth, executionsController.getExecutionById);
router.get('/:executionId/logs', requireAuth, executionsController.getExecutionLogs);

// Approval endpoints (Responders & Admins, Viewers rejected)
router.post('/:executionId/request-approval', requireAuth, requireRole('admin', 'responder'), executionsController.requestApproval);
router.post('/:executionId/approve', requireAuth, requireRole('admin', 'responder'), executionsController.approveExecution);
router.post('/:executionId/reject', requireAuth, requireRole('admin', 'responder'), executionsController.rejectExecution);

// Execution trigger and cancellation
router.post('/:executionId/execute', requireAuth, requireRole('admin', 'responder'), executionsController.executeRunbook);
router.post('/:executionId/cancel', requireAuth, requireRole('admin', 'responder'), executionsController.cancelExecution);

export default router;

