import { Router } from 'express';
import * as assistantController from '../controllers/assistant.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Conversation level endpoints
router.get('/conversations/:conversationId', requireAuth, assistantController.getConversationById);
router.delete('/conversations/:conversationId', requireAuth, requireRole('admin', 'responder'), assistantController.deleteConversation);

export default router;

