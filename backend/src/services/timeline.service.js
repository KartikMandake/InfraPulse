import { getIncidentById } from '../data/incidents.js';
import { getServices } from '../data/services.js';
import { getAlerts } from '../data/alerts.js';
import { getDeployments } from '../data/deployments.js';
import { getLogs, getTraces } from '../data/telemetry.js';
import { parseTimeToMinutes } from '../engine/scoring.js';
import { getSimulation } from './faultLab.service.js';
import { ApiError } from '../utils/ApiError.js';
import * as incidentsRepo from '../repositories/incidents.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import * as alertsRepo from '../repositories/alerts.repository.js';
import * as deploymentsRepo from '../repositories/deployments.repository.js';
import * as telemetry from '../integrations/telemetry/telemetry.service.js';

export async function buildTenantIncidentTimeline(incidentId,options={}){
  if(options.simulationId){const sim=getSimulation(options.simulationId);if(sim.simulatedIncident?.id!==incidentId)throw ApiError.notFound('Simulation incident not found.');return buildIncidentTimeline(incidentId,options);}
  const incident=await incidentsRepo.findIncidentById(incidentId);if(!incident)throw ApiError.notFound(`Incident "${incidentId}" not found.`);
  const [services,alerts,deployments,logs,traces]=await Promise.all([servicesRepo.findAllServices(),alertsRepo.findAllAlerts(),deploymentsRepo.findAllDeployments(),telemetry.getLogs(),telemetry.getTraces()]);
  return buildIncidentTimeline(incidentId,{...options,evidence:{incident,services,alerts,deployments,logs:logs.logs,traces:traces.traces}});
}

/**
 * Event Types enumeration
 */
export const EVENT_TYPES = {
  DEPLOYMENT: 'deployment',
  ALERT_FIRED: 'alert_fired',
  ANOMALY_DETECTED: 'anomaly_detected',
  INCIDENT_DECLARED: 'incident_declared',
  INCIDENT_MILESTONE: 'incident_milestone',
  LOG_ERROR: 'log_error',
  TRACE_SPAN_ERROR: 'trace_span_error',
  FAULT_INJECTED: 'fault_injected',
  REMEDIATION_ACTION: 'remediation_action'
};

/**
 * Normalizes any timestamp string into minutes from start of day for stable sorting.
 */
function toSortableMinute(timeStr) {
  if (!timeStr) return 0;
  const parsed = parseTimeToMinutes(timeStr);
  return parsed !== null ? parsed : 0;
}

/**
 * Recursively find all downstream callers (callees depends on caller).
 * If A depends on B, A is a caller (downstream) of B.
 */
function getDownstreamCallers(targetServiceId, services, visited = new Set()) {
  const result = [];
  for (const s of services) {
    if (Array.isArray(s.dependencies) && s.dependencies.includes(targetServiceId)) {
      if (!visited.has(s.id)) {
        visited.add(s.id);
        result.push(s.id);
        const sub = getDownstreamCallers(s.id, services, visited);
        result.push(...sub);
      }
    }
  }
  return Array.from(new Set(result));
}

/**
 * Recursively find upstream dependencies of a service.
 */
function getUpstreamDependencies(targetServiceId, services, visited = new Set()) {
  const target = services.find(s => s.id === targetServiceId);
  if (!target || !Array.isArray(target.dependencies)) return [];

  const result = [];
  for (const depId of target.dependencies) {
    if (!visited.has(depId)) {
      visited.add(depId);
      result.push(depId);
      const sub = getUpstreamDependencies(depId, services, visited);
      result.push(...sub);
    }
  }
  return Array.from(new Set(result));
}

/**
 * Builds a unified, chronologically sorted, de-duplicated event timeline for an incident.
 *
 * @param {string} incidentId
 * @param {Object} [options]
 * @param {number} [options.timeWindowMinutes=120]
 * @param {number} [options.limit=100]
 * @param {string} [options.simulationId]
 * @returns {Object} Unified timeline with correlation graph metadata
 */
