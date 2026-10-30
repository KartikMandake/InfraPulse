import { getAiProvider } from '../integrations/ai/aiProviderFactory.js';
import { buildEvidenceContext } from './aiContext.service.js';
import { findIncidentById } from './incidents.service.js';
import { getIncidentInvestigation } from './investigation.service.js';
import { buildIncidentTimeline } from './timeline.service.js';
import * as servicesRepo from '../repositories/services.repository.js';
import * as alertsRepo from '../repositories/alerts.repository.js';
import * as deploymentsRepo from '../repositories/deployments.repository.js';
import * as assistantRepo from '../repositories/assistant.repository.js';
import * as runbooksRepo from '../repositories/runbooks.repository.js';
import * as changeRepo from '../repositories/change.repository.js';
import * as eventsRepo from '../repositories/events.repository.js';
import { recordAuditEvent } from './audit.service.js';
import { ApiError } from '../utils/ApiError.js';

export async function askAssistant({ incidentId, user, message, conversationId = null, providerName = null }) {
  if (!incidentId) throw ApiError.badRequest('incidentId is required.');
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw ApiError.badRequest('Question message is required.');
  }

  // 1. Verify incident exists
  const incident = await findIncidentById(incidentId);

  // 2. Resolve or create conversation session
  let conversation = null;
  if (conversationId) {
    conversation = await assistantRepo.findConversationById(conversationId);
    if (!conversation) throw ApiError.notFound(`Conversation "${conversationId}" not found.`);
    // Security: Check conversation belongs to same incident
    if (conversation.incidentId !== incidentId) {
      throw ApiError.badRequest('Conversation does not match target incident.');
    }
  } else {
    conversation = await assistantRepo.createConversation({
      incidentId,
      userId: user?.id || 'usr_viewer_003',
      title: message.slice(0, 60),
      provider: providerName || process.env.AI_PROVIDER || 'mock'
    });
  }

  // 3. Save incoming user message
  await assistantRepo.createMessage({
    conversationId: conversation.id,
    senderRole: 'user',
    content: message
  });

  // 4. Load latest investigation, topology, and alerts
  let timeline = { events: [] };
  try {
    timeline = buildIncidentTimeline(incidentId) || { events: [] };
  } catch (err) {
    timeline = { events: [] };
  }

  const [investigation, services, alerts, deployments, runbooks, changes, regressions, normalizedEvents] = await Promise.all([
    getIncidentInvestigation(incidentId),
    servicesRepo.findAllServices().catch(() => []),
    alertsRepo.findAllAlerts().catch(() => []),
    deploymentsRepo.findAllDeployments().catch(() => []),
    runbooksRepo.findAllRunbooks({ enabled: true }).catch(() => []),
    changeRepo.listChangeEvents({ limit: 10 }).catch(() => []),
    changeRepo.findRegressionsByServiceId(incident.serviceId).catch(() => []),
    eventsRepo.listNormalizedEvents({ relatedIncidentId: incidentId, limit: 10 }).catch(() => [])
  ]);

  // 5. Build bounded, redacted evidence context
  const evidenceContext = buildEvidenceContext({
    incident,
    investigation,
    services,
    alerts,
    deployments,
    timelineEvents: timeline.events || [],
    runbooks,
    changes,
    regressions,
    normalizedEvents
  });

  // 6. Invoke configured AI Provider
  const provider = getAiProvider(providerName || conversation.provider);
  let rawAiResult;
  try {
    rawAiResult = await provider.generateInvestigationResponse({
      prompt: message,
      evidenceContext,
      options: { maxTokens: 1000 }
    });
  } catch (err) {
    console.error('[AiInvestigationService] Provider invocation failure:', err.message);
    // Graceful fallback response when provider fails or times out
    rawAiResult = {
      answer: `The AI provider (${provider.name}) is temporarily unavailable (${err.message}). ` +
              `Deterministic RCA hypotheses and telemetry evidence remain active and accessible below.`,
      summary: 'AI Provider unavailable; falling back to deterministic RCA results.',
      referencedEvidence: [],
      supportingSignals: [],
      contradictorySignals: [],
      uncertainties: ['AI Provider connection failure'],
      suggestedDiagnostics: [{
        action: 'Review deterministic hypothesis ranking on the left panel',
        reason: 'Fallback to deterministic evaluation',
        service: incident.serviceName,
        motivatingEvidence: 'fallback',
        expectedInformationGained: 'Deterministic root cause candidates'
      }],
      requiresHumanVerification: true
    };
  }

  // 7. Validate and sanitize structured response
  const validEvidenceIds = new Set((evidenceContext.evidenceCatalog || []).map(e => e.id));
  const validatedReferences = (rawAiResult.referencedEvidence || []).filter(id => validEvidenceIds.has(id));

  const structuredResponse = {
    answer: String(rawAiResult.answer || 'No analysis available.'),
    summary: String(rawAiResult.summary || 'Summary unavailable.'),
    referencedEvidence: validatedReferences,
    supportingSignals: Array.isArray(rawAiResult.supportingSignals) ? rawAiResult.supportingSignals : [],
    contradictorySignals: Array.isArray(rawAiResult.contradictorySignals) ? rawAiResult.contradictorySignals : [],
    uncertainties: Array.isArray(rawAiResult.uncertainties) ? rawAiResult.uncertainties : [],
    suggestedDiagnostics: Array.isArray(rawAiResult.suggestedDiagnostics) ? rawAiResult.suggestedDiagnostics : [],
    requiresHumanVerification: true
  };

  // 8. Persist assistant reply in PostgreSQL
  const savedReply = await assistantRepo.createMessage({
    conversationId: conversation.id,
    senderRole: 'assistant',
    content: structuredResponse.answer,
    structuredResponse,
    referencedEvidence: structuredResponse.referencedEvidence,
    supportingSignals: structuredResponse.supportingSignals,
    contradictorySignals: structuredResponse.contradictorySignals,
    uncertainties: structuredResponse.uncertainties,
    suggestedDiagnostics: structuredResponse.suggestedDiagnostics,
    requiresHumanVerification: true
  });

  // 9. Audit event recording
  await recordAuditEvent({
    actor: user,
    action: 'ASSISTANT_QUERY',
    resourceType: 'assistant_conversation',
    resourceId: conversation.id,
    outcome: 'success',
    metadata: { incidentId, promptLength: message.length, provider: provider.name }
  }).catch(() => {});

  return {
    conversationId: conversation.id,
    message: savedReply,
    evidenceCatalog: evidenceContext.evidenceCatalog
  };
}

