import crypto from 'node:crypto';
import {tenantContext} from '../security/tenantContext.js';
import * as changeRepo from '../repositories/change.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import * as sloRepo from '../repositories/slo.repository.js';
import * as incidentsRepo from '../repositories/incidents.repository.js';
import * as alertsRepo from '../repositories/alerts.repository.js';
import { initialServices } from '../data/services.js';
import { initialDeployments } from '../data/deployments.js';
import { calculateDeploymentRisk } from '../engine/changeRiskEngine.js';
import { calculateBlastRadius } from '../engine/blastRadiusEngine.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAuditEvent } from './audit.service.js';

async function fetchContext(serviceId) {
  let allServices = [];
  try {
    allServices = await servicesRepo.findAllServices();
  } catch (err) {
    if(tenantContext())throw err;
    allServices = initialServices;
  }
  if (!allServices || allServices.length === 0) allServices = tenantContext()?[]:initialServices;

  let targetService = allServices.find(s => s.id === serviceId);
  if (!targetService) {
    try {
      targetService = await servicesRepo.findServiceById(serviceId);
    } catch {
      targetService = null;
    }
  }

  let slos = [];
  let sloEvaluations = [];
  try {
    slos = await sloRepo.findAllSlos();
    sloEvaluations = await Promise.all(
      slos.map(s => sloRepo.findLatestEvaluationBySloId(s.id).catch(() => null))
    );
    sloEvaluations = sloEvaluations.filter(Boolean);
  } catch {
    slos = [];
    sloEvaluations = [];
  }

  let activeIncidents = [];
  try {
    const allIncidents = await incidentsRepo.findAllIncidents().catch(() => []);
    activeIncidents = (allIncidents || []).filter(inc => inc.status !== 'resolved');
  } catch {
    activeIncidents = [];
  }

  let activeAlerts = [];
  try {
    activeAlerts = await alertsRepo.findAllAlerts({ status: 'active' }).catch(() => []);
  } catch {
    activeAlerts = [];
  }

  let deploymentHistory = [];
  try {
    deploymentHistory = await changeRepo.findAllHistoricalDeployments(serviceId).catch(() => []);
    if (deploymentHistory.length === 0) {
      deploymentHistory = tenantContext()?[]:initialDeployments.filter(d => d.serviceName === serviceId || d.serviceId === serviceId);
    }
  } catch {
    deploymentHistory = tenantContext()?[]:initialDeployments.filter(d => d.serviceName === serviceId || d.serviceId === serviceId);
  }

  return {
    targetService,
    allServices,
    slos,
    sloEvaluations,
    activeIncidents,
    activeAlerts,
    deploymentHistory
  };
}

