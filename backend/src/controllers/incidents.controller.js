import * as incidentsService from '../services/incidents.service.js';

export async function getAllIncidents(req, res, next) {
  try {
    const data = await incidentsService.listIncidents();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentById(req, res, next) {
  try {
    const data = await incidentsService.findIncidentById(req.params.incidentId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createIncident(req, res, next) {
  try {
    const data = await incidentsService.addIncident(req.body);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateIncident(req, res, next) {
  try {
    const data = await incidentsService.modifyIncident(req.params.incidentId, req.body);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
