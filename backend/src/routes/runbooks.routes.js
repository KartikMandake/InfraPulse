import { Router } from 'express';
import * as runbooksController from '../controllers/runbooks.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Catalog endpoints
router.get('/', runbooksController.listRunbooks);
router.get('/:runbookId', runbooksController.getRunbookById);

// Admin-only management endpoints
router.post('/', requireAuth, requireRole('admin'), runbooksController.createRunbook);
router.patch('/:runbookId', requireAuth, requireRole('admin'), runbooksController.updateRunbook);

export default router;

