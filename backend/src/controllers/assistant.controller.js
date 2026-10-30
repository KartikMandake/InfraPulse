import * as aiInvestigationService from '../services/aiInvestigation.service.js';

export async function chatWithAssistant(req, res, next) {
  try {
    const { incidentId } = req.params;
    const { message, conversationId, provider } = req.body || {};
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

