import * as reliabilityService from '../services/reliability.service.js';

export async function getServiceReliability(req, res, next) {
  try {
    const data = await reliabilityService.getServiceReliability(req.params.serviceId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getReliabilityOverview(req, res, next) {
  try {
    const data = await reliabilityService.getReliabilityOverview();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getIncidentSloImpact(req, res, next) {
  try {
    const data = await reliabilityService.getIncidentSloImpact(req.params.incidentId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

