import { Router } from 'express';
import * as notifController from '../controllers/notification.controller.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Delivery history (Viewer, Responder, Admin)
router.get('/', requireRole('admin', 'responder', 'viewer'), notifController.getNotifications);

// Test notification delivery (Admin only)
router.post('/test', requireRole('admin'), notifController.sendTest);

// Single delivery details
router.get('/:notificationId', requireRole('admin', 'responder', 'viewer'), notifController.getNotificationById);

// Manual delivery retry (Responder or Admin)
router.post('/:notificationId/retry', requireRole('admin', 'responder'), notifController.retryNotification);

export default router;

