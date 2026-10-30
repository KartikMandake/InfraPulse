import * as investigationService from '../services/investigation.service.js';

export async function getInvestigation(req, res, next) {
  try {
    const data = await investigationService.getIncidentInvestigation(req.params.incidentId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function runInvestigation(req, res, next) {
  try {
    const data = await investigationService.runIncidentInvestigation(req.params.incidentId, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
