import * as eventsRepo from '../repositories/events.repository.js';
import * as incidentsRepo from '../repositories/incidents.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import { initialServices } from '../data/services.js';
import { ApiError } from '../utils/ApiError.js';

export async function getUnifiedIncidentTimeline(incidentId, options = {}) {
  const incident = await incidentsRepo.findIncidentById(incidentId).catch(() => null);
  if (!incident) throw ApiError.notFound(`Incident "${incidentId}" not found.`);

  // Parse incident time
  let incTime = new Date();
  if (incident.startedAt) {
    const parsed = new Date(incident.startedAt);
    if (!isNaN(parsed.getTime())) incTime = parsed;
    else if (incident.createdAt) incTime = new Date(incident.createdAt);
  }

  const windowHoursBefore = options.windowHoursBefore || 2;
  const windowHoursAfter = options.windowHoursAfter || 4;

  const windowStart = new Date(incTime.getTime() - windowHoursBefore * 3600000).toISOString();
  const windowEnd = new Date(incTime.getTime() + windowHoursAfter * 3600000).toISOString();

  // 1. Fetch normalized events in window
  const allEvents = await eventsRepo.listNormalizedEvents({
    relatedIncidentId: incidentId,
    limit: 200
  }).catch(() => []);

  // Also fetch events for the incident service and general window if event count is small
  const serviceEvents = await eventsRepo.listNormalizedEvents({
    serviceId: incident.serviceId,
    windowStart,
    windowEnd,
    limit: 50
  }).catch(() => []);

  // Deduplicate events by id
  const eventMap = new Map();
  [...allEvents, ...serviceEvents].forEach(e => eventMap.set(e.id, e));
  const mergedEvents = Array.from(eventMap.values());

  // 2. Sort chronologically
  mergedEvents.sort((a, b) => new Date(a.event_timestamp || a.eventTimestamp).getTime() - new Date(b.event_timestamp || b.eventTimestamp).getTime());

  // 3. Classify into timeline phases
  const classifiedTimeline = mergedEvents.map((evt, idx) => {
    const timestamp = evt.event_timestamp || evt.eventTimestamp;
    const evtTime = new Date(timestamp).getTime();
    const type = evt.event_type || evt.eventType;

    let phase = 'investigation_action';
    if (evtTime < incTime.getTime() - 60000) {
      phase = 'pre_incident_signal';
    } else if (type === 'deployment_change') {
      phase = 'deployment_change';
    } else if (type === 'alert_transition') {
      phase = 'alert_generation';
    } else if (type === 'incident_transition') {
      phase = 'incident_declaration';
    } else if (type === 'runbook_execution') {
      phase = 'runbook_execution';
    } else if (evt.service_id !== incident.serviceId) {
      phase = 'propagation';
    } else if (idx === 0 || (evtTime >= incTime.getTime() - 300000 && evtTime <= incTime.getTime())) {
      phase = 'first_observed_anomaly';
    }

    return {
      eventId: evt.id,
      phase, // 'pre_incident_signal', 'first_observed_anomaly', 'alert_generation', 'incident_declaration', 'deployment_change', 'propagation', 'investigation_action', 'runbook_execution', 'recovery_resolution'
      timestamp,
      eventType: type,
      serviceId: evt.service_id || evt.serviceId,
      serviceName: evt.service_name || evt.serviceName || evt.service_id || evt.serviceId,
      severity: evt.severity,
      title: evt.title,
      summary: evt.summary,
      telemetryMode: evt.telemetry_mode || evt.telemetryMode || 'simulated',
      evidenceQuality: evt.evidence_quality || evt.evidenceQuality || 'good',
      correlationIds: evt.correlation_ids || evt.correlationIds || [],
      normalizedAttributes: evt.normalized_attributes || evt.normalizedAttributes || {},
      originalSourceRef: evt.original_source_ref || evt.originalSourceRef || {}
    };
  });

  // 4. Sequence Analysis
  const earliestSignal = classifiedTimeline[0] || null;
  const firstAffectedService = earliestSignal ? earliestSignal.serviceId : incident.serviceId;

  // Propagation sequence
  const observedServiceOrder = [];
  classifiedTimeline.forEach(item => {
    if (item.serviceId && !observedServiceOrder.includes(item.serviceId)) {
      observedServiceOrder.push(item.serviceId);
    }
  });

  // Check for missing telemetry intervals (> 15m gap)
  const missingTelemetryIntervals = [];
  for (let i = 0; i < classifiedTimeline.length - 1; i++) {
    const t1 = new Date(classifiedTimeline[i].timestamp).getTime();
    const t2 = new Date(classifiedTimeline[i + 1].timestamp).getTime();
    const gapMinutes = (t2 - t1) / 60000;
    if (gapMinutes > 15) {
      missingTelemetryIntervals.push({
        from: classifiedTimeline[i].timestamp,
        to: classifiedTimeline[i + 1].timestamp,
        gapMinutes: Math.round(gapMinutes),
        note: `Unobserved interval of ${Math.round(gapMinutes)} minutes between events.`
      });
    }
  }

  return {
    incidentId,
    windowStart,
    windowEnd,
    totalEvents: classifiedTimeline.length,
    timeline: classifiedTimeline,
    sequenceAnalysis: {
      earliestObservedSignal: earliestSignal ? {
        id: earliestSignal.eventId,
        timestamp: earliestSignal.timestamp,
        serviceId: earliestSignal.serviceId,
        title: earliestSignal.title,
        phase: earliestSignal.phase
      } : null,
      firstAffectedService,
      potentialPropagationSequence: observedServiceOrder,
      missingTelemetryIntervals
    }
  };
}

