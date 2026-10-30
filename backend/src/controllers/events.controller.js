import * as eventsRepo from '../repositories/events.repository.js';
import * as eventNormalizerService from '../services/eventNormalizer.service.js';
import * as unifiedTimelineService from '../services/unifiedTimeline.service.js';
import * as unifiedCorrelationService from '../services/unifiedCorrelation.service.js';
import { ApiError } from '../utils/ApiError.js';

export async function listEvents(req, res, next) {
  try {
    const filters = {
      serviceId: req.query.serviceId,
      eventType: req.query.eventType,
      severity: req.query.severity,
      relatedIncidentId: req.query.relatedIncidentId,
      telemetryMode: req.query.telemetryMode,
      windowStart: req.query.windowStart,
      windowEnd: req.query.windowEnd,
      tenantId: req.query.tenantId || req.user?.tenantId,
      limit: parseInt(req.query.limit, 10) || 50,
      offset: parseInt(req.query.offset, 10) || 0
    };
    const events = await eventsRepo.listNormalizedEvents(filters);
    const count = await eventsRepo.countNormalizedEvents(filters).catch(() => events.length);
    res.json({ success: true, count: events.length, total: count, data: events });
  } catch (error) {
    next(error);
  }
}

export async function getEventById(req, res, next) {
  try {
    const event = await eventsRepo.findNormalizedEventById(req.params.eventId);
    if (!event) throw ApiError.notFound(`Event "${req.params.eventId}" not found.`);
    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
}

export async function ingestEvent(req, res, next) {
  try {
    const isBatch = Array.isArray(req.body);
    if (isBatch) {
      const result = await eventNormalizerService.ingestBatch(req.body, { tenantId: req.user?.tenantId });
      res.status(result.failedCount > 0 ? 207 : 201).json({ success: true, data: result });
    } else {
      const result = await eventNormalizerService.ingestEvent(req.body, { tenantId: req.user?.tenantId });
      if (!result.success) {
        throw ApiError.badRequest(result.error);
      }
      res.status(201).json({ success: true, data: result.event });
    }
  } catch (error) {
    next(error);
  }
}

export async function listCorrelations(req, res, next) {
  try {
    const filters = {
      sourceEventId: req.query.sourceEventId,
      relationshipType: req.query.relationshipType,
      limit: parseInt(req.query.limit, 10) || 50
    };
    const correlations = await eventsRepo.listEventCorrelations(filters);
    res.json({ success: true, count: correlations.length, data: correlations });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentUnifiedTimeline(req, res, next) {
  try {
    const options = {
      windowHoursBefore: parseInt(req.query.windowHoursBefore, 10) || 2,
      windowHoursAfter: parseInt(req.query.windowHoursAfter, 10) || 4
    };
    const timelineData = await unifiedTimelineService.getUnifiedIncidentTimeline(req.params.incidentId, options);
    res.json({ success: true, data: timelineData });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentInvestigationGraph(req, res, next) {
  try {
    const options = {
      filterServiceId: req.query.serviceId,
      filterSeverity: req.query.severity,
      minScore: parseInt(req.query.minScore, 10) || 25,
      windowStart: req.query.windowStart,
      windowEnd: req.query.windowEnd
    };
    const graphData = await unifiedCorrelationService.getIncidentInvestigationGraph(req.params.incidentId, options);
    res.json({ success: true, data: graphData });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentCorrelationSummary(req, res, next) {
  try {
    const summary = await unifiedCorrelationService.getIncidentCorrelationSummary(req.params.incidentId);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentEvidence(req, res, next) {
  try {
    const evidence = await unifiedCorrelationService.getIncidentEvidence(req.params.incidentId);
    res.json({ success: true, data: evidence });
  } catch (error) {
    next(error);
  }
}

export async function getServiceEventHistory(req, res, next) {
  try {
    const options = {
      limit: parseInt(req.query.limit, 10) || 50,
      offset: parseInt(req.query.offset, 10) || 0
    };
    const result = await unifiedCorrelationService.getServiceEventHistory(req.params.serviceId, options);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