export async function listIncidentConversations(incidentId, user) {
  return assistantRepo.findConversationsByIncident(incidentId, user?.role === 'admin' ? null : user?.id);
}

export async function getConversationDetails(conversationId, user) {
  const conversation = await assistantRepo.findConversationById(conversationId);
  if (!conversation) throw ApiError.notFound('Conversation not found.');

  // Access check: Only owner or admin/responder
  if (user?.role !== 'admin' && user?.role !== 'responder' && conversation.userId !== user?.id) {
    throw ApiError.forbidden('You do not have access to this investigation conversation.');
  }

  const messages = await assistantRepo.findMessagesByConversation(conversationId);
  return { conversation, messages };
}

export async function deleteInvestigationConversation(conversationId, user) {
  const conversation = await assistantRepo.findConversationById(conversationId);
  if (!conversation) throw ApiError.notFound('Conversation not found.');

  if (user?.role !== 'admin' && conversation.userId !== user?.id) {
    throw ApiError.forbidden('You cannot delete another user conversation.');
  }

  await assistantRepo.deleteConversation(conversationId);
  await logAuditEvent({
    actor: user,
    action: 'ASSISTANT_CONVERSATION_DELETED',
    resourceType: 'assistant_conversation',
    resourceId: conversationId,
    outcome: 'success',
    metadata: { incidentId: conversation.incidentId }
  });

  return { success: true };
}
