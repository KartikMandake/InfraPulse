import { Router } from 'express';
import * as alertsController from '../controllers/alerts.controller.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.get('/', alertsController.getAllAlertRules);
router.post('/', requireRole('admin'), alertsController.createRule);
router.patch('/:ruleId', requireRole('admin'), alertsController.updateRule);

export default router;