export function buildIncidentTimeline(incidentId, options = {}) {
  const {
    timeWindowMinutes = 120,
    limit = 100,
    simulationId = null
  } = options;

  let incident = options.evidence?.incident || null;
  let services = options.evidence?.services || getServices();
  let alerts = options.evidence?.alerts || getAlerts();
  let deployments = options.evidence?.deployments || getDeployments();
  let logs = options.evidence?.logs || getLogs();
  let traces = options.evidence?.traces || getTraces();
  let isSimulated = false;

  // Check if this incident belongs to an active fault simulation
  if (simulationId) {
    try {
      const sim = getSimulation(simulationId);
      incident = sim.simulatedIncident;
      services = sim.telemetry.services;
      alerts = sim.telemetry.alerts;
      deployments = sim.telemetry.deployments;
      logs = sim.telemetry.logs;
      traces = sim.telemetry.traces;
      isSimulated = true;
    } catch {
      // Fallback to normal lookup if simulation not found
    }
  }

  if (!incident) {
    incident = getIncidentById(incidentId);
  }

  if (!incident) {
    throw ApiError.notFound(`Incident with ID "${incidentId}" not found.`);
  }

  const primaryServiceId = incident.serviceId;
  const incidentStartMin = toSortableMinute(incident.startedAt);

  // 1. Compute Topological Dependency Relationships
  const downstreamAffectedIds = getDownstreamCallers(primaryServiceId, services);
  const upstreamDependencyIds = getUpstreamDependencies(primaryServiceId, services);
  const relevantServiceIds = new Set([
    primaryServiceId,
    ...downstreamAffectedIds,
    ...upstreamDependencyIds
  ]);

  const rawEvents = [];
  const seenEventKeys = new Set();

  function addEvent(evt) {
    // Unique deduplication key: type + service + timestamp + title
    const key = `${evt.type}:${evt.serviceId || 'mesh'}:${evt.time}:${evt.title.toLowerCase().trim()}`;
    if (seenEventKeys.has(key)) return;
    seenEventKeys.add(key);
    rawEvents.push(evt);
  }

  // 2. Ingest Incident Core Timeline Milestones
  if (Array.isArray(incident.timeline)) {
    incident.timeline.forEach((item, idx) => {
      let type = EVENT_TYPES.INCIDENT_MILESTONE;
      if (item.title.toLowerCase().includes('deployment')) type = EVENT_TYPES.DEPLOYMENT;
      else if (item.title.toLowerCase().includes('alert')) type = EVENT_TYPES.ALERT_FIRED;
      else if (item.title.toLowerCase().includes('anomaly')) type = EVENT_TYPES.ANOMALY_DETECTED;
      else if (item.title.toLowerCase().includes('declared')) type = EVENT_TYPES.INCIDENT_DECLARED;
      else if (item.source === 'engineer_action') type = EVENT_TYPES.REMEDIATION_ACTION;

      addEvent({
        id: `inc-evt-${incident.id}-${idx}`,
        incidentId: incident.id,
        type,
        time: item.time,
        sortMinute: toSortableMinute(item.time),
        serviceId: primaryServiceId,
        serviceName: incident.serviceName,
        severity: item.isKeyMilestone ? 'critical' : 'high',
        title: item.title,
        description: item.description,
        source: item.source || 'incident_record',
        isKeyMilestone: Boolean(item.isKeyMilestone),
        evidenceRef: { type: 'milestone', index: idx }
      });
    });
  }

  // 3. Ingest Deployments (highlighting those preceding the incident)
  deployments.forEach(dep => {
    const depService = services.find(
      s => s.id.toLowerCase() === dep.serviceName.toLowerCase() || s.name.toLowerCase() === dep.serviceName.toLowerCase()
    );
    const serviceId = depService ? depService.id : dep.serviceName;

    if (relevantServiceIds.has(serviceId)) {
      const depMin = toSortableMinute(dep.timestamp);
      const isPreceding = depMin > 0 && incidentStartMin > 0 && depMin <= incidentStartMin;

      addEvent({
        id: `dep-evt-${dep.id}`,
        incidentId: incident.id,
        type: EVENT_TYPES.DEPLOYMENT,
        time: dep.timestamp,
        sortMinute: depMin,
        serviceId,
        serviceName: dep.serviceName,
        severity: dep.status === 'unhealthy' ? 'critical' : 'medium',
        title: `Deployment: ${dep.serviceName} ${dep.version} (${dep.environment || 'production'})`,
        description: `Commit ${dep.commitSha}: "${dep.commitMessage}" by ${dep.author}. ACA score: ${dep.acaScore}/100.`,
        source: 'ci_cd_pipeline',
        isPrecedingDeployment: isPreceding,
        isKeyMilestone: dep.status === 'unhealthy' || isPreceding,
        evidenceRef: { type: 'deployment', id: dep.id, commit: dep.commitSha }
      });
    }
  });

  // 4. Ingest Telemetry Alerts
  alerts.forEach(alt => {
    if (relevantServiceIds.has(alt.serviceId)) {
      addEvent({
        id: `alt-evt-${alt.id}`,
        incidentId: incident.id,
        type: EVENT_TYPES.ALERT_FIRED,
        time: alt.firedAt,
        sortMinute: toSortableMinute(alt.firedAt),
        serviceId: alt.serviceId,
        serviceName: alt.serviceName,
        severity: alt.severity,
        title: `Alert Triggered: ${alt.title}`,
        description: `Threshold ${alt.threshold} breached with value: ${alt.currentValue} (${alt.metric}).`,
        source: 'telemetry_alert_rule',
        isKeyMilestone: alt.severity === 'critical',
        evidenceRef: { type: 'alert', id: alt.id }
      });
    }
  });

  // 5. Ingest Correlated Machine Logs (Errors and Warnings)
  logs.forEach(log => {
    const logServiceId = log.serviceId || log.service;
    if (relevantServiceIds.has(logServiceId) && (log.level === 'ERROR' || log.level === 'WARN')) {
      addEvent({
        id: `log-evt-${log.id}`,
        incidentId: incident.id,
        type: EVENT_TYPES.LOG_ERROR,
        time: log.timestamp,
        sortMinute: toSortableMinute(log.timestamp),
        serviceId: logServiceId,
        serviceName: log.service,
        severity: log.level === 'ERROR' ? 'high' : 'medium',
        title: `[${log.level}] Log on ${log.service}`,
        description: log.message,
        source: 'otlp_log_stream',
        pod: log.pod,
        evidenceRef: { type: 'log', id: log.id, traceId: log.traceId }
      });
    }
  });

  // 6. Ingest Span Failures from Distributed Traces
  traces.forEach(span => {
    if (span.status === 'error' && relevantServiceIds.has(span.service)) {
      addEvent({
        id: `trace-evt-${span.id}`,
        incidentId: incident.id,
        type: EVENT_TYPES.TRACE_SPAN_ERROR,
        time: incident.startedAt,
        sortMinute: toSortableMinute(incident.startedAt),
        serviceId: span.service,
        serviceName: span.service,
        severity: 'high',
        title: `Span Failure: ${span.operation}`,
        description: `Trace ${span.traceId} failed in ${span.durationMs}ms with HTTP ${span.httpStatus || 500}.`,
        source: 'distributed_tracing',
        isKeyMilestone: Boolean(span.isCriticalPath),
        evidenceRef: { type: 'trace', id: span.id, traceId: span.traceId }
      });
    }
  });

  // 7. Sort Chronologically
  rawEvents.sort((a, b) => a.sortMinute - b.sortMinute);

  // 8. Tag Temporal Precedence vs Incident Detection
  const events = rawEvents.map(evt => {
    const relation = evt.sortMinute < incidentStartMin 
      ? 'pre_incident' 
      : evt.sortMinute === incidentStartMin 
        ? 'detection_window' 
        : 'post_detection';

    return {
      ...evt,
      temporalRelation: relation
    };
  }).slice(0, limit);

  // 9. First Anomaly Detected Event
  const firstAnomaly = events.find(e => 
    e.type === EVENT_TYPES.ANOMALY_DETECTED || e.type === EVENT_TYPES.ALERT_FIRED
  );

  // 10. Prior Preceding Deployments
  const precedingDeployments = events.filter(e => e.isPrecedingDeployment);

  return {
    incidentId: incident.id,
    incidentTitle: incident.title,
    primaryServiceId,
    primaryServiceName: incident.serviceName,
    startedAt: incident.startedAt,
    isSimulated,
    eventCount: events.length,
    topologyCorrelation: {
      primaryServiceId,
      firstObservedAnomaly: firstAnomaly ? {
        serviceId: firstAnomaly.serviceId,
        serviceName: firstAnomaly.serviceName,
        time: firstAnomaly.time,
        title: firstAnomaly.title
      } : null,
      downstreamAffectedCount: downstreamAffectedIds.length,
      downstreamAffectedServices: downstreamAffectedIds,
      upstreamDependencyCount: upstreamDependencyIds.length,
      upstreamDependencies: upstreamDependencyIds,
      precedingDeployments: precedingDeployments.map(d => ({
        id: d.id,
        serviceId: d.serviceId,
        version: d.title,
        time: d.time
      }))
    },
    events
  };
}

