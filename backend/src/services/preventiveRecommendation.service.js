/**
 * Preventive Recommendation Service — InfraPulse Phase 18
 *
 * Full lifecycle management for evidence-grounded preventive engineering recommendations.
 *
 * Strict Lifecycle State Machine:
 *   OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> VERIFIED -> CLOSED
 *   (Any non-closed status can transition to DISMISSED with required rationale)
 *
 * Verification Gate:
 * - Recommendations CANNOT be marked VERIFIED without non-empty verification notes
 *   documenting how the fix was validated (e.g. load test, canary check, runbook execution).
 * - Recommendations CANNOT transition directly from IN_PROGRESS or OPEN to CLOSED.
 *   They MUST first pass through VERIFIED.
 * - Every transition records a durable audit event.
 */

import crypto from 'node:crypto';
import { operationalIntelligenceRepository } from '../repositories/operationalIntelligence.repository.js';
import { recordAuditEvent } from './audit.service.js';
import { ApiError } from '../utils/ApiError.js';

export const RECOMMENDATION_STATUS = {
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  IN_PROGRESS: 'IN_PROGRESS',
  VERIFIED: 'VERIFIED',
  CLOSED: 'CLOSED',
  DISMISSED: 'DISMISSED'
};

const VALID_TRANSITIONS = {
  [RECOMMENDATION_STATUS.OPEN]: [RECOMMENDATION_STATUS.ACKNOWLEDGED, RECOMMENDATION_STATUS.DISMISSED],
  [RECOMMENDATION_STATUS.ACKNOWLEDGED]: [RECOMMENDATION_STATUS.IN_PROGRESS, RECOMMENDATION_STATUS.DISMISSED],
  [RECOMMENDATION_STATUS.IN_PROGRESS]: [RECOMMENDATION_STATUS.VERIFIED, RECOMMENDATION_STATUS.DISMISSED],
  [RECOMMENDATION_STATUS.VERIFIED]: [RECOMMENDATION_STATUS.CLOSED, RECOMMENDATION_STATUS.DISMISSED],
  [RECOMMENDATION_STATUS.CLOSED]: [],
  [RECOMMENDATION_STATUS.DISMISSED]: [RECOMMENDATION_STATUS.OPEN] // Allow re-opening dismissed item
};

export const preventiveRecommendationService = {
  async listRecommendations(filters = {}, tenantId = 'default_tenant') {
    return operationalIntelligenceRepository.getRecommendations({ ...filters, tenantId });
  },

  async getRecommendation(id, tenantId = 'default_tenant') {
    const rec = await operationalIntelligenceRepository.getRecommendationById(id, tenantId);
    if (!rec) {
      throw ApiError.notFound(`Preventive recommendation not found: ${id}`);
    }
    return rec;
  },

  async createRecommendation(data, user, tenantId = 'default_tenant') {
    if (!data.title || !data.serviceId || !data.verificationMethod) {
      throw ApiError.badRequest('Missing required fields: title, serviceId, and verificationMethod are mandatory.');
    }

    const newId = data.id || `REC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const rec = await operationalIntelligenceRepository.createRecommendation({
      id: newId,
      title: data.title,
      explanation: data.explanation || '',
      serviceId: data.serviceId,
      serviceName: data.serviceName || data.serviceId,
      priority: data.priority || 'P2',
      status: RECOMMENDATION_STATUS.OPEN,
      ownerRole: data.ownerRole || 'SRE Reliability Team',
      ownerUserId: data.ownerUserId || (user ? user.id : null),
      expectedBenefit: data.expectedBenefit || 'Reduces recurrence of operational failure pattern.',
      benefitType: data.benefitType || 'qualitative',
      supportingPatternIds: data.supportingPatternIds || [],
      supportingEvidenceRefs: data.supportingEvidenceRefs || [],
      relevantRunbookIds: data.relevantRunbookIds || [],
      verificationMethod: data.verificationMethod,
      verificationNotes: null,
      dismissedReason: null,
      linkedIssueRef: data.linkedIssueRef || null
    }, tenantId);

    await recordAuditEvent({
      actor: user,
      action: 'PREVENTIVE_RECOMMENDATION_CREATED',
      resourceType: 'preventive_recommendation',
      resourceId: rec.id,
      outcome: 'success',
      metadata: { serviceId: rec.serviceId, priority: rec.priority, title: rec.title }
    }).catch(() => {});

    return rec;
  },

  async transitionStatus(id, {
    status: targetStatus,
    verificationNotes,
    dismissedReason,
    ownerUserId,
    linkedIssueRef
  }, user, tenantId = 'default_tenant') {
    const existing = await this.getRecommendation(id, tenantId);
    const currentStatus = existing.status;

    if (!targetStatus || !Object.values(RECOMMENDATION_STATUS).includes(targetStatus)) {
      throw ApiError.badRequest(`Invalid target status: ${targetStatus}. Must be one of: ${Object.values(RECOMMENDATION_STATUS).join(', ')}`);
    }

    if (currentStatus === targetStatus) {
      return existing;
    }

    // Check valid transitions
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw ApiError.badRequest(
        `Invalid status transition from ${currentStatus} to ${targetStatus}. Allowed transitions: ${allowed.join(', ') || 'none'}`
      );
    }

    // Verification Gate: Moving to VERIFIED requires non-empty verification notes
    if (targetStatus === RECOMMENDATION_STATUS.VERIFIED) {
      if (!verificationNotes || typeof verificationNotes !== 'string' || verificationNotes.trim().length < 10) {
        throw ApiError.badRequest(
          'Verification Gate Violation: Recommendations cannot be marked VERIFIED without non-empty verification notes (minimum 10 characters) documenting test results or validation evidence.'
        );
      }
    }

    // Dismissal Gate: Moving to DISMISSED requires non-empty reason
    if (targetStatus === RECOMMENDATION_STATUS.DISMISSED) {
      if (!dismissedReason || typeof dismissedReason !== 'string' || dismissedReason.trim().length < 5) {
        throw ApiError.badRequest(
          'Recommendations cannot be DISMISSED without providing an explicit dismissedReason (minimum 5 characters).'
        );
      }
    }

    // Update repository
    const updated = await operationalIntelligenceRepository.updateRecommendationStatus(id, {
      status: targetStatus,
      verificationNotes: verificationNotes || existing.verificationNotes,
      dismissedReason: dismissedReason || existing.dismissedReason,
      ownerUserId: ownerUserId !== undefined ? ownerUserId : existing.ownerUserId,
      linkedIssueRef: linkedIssueRef !== undefined ? linkedIssueRef : existing.linkedIssueRef
    }, tenantId);

    // Audit log
    await recordAuditEvent({
      actor: user,
      action: 'PREVENTIVE_RECOMMENDATION_TRANSITIONED',
      resourceType: 'preventive_recommendation',
      resourceId: id,
      outcome: 'success',
      metadata: {
        fromStatus: currentStatus,
        toStatus: targetStatus,
        verificationNotesProvided: Boolean(verificationNotes),
        dismissedReasonProvided: Boolean(dismissedReason)
      }
    }).catch(() => {});

    return updated;
  }
};
