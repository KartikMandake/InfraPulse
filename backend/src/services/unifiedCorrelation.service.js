import crypto from 'node:crypto';
import {tenantContext} from '../security/tenantContext.js';
import * as eventsRepo from '../repositories/events.repository.js';
import * as incidentsRepo from '../repositories/incidents.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import { initialServices } from '../data/services.js';
import { getIncidentInvestigation } from './investigation.service.js';
import { correlateAllEvents } from '../engine/eventCorrelationEngine.js';
import { buildInvestigationGraph } from '../engine/investigationGraphEngine.js';
import { ApiError } from '../utils/ApiError.js';

export async function getIncidentInvestigationGraph(incidentId, options = {}) {
  const incident = await incidentsRepo.findIncidentById(incidentId).catch(() => null);
  if (!incident) throw ApiError.notFound(`Incident "${incidentId}" not found.`);

  // 1. Fetch topology services
  let allServices = [];
  try {
    allServices = await servicesRepo.findAllServices();
  } catch (error) {
    if(tenantContext())throw error;
    allServices = initialServices;
  }
  if (!allServices || allServices.length === 0) allServices = tenantContext()?[]:initialServices;

  // 2. Fetch normalized events
  const events = await eventsRepo.listNormalizedEvents({
    relatedIncidentId: incidentId,
    limit: options.limit || 150
  }).catch(() => []);

  // Also include events for the primary service
  const serviceEvents = await eventsRepo.listNormalizedEvents({
    serviceId: incident.serviceId,
    limit: 50
  }).catch(() => []);

  const eventMap = new Map();
  [...events, ...serviceEvents].forEach(e => eventMap.set(e.id, {
    id: e.id,
    eventType: e.event_type || e.eventType,
    sourceSystem: e.source_system || e.sourceSystem,
    sourceRefId: e.source_ref_id || e.sourceRefId,
    serviceId: e.service_id || e.serviceId,
    serviceName: e.service_name || e.serviceName,
    eventTimestamp: e.event_timestamp || e.eventTimestamp,
    severity: e.severity,
    title: e.title,
    summary: e.summary,
    correlationIds: e.correlation_ids || e.correlationIds || [],
    relatedIncidentId: e.related_incident_id || e.relatedIncidentId,
    telemetryMode: e.telemetry_mode || e.telemetryMode,
    normalizedAttributes: e.normalized_attributes || e.normalizedAttributes
  }));
  const mergedEvents = Array.from(eventMap.values());

  // 3. Compute cross-event correlations
  const correlations = correlateAllEvents(mergedEvents, allServices, options.minScore || 25);

  // 4. Fetch RCA hypotheses
  let hypotheses = [];
  try {
    const rca = await getIncidentInvestigation(incidentId);
    hypotheses = rca?.hypotheses || [];
  } catch {
    hypotheses = [];
  }

  // 5. Build Graph Model
  const graph = buildInvestigationGraph({
    incident,
    events: mergedEvents,
    correlations,
    services: allServices,
    hypotheses,
    options
  });

  // 6. Cache/Persist Graph Snapshot
  const snapshotId = `snap-${crypto.randomUUID().substring(0, 8)}`;
  try {
    await eventsRepo.insertGraphSnapshot({
      id: snapshotId,
      incidentId,
      nodes: graph.nodes,
      edges: graph.edges,
      correlationSummary: graph.correlationSummary,
      windowStart: options.windowStart || new Date(Date.now() - 4 * 3600000).toISOString(),
      windowEnd: options.windowEnd || new Date().toISOString(),
      tenantId: incident.tenantId || 'default_tenant'
    });
  } catch (err) {
    console.warn('[UnifiedCorrelationService] Snapshot persistence fallback:', err.message);
  }

  return {
    snapshotId,
    incidentId,
    nodesCount: graph.nodes.length,
    edgesCount: graph.edges.length,
    nodes: graph.nodes,
    edges: graph.edges,
    disconnectedGroups: graph.disconnectedGroups,
    correlationSummary: graph.correlationSummary
  };
}

export async function getIncidentCorrelationSummary(incidentId) {
  const graphData = await getIncidentInvestigationGraph(incidentId);
  return {
    incidentId,
    summary: graphData.correlationSummary,
    disconnectedGroups: graphData.disconnectedGroups
  };
}

export async function getIncidentEvidence(incidentId) {
  const events = await eventsRepo.listNormalizedEvents({
    relatedIncidentId: incidentId,
    limit: 100
  });

  const evidenceCatalog = events.map(e => ({
    id: e.id,
    type: e.event_type || e.eventType,
    serviceId: e.service_id || e.serviceId,
    title: e.title,
    summary: e.summary,
    timestamp: e.event_timestamp || e.eventTimestamp,
    severity: e.severity,
    telemetryMode: e.telemetry_mode || e.telemetryMode,
    attributes: e.normalized_attributes || e.normalizedAttributes
  }));

  return {
    incidentId,
    totalEvidenceItems: evidenceCatalog.length,
    evidence: evidenceCatalog
  };
}

export async function getServiceEventHistory(serviceId, options = {}) {
  const events = await eventsRepo.listNormalizedEvents({
    serviceId,
    limit: options.limit || 50,
    offset: options.offset || 0
  });
  const count = await eventsRepo.countNormalizedEvents({ serviceId }).catch(() => events.length);
  return { serviceId, total: count, events };
}

