import * as runbooksRepo from '../repositories/runbooks.repository.js';
import { findIncidentById } from './incidents.service.js';
import { getIncidentInvestigation } from './investigation.service.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAuditEvent } from './audit.service.js';

export async function getRunbooksCatalog(filters = {}) {
  const runbooks = await runbooksRepo.findAllRunbooks(filters);

  // Augment with step counts and version definitions if available
  const augmented = await Promise.all(
    runbooks.map(async (rb) => {
      const v = await runbooksRepo.findRunbookVersion(rb.id, rb.version).catch(() => null);
      const definition = v?.definition || {};
      return {
        ...rb,
        steps: definition.steps || [],
        stepCount: definition.steps?.length || 0
      };
    })
  );

  return augmented;
}

export async function getRunbookDetails(runbookId) {
  const runbook = await runbooksRepo.findRunbookById(runbookId);
  if (!runbook) {
    throw ApiError.notFound(`Runbook "${runbookId}" was not found.`);
  }

  const versionRecord = await runbooksRepo.findRunbookVersion(runbookId, runbook.version);
  const definition = versionRecord?.definition || {};

  return {
    ...runbook,
    steps: definition.steps || [],
    definition
  };
}

export async function createCustomRunbook(data, user) {
  if (!data.id || !data.title || !data.description || !data.riskLevel || !data.executionMode) {
    throw ApiError.badRequest('id, title, description, riskLevel, and executionMode are required.');
  }

  const existing = await runbooksRepo.findRunbookById(data.id);
  if (existing) {
    throw ApiError.conflict(`Runbook with ID "${data.id}" already exists.`);
  }

  const created = await runbooksRepo.createRunbook({
    ...data,
    version: 1,
    enabled: data.enabled !== false
  });

  await runbooksRepo.createRunbookVersion({
    runbookId: created.id,
    version: 1,
    definition: data,
    changelog: 'Initial custom runbook created',
    createdBy: user?.id
  });

  await recordAuditEvent({
    actor: user,
    action: 'RUNBOOK_CREATED',
    resourceType: 'runbook',
    resourceId: created.id,
    outcome: 'success',
    metadata: { title: created.title, riskLevel: created.riskLevel }
  }).catch(() => {});

  return created;
}

export async function updateRunbook(runbookId, updates, user) {
  const existing = await runbooksRepo.findRunbookById(runbookId);
  if (!existing) {
    throw ApiError.notFound(`Runbook "${runbookId}" was not found.`);
  }

  // If steps or definition changed, bump version number
  let nextVersion = existing.version;
  if (updates.steps || updates.definition || updates.riskLevel || updates.executionMode) {
    nextVersion = existing.version + 1;
    updates.version = nextVersion;
  }

  const updated = await runbooksRepo.updateRunbook(runbookId, updates);

  if (nextVersion > existing.version) {
    const fullDefinition = {
      ...updated,
      steps: updates.steps || (await runbooksRepo.findRunbookVersion(runbookId, existing.version))?.definition?.steps || []
    };

    await runbooksRepo.createRunbookVersion({
      runbookId,
      version: nextVersion,
      definition: fullDefinition,
      changelog: updates.changelog || `Version bumped to v${nextVersion}`,
      createdBy: user?.id
    });
  }

  await recordAuditEvent({
    actor: user,
    action: 'RUNBOOK_UPDATED',
    resourceType: 'runbook',
    resourceId: runbookId,
    outcome: 'success',
    metadata: { version: nextVersion, changes: Object.keys(updates) }
  }).catch(() => {});

  return updated;
}

/**
 * Finds runbooks compatible with an incident and its RCA hypothesis.
 */
export async function getCompatibleRunbooksForIncident(incidentId) {
  const incident = await findIncidentById(incidentId);
  let topHypothesis = null;

  try {
    const investigation = await getIncidentInvestigation(incidentId);
    topHypothesis = investigation?.hypotheses?.[0] || null;
  } catch {
    // RCA lookup fallback
  }

  const allRunbooks = await getRunbooksCatalog({ enabled: true });
  const targetServiceId = topHypothesis?.candidateServiceId || incident.serviceId;
  const incidentContext = `${incident.title} ${incident.summary || ''} ${topHypothesis?.summary || ''}`.toLowerCase();

  const compatible = allRunbooks.map(rb => {
    let matchScore = 0;
    const reasons = [];

    // Service match
    const serviceMatch = rb.applicableServices.includes('*') || rb.applicableServices.includes(targetServiceId);
    if (serviceMatch) {
      matchScore += 30;
      reasons.push(`Applicable to target service "${targetServiceId}"`);
    }

    // Incident type / keyword matching
    for (const t of rb.supportedIncidentTypes) {
      if (t === '*') {
        matchScore += 10;
      } else if (incidentContext.includes(t.toLowerCase().replace(/_/g, ' '))) {
        matchScore += 40;
        reasons.push(`Matches incident symptom "${t}"`);
      }
    }

    // Correlation with RCA causal role
    if (topHypothesis?.causalRole && rb.executionMode === 'remediation') {
      if (topHypothesis.causalRole === 'primary_failure') {
        matchScore += 20;
        reasons.push('Directly addresses top RCA primary failure candidate');
      }
    }

    return {
      runbook: rb,
      matchScore,
      reasons,
      targetServiceId
    };
  })
  .filter(item => item.matchScore > 20)
  .sort((a, b) => b.matchScore - a.matchScore);

  return {
    incidentId,
    targetServiceId,
    topCandidate: topHypothesis?.candidateServiceName || incident.serviceName,
    compatibleRunbooks: compatible
  };
}