export async function assessProposedChange(proposal, actor = null) {
  const serviceId = proposal.serviceId || proposal.service_id;
  if (!serviceId) throw ApiError.badRequest('serviceId is required for risk assessment.');
  if (!proposal.newVersion && !proposal.new_version) {
    throw ApiError.badRequest('newVersion is required for risk assessment.');
  }

  const context = await fetchContext(serviceId);
  if (!context.targetService) {
    throw ApiError.notFound(`Service "${serviceId}" not found in topology.`);
  }

  const assessmentResult = calculateDeploymentRisk(proposal, context);
  const assessmentId = `asmt-${crypto.randomUUID().substring(0, 8)}`;

  // 1. Create assessment record
  let savedAssessment = null;
  try {
    savedAssessment = await changeRepo.createChangeAssessment({
      id: assessmentId,
      changeId: proposal.changeId || null,
      serviceId,
      environment: proposal.environment || 'production',
      targetVersion: proposal.newVersion || proposal.new_version,
      riskScore: assessmentResult.riskScore,
      riskCategory: assessmentResult.riskCategory,
      recommendation: assessmentResult.recommendation,
      factorBreakdowns: assessmentResult.factorBreakdowns,
      blastRadiusSummary: assessmentResult.blastRadiusSummary,
      supportingEvidence: assessmentResult.supportingEvidence,
      missingEvidence: assessmentResult.missingEvidence,
      recommendedVerifications: assessmentResult.recommendedVerifications,
      confidence: assessmentResult.confidence,
      tenantId: proposal.tenantId || 'default_tenant',
      assessedBy: actor?.email || actor?.name || 'risk-engine',
      assessedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('[ChangeIntelligenceService] DB save assessment fallback:', err.message);
  }

  // 2. Persist impacted blast radius services
  const blast = calculateBlastRadius(serviceId, context.allServices, {
    slos: context.slos,
    activeIncidents: context.activeIncidents,
    activeAlerts: context.activeAlerts
  });

  const impactRecords = blast.allAffectedServices.map((aff, idx) => ({
    id: `imp-${crypto.randomUUID().substring(0, 8)}-${idx}`,
    changeId: proposal.changeId || null,
    assessmentId,
    serviceId: aff.serviceId,
    serviceName: aff.serviceName,
    relationshipType: aff.relationshipType,
    dependencyPath: aff.dependencyPath || [aff.serviceId],
    criticality: aff.tier ?? 1,
    hasActiveIncident: !!aff.hasActiveIncident,
    hasSlo: !!aff.hasSlo,
    confidence: aff.confidence ?? 1.0,
    explanation: aff.explanation || `${aff.relationshipType} dependency in change blast path.`
  }));

  try {
    await changeRepo.createImpactedServices(impactRecords);
  } catch (err) {
    console.warn('[ChangeIntelligenceService] DB save impacted services fallback:', err.message);
  }

  // 3. Persist evidence records
  const evidenceRecords = (assessmentResult.supportingEvidence || []).map((ev, idx) => ({
    id: `ev-${crypto.randomUUID().substring(0, 8)}-${idx}`,
    changeId: proposal.changeId || null,
    assessmentId,
    evidenceType: ev.factor || 'risk_factor',
    title: ev.factor || 'Risk Factor Contribution',
    description: ev.description,
    impactPoints: ev.points ?? 0,
    isContradictory: false,
    metadata: { factor: ev.factor }
  }));

  try {
    await changeRepo.createRiskEvidence(evidenceRecords);
  } catch (err) {
    console.warn('[ChangeIntelligenceService] DB save evidence fallback:', err.message);
  }

  // Audit event
  if (actor) {
    await recordAuditEvent({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'CHANGE_RISK_ASSESSED',
      resourceType: 'change_assessment',
      resourceId: assessmentId,
      outcome: 'success',
      metadata: {
        serviceId,
        riskScore: assessmentResult.riskScore,
        recommendation: assessmentResult.recommendation
      }
    }).catch(() => {});
  }

  return {
    id: assessmentId,
    ...assessmentResult,
    impactedServices: blast.allAffectedServices,
    dbSaved: !!savedAssessment
  };
}

export async function registerChangeEvent(eventData, actor = null) {
  // Idempotency check
  const idempotencyKey = eventData.idempotencyKey || eventData.idempotency_key;
  if (idempotencyKey) {
    const existing = await changeRepo.findChangeEventByIdempotencyKey(idempotencyKey).catch(() => null);
    if (existing) {
      const assessment = await changeRepo.findAssessmentByChangeId(existing.id).catch(() => null);
      return {
        idempotent: true,
        changeEvent: existing,
        assessment
      };
    }
  }

  const serviceId = eventData.serviceId || eventData.service_id;
  if (!serviceId) throw ApiError.badRequest('serviceId is required.');
  if (!eventData.newVersion && !eventData.new_version) {
    throw ApiError.badRequest('newVersion is required.');
  }

  const context = await fetchContext(serviceId);
  const targetService = context.targetService;
  const serviceName = eventData.serviceName || targetService?.name || serviceId;

  const changeId = eventData.id || `chg-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

  const changeRecord = {
    id: changeId,
    serviceId,
    serviceName,
    previousVersion: eventData.previousVersion || eventData.previous_version || null,
    newVersion: eventData.newVersion || eventData.new_version,
    environment: eventData.environment || 'production',
    deploymentStrategy: eventData.deploymentStrategy || eventData.deployment_strategy || 'rolling',
    commitSha: eventData.commitSha || eventData.commit_sha || null,
    commitMessage: eventData.commitMessage || eventData.commit_message || null,
    actor: eventData.actor || actor?.email || 'CI/CD Webhook',
    status: eventData.status || 'successful',
    changeType: eventData.changeType || eventData.change_type || 'code_deployment',
    changedComponents: eventData.changedComponents || eventData.changed_components || [],
    idempotencyKey: idempotencyKey || null,
    telemetrySource: eventData.telemetrySource || 'demo_adapter',
    isSimulated: eventData.isSimulated !== undefined ? eventData.isSimulated : true,
    evidenceQuality: eventData.evidenceQuality || 'good',
    metadata: eventData.metadata || {},
    tenantId: eventData.tenantId || 'default_tenant',
    deployedAt: eventData.deployedAt || eventData.deployed_at || new Date().toISOString()
  };

  const savedEvent = await changeRepo.createChangeEvent(changeRecord);

  // Run and link assessment for this registered change
  const assessment = await assessProposedChange({
    changeId,
    serviceId,
    previousVersion: changeRecord.previousVersion,
    newVersion: changeRecord.newVersion,
    deploymentStrategy: changeRecord.deploymentStrategy,
    environment: changeRecord.environment,
    changedComponents: changeRecord.changedComponents,
    changeType: changeRecord.changeType,
    tenantId: changeRecord.tenantId
  }, actor).catch(err => {
    console.warn('[ChangeIntelligenceService] Auto-assessment fallback:', err.message);
    return null;
  });

  if (actor) {
    await recordAuditEvent({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'CHANGE_EVENT_REGISTERED',
      resourceType: 'change_event',
      resourceId: changeId,
      outcome: 'success',
      metadata: { serviceId, newVersion: changeRecord.newVersion, environment: changeRecord.environment }
    }).catch(() => {});
  }

  return {
    idempotent: false,
    changeEvent: savedEvent,
    assessment
  };
}

export async function getChangeDetails(changeId) {
  const changeEvent = await changeRepo.findChangeEventById(changeId);
  if (!changeEvent) throw ApiError.notFound(`Change event "${changeId}" not found.`);

  const assessment = await changeRepo.findAssessmentByChangeId(changeId).catch(() => null);
  const impactedServices = await changeRepo.findImpactedServicesByChangeId(changeId).catch(() => []);
  const regressions = await changeRepo.findRegressionsByChangeId(changeId).catch(() => []);
  const outcome = await changeRepo.findOutcomeByChangeId(changeId).catch(() => null);

  return {
    changeEvent,
    assessment,
    impactedServices,
    regressions,
    outcome
  };
}

export async function listChanges(filters = {}) {
  const items = await changeRepo.listChangeEvents(filters);
  const total = await changeRepo.countChangeEvents(filters).catch(() => items.length);
  return { items, total };
}

export async function getBlastRadiusForChange(changeId) {
  const changeEvent = await changeRepo.findChangeEventById(changeId);
  if (!changeEvent) throw ApiError.notFound(`Change event "${changeId}" not found.`);

  const context = await fetchContext(changeEvent.service_id);
  return calculateBlastRadius(changeEvent.service_id, context.allServices, {
    slos: context.slos,
    activeIncidents: context.activeIncidents,
    activeAlerts: context.activeAlerts
  });
}
