import { Router } from 'express';
import * as notifController from '../controllers/notification.controller.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// View notification configuration (Viewer, Responder, Admin)
router.get('/', requireRole('admin', 'responder', 'viewer'), notifController.getSettings);

// Update notification channels/preferences (Admin only)
router.patch('/', requireRole('admin'), notifController.updateSettings);

export default router;

