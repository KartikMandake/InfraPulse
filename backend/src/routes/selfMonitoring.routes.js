import { Router } from 'express';
import { getMetrics, getOverview, getAlerts, getSlos } from '../controllers/selfMonitoring.controller.js';

const router = Router();

router.get('/metrics', getMetrics);
router.get('/overview', getOverview);
router.get('/alerts', getAlerts);
router.get('/slos', getSlos);

export default router;

