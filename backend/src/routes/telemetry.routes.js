import { Router } from 'express';
import * as telemetryController from '../controllers/telemetry.controller.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Backward-compatible baseline telemetry endpoint
router.get('/', telemetryController.getTelemetry);

// Dedicated datasource endpoints
router.get('/status', telemetryController.getStatus);
router.post('/mode', requireRole('admin'), telemetryController.setMode);
router.get('/metrics', telemetryController.getMetrics);
router.get('/traces', telemetryController.getTraces);
router.get('/logs', telemetryController.getLogs);

export default router;
