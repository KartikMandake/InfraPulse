import { Router } from 'express';
import * as assistantController from '../controllers/assistant.controller.js';
import { requireAuth } from '../middleware/authenticate.js';

const router = Router();

// Conversation level endpoints
router.get('/conversations/:conversationId', requireAuth, assistantController.getConversationById);
router.delete('/conversations/:conversationId', requireAuth, assistantController.deleteConversation);

export default router;

