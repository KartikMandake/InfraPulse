import { Router } from 'express';
import * as eventsController from '../controllers/events.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.get('/', authenticate, eventsController.listEvents);
router.post('/ingest', authenticate, requireRole('admin', 'responder'), eventsController.ingestEvent);
router.get('/correlations', authenticate, eventsController.listCorrelations);
router.get('/:eventId', authenticate, eventsController.getEventById);

export default router;

