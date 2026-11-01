import * as aiInvestigationService from '../services/aiInvestigation.service.js';
import { ApiError } from '../utils/ApiError.js';

export async function chatWithAssistant(req, res, next) {
  try {
    const { incidentId } = req.params;
    const { message, conversationId, provider } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw ApiError.badRequest('Message is required and cannot be empty.');
    }
    if (message.length > 8192) {
      throw ApiError.badRequest('Message length exceeds maximum permitted limit of 8192 characters.');
    }
    const result = await aiInvestigationService.askAssistant({
      incidentId,
      user: req.user,
      message,
      conversationId,
      providerName: provider
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentConversations(req, res, next) {
  try {
    const { incidentId } = req.params;
    const data = await aiInvestigationService.listIncidentConversations(incidentId, req.user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getConversationById(req, res, next) {
  try {
    const { conversationId } = req.params;
    const data = await aiInvestigationService.getConversationDetails(conversationId, req.user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteConversation(req, res, next) {
  try {
    const { conversationId } = req.params;
    const data = await aiInvestigationService.deleteInvestigationConversation(conversationId, req.user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

