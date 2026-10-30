import * as incidentsRepo from '../repositories/incidents.repository.js';
import { getIncidents as getMemIncidents, getIncidentById as getMemIncidentById, updateIncident as updateMemIncident, createIncident as createMemIncident } from '../data/incidents.js';
import { triggerIncidentNotification } from './notification.service.js';
import { invalidateInvestigationCache } from './investigation.service.js';
import { ApiError } from '../utils/ApiError.js';

export async function listIncidents() {
  try {
    const data = await incidentsRepo.findAllIncidents();
    if (data && data.length > 0) return data;
  } catch (err) {
    console.warn('[IncidentsService] DB fallback to memory:', err.message);
  }
  return getMemIncidents();
}

export async function findIncidentById(id) {
  try {
    const incident = await incidentsRepo.findIncidentById(id);
    if (incident) return incident;
  } catch (err) {
    console.warn('[IncidentsService] DB fallback to memory:', err.message);
  }

  const memIncident = getMemIncidentById(id);
  if (!memIncident) {
    throw ApiError.notFound(`Incident with ID "${id}" was not found.`);
  }
  return memIncident;
}

export async function modifyIncident(id, updates) {
  invalidateInvestigationCache(id);
  let existing = null;
  try {
    existing = await incidentsRepo.findIncidentById(id);
  } catch (err) {
    existing = getMemIncidentById(id);
  }

  let finalResult = null;
  try {
    const updated = await incidentsRepo.updateIncidentRecord(id, updates);
    if (updated) {
      updateMemIncident(id, updates);
      finalResult = updated;
    }
  } catch (err) {
    console.warn('[IncidentsService] DB fallback to memory:', err.message);
  }

  if (!finalResult) {
    const memUpdated = updateMemIncident(id, updates);
    if (!memUpdated) {
      throw ApiError.notFound(`Incident with ID "${id}" was not found.`);
    }
    finalResult = memUpdated;
  }

  // Trigger appropriate decoupled notifications based on state changes
  if (existing && finalResult) {
    if (updates.status === 'resolved' && existing.status !== 'resolved') {
      await triggerIncidentNotification({
        eventType: 'incident.resolved',
        incident: finalResult,
        context: { previousStatus: existing.status }
      }).catch(err => console.warn('[IncidentsService] Resolved notif error:', err.message));
    }

    if (updates.severity && updates.severity !== existing.severity) {
      await triggerIncidentNotification({
        eventType: 'incident.escalated',
        incident: finalResult,
        context: { previousSeverity: existing.severity }
      }).catch(err => console.warn('[IncidentsService] Escalated notif error:', err.message));
    }

    if (updates.lead && updates.lead !== existing.lead) {
      await triggerIncidentNotification({
        eventType: 'incident.assigned',
        incident: finalResult,
        context: { previousLead: existing.lead }
      }).catch(err => console.warn('[IncidentsService] Assigned notif error:', err.message));
    }
  }

  return finalResult;
}

export async function addIncident(data) {
  let createdIncident = null;
  try {
    const created = await incidentsRepo.createIncidentRecord(data);
    if (created) {
      createMemIncident(data);
      createdIncident = created;
    }
  } catch (err) {
    console.warn('[IncidentsService] DB fallback to memory:', err.message);
  }

  if (!createdIncident) {
    createdIncident = createMemIncident(data);
  }

  // Trigger decoupled notification for new incident creation
  if (createdIncident) {
    await triggerIncidentNotification({
      eventType: 'incident.created',
      incident: createdIncident,
      context: { qualifier: 'creation' }
    }).catch(err => console.warn('[IncidentsService] Creation notif error:', err.message));
  }

  return createdIncident;
}
