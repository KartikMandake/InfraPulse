import * as timelineService from '../services/timeline.service.js';

export function getIncidentTimeline(req, res, next) {
  try {
    const { incidentId } = req.params;
    const { timeWindowMinutes, limit, simulationId } = req.query;

    const timeline = timelineService.buildIncidentTimeline(incidentId, {
      timeWindowMinutes: timeWindowMinutes ? parseInt(timeWindowMinutes, 10) : 120,
      limit: limit ? parseInt(limit, 10) : 100,
      simulationId
    });

    res.json({
      success: true,
      data: timeline
    });
  } catch (err) {
    next(err);
  }
}

