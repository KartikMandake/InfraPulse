import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Public auth endpoints
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

// Session inspect
router.get('/me', requireAuth, authController.getMe);
router.post('/revoke-sessions', requireAuth, authController.revokeSessions);

// User administration (Admin only)
router.get('/users', requireRole('admin'), authController.listUsers);
router.patch('/users/:id/role', requireRole('admin'), authController.updateUserRole);

export default router;

