import {tenantContext} from '../security/tenantContext.js';
import * as alertsRepo from '../repositories/alerts.repository.js';
import * as alertRulesRepo from '../repositories/alertRules.repository.js';
import * as incidentsRepo from '../repositories/incidents.repository.js';
import { getAlerts as unsafe_getMemAlerts, getAlertById as unsafe_getMemAlertById, updateAlert as unsafe_updateMemAlert } from '../data/alerts.js';
import { createAlertRule, updateAlertRule } from '../services/alertRules.service.js';
import { evaluateAndCorrelateAlerts } from '../services/alertCorrelation.service.js';
import { withTransaction } from '../db/connection.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * GET /api/alerts
 * Supports query params: status, state, severity, serviceId, incidentId
 */
export async function getAllAlerts(req, res, next) {
  try {
    const filters = {
      status: req.query.status,
      state: req.query.state,
      severity: req.query.severity,
      serviceId: req.query.serviceId,
      incidentId: req.query.incidentId
    };

    let data = [];
    try {
      data = await alertsRepo.findAllAlerts(filters);
    } catch (err) {
    if(tenantContext())throw err;
      console.warn('[AlertsController] DB read fallback:', err.message);
      data = getMemAlerts(filters);
    }

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/alerts/:alertId
 */
export async function getAlertDetails(req, res, next) {
  try {
    let alert = null;
    try {
      alert = await alertsRepo.findAlertById(req.params.alertId);
    } catch (err) {
    if(tenantContext())throw err;
      console.warn('[AlertsController] DB read fallback:', err.message);
      alert = getMemAlertById(req.params.alertId);
    }

    if (!alert) {
      throw ApiError.notFound(`Alert "${req.params.alertId}" not found.`);
    }
    res.json({ success: true, data: alert });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/alerts/:alertId/acknowledge
 * Updates alert state and logs milestone to incident timeline in a transaction.
 */
export async function acknowledgeAlert(req, res, next) {
  try {
    const nowIso = new Date().toISOString();
    let updated = null;

    try {
      updated = await withTransaction(async (client) => {
        const alt = await alertsRepo.updateAlertRecord(
          req.params.alertId,
          {
            status: 'acknowledged',
            state: 'acknowledged',
            acknowledgedAt: nowIso
          },
          client
        );

        if (!alt) return null;

        // If correlated with an incident, record milestone event
        if (alt.incidentId) {
          await incidentsRepo.addIncidentEvent(
            alt.incidentId,
            {
              type: 'alert_acknowledged',
              time: nowIso.substring(11, 19) + ' UTC',
              title: `Alert Acknowledged: ${alt.title}`,
              description: `Responder acknowledged alert ${alt.id} (${alt.serviceName}). Triage assigned.`,
              source: 'engineer_action'
            },
            client
          );
        }

        return alt;
      });
    } catch (err) {
    if(tenantContext())throw err;
      console.warn('[AlertsController] DB ack fallback:', err.message);
    }

    const memUpdated = updateMemAlert(req.params.alertId, {
      status: 'acknowledged',
      state: 'acknowledged',
      acknowledgedAt: nowIso
    });

    const finalResult = updated || memUpdated;
    if (!finalResult) {
      throw ApiError.notFound(`Alert "${req.params.alertId}" not found.`);
    }

    res.json({ success: true, message: `Alert ${req.params.alertId} acknowledged.`, data: finalResult });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/alerts/:alertId/resolve
 * Updates alert state to resolved and logs resolution event in a transaction.
 */
export async function resolveAlert(req, res, next) {
  try {
    const nowIso = new Date().toISOString();
    let updated = null;

    try {
      updated = await withTransaction(async (client) => {
        const alt = await alertsRepo.updateAlertRecord(
          req.params.alertId,
          {
            status: 'resolved',
            state: 'resolved',
            resolvedAt: nowIso
          },
          client
        );

        if (!alt) return null;

        // If correlated with an incident, record milestone event
        if (alt.incidentId) {
          await incidentsRepo.addIncidentEvent(
            alt.incidentId,
            {
              type: 'alert_resolved',
              time: nowIso.substring(11, 19) + ' UTC',
              title: `Alert Resolved: ${alt.title}`,
              description: `Alert ${alt.id} (${alt.serviceName}) returned within acceptable operating threshold.`,
              source: 'engineer_action'
            },
            client
          );
        }

        return alt;
      });
    } catch (err) {
    if(tenantContext())throw err;
      console.warn('[AlertsController] DB resolve fallback:', err.message);
    }

    const memUpdated = updateMemAlert(req.params.alertId, {
      status: 'resolved',
      state: 'resolved',
      resolvedAt: nowIso
    });

    const finalResult = updated || memUpdated;
    if (!finalResult) {
      throw ApiError.notFound(`Alert "${req.params.alertId}" not found.`);
    }

    res.json({ success: true, message: `Alert ${req.params.alertId} resolved.`, data: finalResult });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/alerts/:alertId (General updates & backward compatibility)
 */
export async function updateAlertState(req, res, next) {
  try {
    let updated = null;
    try {
      updated = await alertsRepo.updateAlertRecord(req.params.alertId, req.body);
    } catch (err) {
    if(tenantContext())throw err;
      console.warn('[AlertsController] DB update fallback:', err.message);
    }

    const memUpdated = updateMemAlert(req.params.alertId, req.body);
    const finalResult = updated || memUpdated;

    if (!finalResult) {
      throw ApiError.notFound(`Alert "${req.params.alertId}" not found.`);
    }
    res.json({ success: true, data: finalResult });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/alerts/evaluate
 */
export async function evaluateAlerts(req, res, next) {
  try {
    const mode = req.body?.mode || req.query.mode || 'mock';
    const timeWindowMinutes = Number(req.body?.timeWindowMinutes || 60);

    const report = await evaluateAndCorrelateAlerts({ mode, timeWindowMinutes });
    let currentAlerts = [];
    try {
      currentAlerts = await alertsRepo.findAllAlerts();
    } catch {
      currentAlerts = getMemAlerts();
    }

    res.json({
      success: true,
      message: `Alert evaluation completed in ${mode} mode.`,
      report,
      alerts: currentAlerts
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/alert-rules
 */
export async function getAllAlertRules(req, res, next) {
  try {
    let rules = [];
    try {
      rules = await alertRulesRepo.findAllAlertRules();
    } catch (err) {
    if(tenantContext())throw err;
      console.warn('[AlertsController] DB read fallback:', err.message);
    }

    res.json({ success: true, count: rules.length, data: rules });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/alert-rules
 */
export async function createRule(req, res, next) {
  try {
    const newRule = await createAlertRule(req.body);
    res.status(201).json({ success: true, message: 'Alert rule created successfully.', data: newRule });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/alert-rules/:ruleId
 */
export async function updateRule(req, res, next) {
  try {
    const updated = await updateAlertRule(req.params.ruleId, req.body);
    res.json({ success: true, message: `Alert rule ${req.params.ruleId} updated.`, data: updated });
  } catch (error) {
    next(error);
  }
}

const getMemAlerts=(...args)=>tenantContext()?[]:unsafe_getMemAlerts(...args);

const getMemAlertById=(...args)=>tenantContext()?null:unsafe_getMemAlertById(...args);

const updateMemAlert=(...args)=>tenantContext()?null:unsafe_updateMemAlert(...args);
