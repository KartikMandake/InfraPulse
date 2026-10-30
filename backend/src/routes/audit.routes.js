import { Router } from 'express';
import * as auditController from '../controllers/audit.controller.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Only admin users can read security audit logs
router.get('/', requireRole('admin'), auditController.getAuditLogs);

export default router;

