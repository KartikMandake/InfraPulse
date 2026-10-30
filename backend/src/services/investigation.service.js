import { findIncidentById, modifyIncident } from './incidents.service.js';
import * as servicesRepo from '../repositories/services.repository.js';
import * as alertsRepo from '../repositories/alerts.repository.js';
import * as deploymentsRepo from '../repositories/deployments.repository.js';
import * as investigationsRepo from '../repositories/investigations.repository.js';
import { getServices as getMemServices } from '../data/services.js';
import { getAlerts as getMemAlerts } from '../data/alerts.js';
import { getDeployments as getMemDeployments } from '../data/deployments.js';
import { getTelemetryLogs, getTelemetryTraces } from '../data/telemetry.js';
import { runRcaAnalysis } from '../engine/rcaEngine.js';
import { withTransaction } from '../db/connection.js';

// In-memory cache for recent investigations keyed by incidentId + evidence hash
const investigationCache = new Map();
const CACHE_TTL_MS = 60000; // 60 seconds

export function invalidateInvestigationCache(incidentId) {
  if (incidentId) {
    investigationCache.delete(incidentId);
  } else {
    investigationCache.clear();
  }
}

export async function getIncidentInvestigation(incidentId) {
  // 1. Check in-memory cache first for fast response
  const cached = investigationCache.get(incidentId);
  if (cached && (Date.now() - cached.cachedAt < CACHE_TTL_MS)) {
    return cached.data;
  }

  // 2. Check saved investigation in PostgreSQL
  try {
    const saved = await investigationsRepo.findLatestInvestigationByIncidentId(incidentId);
    if (saved) {
      const incident = await findIncidentById(incidentId);
      const result = {
        incidentId,
        incident,
        evaluatedAt: saved.executedAt,
        candidateCount: saved.candidateCount,
        hypotheses: saved.hypotheses,
        correlatedTraces: saved.correlatedTraces
      };
      investigationCache.set(incidentId, { cachedAt: Date.now(), data: result });
      return result;
    }
  } catch (err) {
    console.warn('[InvestigationService] DB read fallback:', err.message);
  }

  // 3. Otherwise run fresh investigation and save it
  return runIncidentInvestigation(incidentId);
}

export async function runIncidentInvestigation(incidentId, options = {}) {
  // If forceFresh is false, check cache first
  if (options.forceFresh === false) {
    const cached = investigationCache.get(incidentId);
    if (cached && (Date.now() - cached.cachedAt < CACHE_TTL_MS)) {
      return cached.data;
    }
  }

  const incident = await findIncidentById(incidentId);

  let services = options.services;
  let alerts = options.alerts;
  let deployments = options.deployments;

  if (!services) {
    try {
      services = await servicesRepo.findAllServices();
    } catch {
      services = getMemServices();
    }
  }
  if (!alerts) {
    try {
      alerts = await alertsRepo.findAllAlerts();
    } catch {
      alerts = getMemAlerts();
    }
  }
  if (!deployments) {
    try {
      deployments = await deploymentsRepo.findAllDeployments();
    } catch {
      deployments = getMemDeployments();
    }
  }

  const logs = options.logs || getTelemetryLogs();
  const traces = options.traces || getTelemetryTraces();
  const weights = options.weights || undefined;

  const hypotheses = runRcaAnalysis({
    incident,
    services,
    alerts,
    deployments,
    logs,
    traces,
    weights
  });

  const executedAt = new Date().toISOString();
  // Prune correlated traces to essential top 25 spans to prevent oversized payloads and JSONB saturation
  const correlatedTraces = traces
    .filter(t => t.service === incident.serviceId || t.parentId || t.isCriticalPath || t.error)
    .slice(0, 25);

  // Update in-memory cache
  const result = {
    incidentId,
    incident,
    executedAt,
    isFreshRun: true,
    candidateCount: hypotheses.length,
    hypotheses,
    correlatedTraces
  };
  investigationCache.set(incidentId, { cachedAt: Date.now(), data: result });

  // Asynchronous non-blocking persistence to PostgreSQL (avoids blocking client response)
  (async () => {
    try {
      await withTransaction(async (client) => {
        if (hypotheses.length > 0) {
          const top = hypotheses[0];
          await modifyIncident(incidentId, {
            aiConfidencePercent: Math.round(top.score),
            aiHypothesis: top.summary,
            aiRemediationRecommendation: top.suggestedNextAction
          });
        }

        await investigationsRepo.createInvestigationRunRecord(
          {
            incidentId,
            executedAt,
            hypotheses,
            correlatedTraces,
            weights
          },
          client
        );
      });
    } catch (err) {
      console.warn('[InvestigationService] Async DB persistence warning:', err.message);
    }
  })();

  return result;
}
