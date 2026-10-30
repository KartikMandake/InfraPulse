import { Router } from 'express';
import * as servicesController from '../controllers/services.controller.js';
import * as reliabilityController from '../controllers/reliability.controller.js';
import * as changeController from '../controllers/change.controller.js';
import * as eventsController from '../controllers/events.controller.js';

const router = Router();

router.get('/', servicesController.getAllServices);
router.get('/:serviceId', servicesController.getServiceById);
router.patch('/:serviceId', servicesController.updateService);
router.get('/:serviceId/reliability', reliabilityController.getServiceReliability);
router.get('/:serviceId/change-history', changeController.getServiceChangeHistory);
router.get('/:serviceId/event-history', eventsController.getServiceEventHistory);

export default router;

