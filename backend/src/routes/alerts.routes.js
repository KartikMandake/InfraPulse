import { Router } from 'express';
import * as alertsController from '../controllers/alerts.controller.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Evaluation
router.post('/evaluate', requireRole('admin', 'responder'), alertsController.evaluateAlerts);

// Alert list & details (viewable by all authenticated users or public demo)
router.get('/', alertsController.getAllAlerts);
router.get('/:alertId', alertsController.getAlertDetails);

// Lifecycle actions: responder or admin only
router.patch('/:alertId/acknowledge', requireRole('admin', 'responder'), alertsController.acknowledgeAlert);
router.patch('/:alertId/resolve', requireRole('admin', 'responder'), alertsController.resolveAlert);
router.patch('/:alertId', requireRole('admin', 'responder'), alertsController.updateAlertState);

// Alert rules under /api/alerts/rules as convenience
router.get('/rules/all', alertsController.getAllAlertRules);

export default router;
