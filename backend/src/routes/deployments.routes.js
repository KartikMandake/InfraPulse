import { Router } from 'express';
import * as deploymentsController from '../controllers/deployments.controller.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.get('/', deploymentsController.getAllDeployments);
router.patch('/:deploymentId', requireRole('admin'), deploymentsController.updateDeploymentRecord);

export default router;
