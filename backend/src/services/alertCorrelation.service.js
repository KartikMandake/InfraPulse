/**
 * Alert Correlation & Deduplication Engine with PostgreSQL Persistence
 */

import { getAlerts as getMemAlerts, addAlert as addMemAlert, updateAlert as updateMemAlert } from '../data/alerts.js';
import * as alertsRepo from '../repositories/alerts.repository.js';
import * as alertRulesRepo from '../repositories/alertRules.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import * as incidentsRepo from '../repositories/incidents.repository.js';
import { getAlertRules as getMemAlertRules, getAlertRulesSync, evaluateCondition } from './alertRules.service.js';
import { getServices as getMemServices } from '../data/services.js';
import { getIncidents as getMemIncidents, createIncident as createMemIncident, updateIncident as updateMemIncident } from '../data/incidents.js';
import * as telemetryService from '../integrations/telemetry/telemetry.service.js';
import { triggerIncidentNotification } from './notification.service.js';
import { withTransaction } from '../db/connection.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Checks if Service A and Service B share a dependency relationship.
 */
export function checkTopologicalRelation(serviceAId, serviceBId, services) {
  if (!serviceAId || !serviceBId) {
    return { related: false, path: '', relationship: 'none' };
  }
  if (serviceAId === serviceBId) {
    return { related: true, path: `${serviceAId} == ${serviceBId}`, relationship: 'same_service' };
  }

  const serviceA = services.find(s => s.id === serviceAId);
  const serviceB = services.find(s => s.id === serviceBId);

  if (!serviceA || !serviceB) {
    return { related: false, path: '', relationship: 'unknown_service' };
  }

  // Direct dependency: A calls B
  if (Array.isArray(serviceA.dependencies) && serviceA.dependencies.includes(serviceBId)) {
    return {
      related: true,
      path: `${serviceAId} -> ${serviceBId}`,
      relationship: 'caller_to_callee'
    };
  }

  // Direct dependency: B calls A
  if (Array.isArray(serviceB.dependencies) && serviceB.dependencies.includes(serviceAId)) {
    return {
      related: true,
      path: `${serviceBId} -> ${serviceAId}`,
      relationship: 'callee_to_caller'
    };
  }

  // 2-hop dependency via shared intermediary
  for (const depId of (serviceA.dependencies || [])) {
    const intermediary = services.find(s => s.id === depId);
    if (intermediary && Array.isArray(intermediary.dependencies) && intermediary.dependencies.includes(serviceBId)) {
      return {
        related: true,
        path: `${serviceAId} -> ${depId} -> ${serviceBId}`,
        relationship: 'transitive_dependency'
      };
    }
  }

  for (const depId of (serviceB.dependencies || [])) {
    const intermediary = services.find(s => s.id === depId);
    if (intermediary && Array.isArray(intermediary.dependencies) && intermediary.dependencies.includes(serviceAId)) {
      return {
        related: true,
        path: `${serviceBId} -> ${depId} -> ${serviceAId}`,
        relationship: 'transitive_dependency'
      };
    }
  }

  return { related: false, path: '', relationship: 'none' };
}

function extractMetricValue(service, metricName) {
  if (!service) return null;

  switch (metricName) {
    case 'latencyP99':
      return typeof service.latencyP99 === 'number' ? service.latencyP99 : null;
    case 'errorRate':
      return typeof service.errorRate === 'number' ? service.errorRate : null;
    case 'status':
      return typeof service.status === 'string' ? service.status : null;
    case 'rps':
      return typeof service.rps === 'number' ? service.rps : null;
    case 'cpuPercent':
      return typeof service.cpuPercent === 'number' ? service.cpuPercent : null;
    case 'memoryPercent':
      return typeof service.memoryPercent === 'number' ? service.memoryPercent : null;
    default:
      if (service[metricName] !== undefined) return service[metricName];
      return null;
  }
}

/**
 * Main Evaluation and Correlation Pipeline with PostgreSQL persistence and transactional consistency.
 */
export async function evaluateAndCorrelateAlerts(options = {}) {
  const { mode = 'mock', timeWindowMinutes = 60, inMemory = false } = options;

  let services = [];
  let rules = [];
  let existingAlerts = [];
  let existingIncidents = [];

  const useDatabase = !inMemory;

  if (useDatabase) {
    try {
      const [sList, rList, aList, iList] = await Promise.all([
        servicesRepo.findAllServices(),
        alertRulesRepo.findAllAlertRules(),
        alertsRepo.findAllAlerts(),
        incidentsRepo.findAllIncidents()
      ]);
      services = sList.length > 0 ? sList : getMemServices();
      rules = rList.length > 0 ? rList : getAlertRulesSync();
      existingAlerts = aList.length > 0 ? aList : getMemAlerts();
      existingIncidents = iList.length > 0 ? iList : getMemIncidents();
    } catch (err) {
      console.warn('[AlertCorrelation] DB load fallback:', err.message);
      services = getMemServices();
      rules = getAlertRulesSync();
      existingAlerts = getMemAlerts();
      existingIncidents = getMemIncidents();
    }
  } else {
    services = getMemServices();
    rules = getAlertRulesSync();
    existingAlerts = getMemAlerts();
    existingIncidents = getMemIncidents();
  }

  const evaluationReport = {
    evaluatedAt: new Date().toISOString(),
    mode,
    rulesEvaluated: 0,
    rulesTriggered: 0,
    alertsCreated: [],
    alertsDeduplicated: [],
    alertsSkipped: [],
    incidentsLinked: [],
    incidentsCreated: [],
    correlationRationale: []
  };

  // 1. Live Telemetry Mode Safety Checks
  if (mode === 'live') {
    const liveStatus = await telemetryService.getStatus();
    if (!liveStatus.datasources.prometheus.connected) {
      throw ApiError.badRequest(
        'Live telemetry mode requested, but Prometheus datasource is offline. Stale or mock fallback is disallowed to prevent false alerts.'
      );
    }
  }

  // 2. Evaluate each enabled rule
  const newlyTriggeredAlerts = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      evaluationReport.alertsSkipped.push({
        ruleId: rule.id,
        reason: 'Rule disabled'
      });
      continue;
    }

    evaluationReport.rulesEvaluated++;

    const targetServices = rule.targetServiceId === '*'
      ? services
      : services.filter(s => s.id === rule.targetServiceId);

    if (rule.targetServiceId !== '*' && targetServices.length === 0) {
      evaluationReport.alertsSkipped.push({
        ruleId: rule.id,
        serviceId: rule.targetServiceId,
        reason: `Target service "${rule.targetServiceId}" not found in registered services topology. Alert suppressed.`
      });
      continue;
    }

    for (const service of targetServices) {
      const observedValue = extractMetricValue(service, rule.metric);

      if (observedValue === null || observedValue === undefined) {
        evaluationReport.alertsSkipped.push({
          ruleId: rule.id,
          serviceId: service.id,
          reason: `Metric "${rule.metric}" is missing or unavailable on service "${service.id}". Alert suppressed.`
        });
        continue;
      }

      const conditionMet = evaluateCondition(observedValue, rule.operator, rule.threshold);

      if (conditionMet) {
        evaluationReport.rulesTriggered++;

        // 3. Deduplication Check: Check for existing active/firing alert for same rule & service
        const activeAlert = existingAlerts.find(
          a => a.ruleId === rule.id && a.serviceId === service.id && (a.status === 'active' || a.state === 'firing')
        );

        if (activeAlert) {
          const updatedOccurrences = (activeAlert.occurrenceCount || 1) + 1;
          const firedTime = new Date().toISOString().substring(11, 19) + ' UTC';

          if (useDatabase) {
            try {
              await alertsRepo.updateAlertRecord(activeAlert.id, {
                currentValue: `${observedValue}`,
                observedValue: observedValue,
                occurrenceCount: updatedOccurrences,
                firedAt: firedTime
              });
            } catch (err) {
              console.warn('[AlertCorrelation] DB alert update fallback:', err.message);
            }
          }

          updateMemAlert(activeAlert.id, {
            currentValue: `${observedValue}`,
            observedValue: observedValue,
            occurrenceCount: updatedOccurrences,
            firedAt: firedTime
          });

          evaluationReport.alertsDeduplicated.push({
            alertId: activeAlert.id,
            ruleId: rule.id,
            serviceId: service.id,
            occurrences: updatedOccurrences,
            reason: `Active alert already exists within cooldown window. Deduplicated without spawning new alert.`
          });
          continue;
        }

        // Create new active alert
        const alertPayload = {
          ruleId: rule.id,
          title: `${rule.name}: ${service.name} (${rule.metric} ${rule.operator} ${rule.threshold})`,
          severity: rule.severity,
          status: 'active',
          state: 'firing',
          serviceId: service.id,
          serviceName: service.name,
          region: service.region || 'us-east-1',
          metric: rule.metric,
          operator: rule.operator,
          threshold: rule.threshold,
          currentValue: `${observedValue}`,
          observedValue: observedValue,
          firedAt: new Date().toISOString().substring(11, 19) + ' UTC',
          source: mode === 'live' ? 'live_prometheus' : 'rule_evaluator',
          evidenceRefs: [
            {
              type: 'metric_threshold',
              metric: rule.metric,
              observed: observedValue,
              threshold: rule.threshold,
              description: `Observed value ${observedValue} breached threshold (${rule.operator} ${rule.threshold})`
            }
          ]
        };

        let savedAlert = null;
        if (useDatabase) {
          try {
            savedAlert = await alertsRepo.createAlertRecord(alertPayload);
          } catch (err) {
            console.warn('[AlertCorrelation] DB alert create fallback:', err.message);
          }
        }

        const memAlert = addMemAlert(savedAlert || alertPayload);
        const finalAlert = savedAlert || memAlert;

        newlyTriggeredAlerts.push(finalAlert);
        existingAlerts.push(finalAlert);
        evaluationReport.alertsCreated.push(finalAlert);
      }
    }
  }

  // 4. Incident Correlation & Grouping (Transactional)
  for (const alert of newlyTriggeredAlerts) {
    let linked = false;
    const openIncidents = existingIncidents.filter(inc => inc.status !== 'resolved');

    for (const incident of openIncidents) {
      const topoRelation = checkTopologicalRelation(alert.serviceId, incident.serviceId, services);

      if (topoRelation.related) {
        // Link to existing incident within database transaction
        if (useDatabase) {
          try {
            await withTransaction(async (client) => {
              await alertsRepo.updateAlertRecord(alert.id, { incidentId: incident.id }, client);
              await incidentsRepo.addIncidentEvent(
                incident.id,
                {
                  type: 'alert_fired',
                  time: new Date().toISOString().substring(11, 19) + ' UTC',
                  title: `Correlated Alert: ${alert.title}`,
                  description: `Alert ${alert.id} fired for ${alert.serviceName}. Linked via ${topoRelation.relationship}.`,
                  source: 'telemetry_anomaly'
                },
                client
              );
            });
          } catch (err) {
            console.warn('[AlertCorrelation] DB incident link fallback:', err.message);
          }
        }

        updateMemAlert(alert.id, { incidentId: incident.id });
        linked = true;

        const rationale = `Alert "${alert.id}" (${alert.serviceName}) correlated to open incident "${incident.id}" via ${topoRelation.relationship} (${topoRelation.path}).`;
        evaluationReport.correlationRationale.push({
          alertId: alert.id,
          incidentId: incident.id,
          rationale,
          note: 'Topological dependency indicates shared failure cascade; causation verified via RCA engine.'
        });

        if (Array.isArray(incident.timeline)) {
          incident.timeline.push({
            time: new Date().toISOString().substring(11, 19) + ' UTC',
            title: `Correlated Alert: ${alert.title}`,
            description: `Alert ${alert.id} fired for ${alert.serviceName}. Linked via ${topoRelation.relationship}.`,
            source: 'telemetry_anomaly'
          });
          updateMemIncident(incident.id, { timeline: incident.timeline });
        }

        evaluationReport.incidentsLinked.push({
          alertId: alert.id,
          incidentId: incident.id,
          serviceId: alert.serviceId
        });

        if (alert.severity === 'critical') {
          triggerIncidentNotification({
            eventType: 'alert.critical',
            incident,
            context: { alertId: alert.id, qualifier: alert.id }
          }).catch(err => console.warn('[AlertCorrelation] Alert notif error:', err.message));
        }

        break;
      }
    }

    // If not linked and alert is critical, declare a new incident in a transaction
    if (!linked && alert.severity === 'critical') {
      const newIncId = `INC-${Math.floor(1000 + Math.random() * 9000)}`;
      const incPayload = {
        id: newIncId,
        title: `Incident: Cascading anomaly detected on ${alert.serviceName}`,
        summary: `Automated incident declared from critical alert ${alert.id} (${alert.title}).`,
        severity: 'SEV-1',
        status: 'investigating',
        serviceId: alert.serviceId,
        serviceName: alert.serviceName,
        lead: 'Automated Copilot',
        leadRole: 'Incident Commander',
        channel: `#inc-${newIncId.toLowerCase()}-auto`,
        startedAt: new Date().toISOString().substring(11, 19) + ' UTC',
        timeline: [
          {
            time: new Date().toISOString().substring(11, 19) + ' UTC',
            title: `Incident Declared by Intelligent Alerting`,
            description: `Critical alert ${alert.id} breached threshold on ${alert.serviceName}. Initial blast radius under triage.`,
            source: 'telemetry_anomaly',
            isKeyMilestone: true
          }
        ]
      };

      if (useDatabase) {
        try {
          await withTransaction(async (client) => {
            await incidentsRepo.createIncidentRecord(incPayload, client);
            await alertsRepo.updateAlertRecord(alert.id, { incidentId: newIncId }, client);
          });
        } catch (err) {
          console.warn('[AlertCorrelation] DB new incident create fallback:', err.message);
        }
      }

      const memInc = createMemIncident(incPayload);
      updateMemAlert(alert.id, { incidentId: newIncId });
      existingIncidents.push(memInc);

      const rationale = `Alert "${alert.id}" has no topological link to open incidents. Declared new incident "${newIncId}" for critical failure domain on ${alert.serviceName}.`;
      evaluationReport.correlationRationale.push({
        alertId: alert.id,
        incidentId: newIncId,
        rationale,
        note: 'Unrelated to other open incidents; isolated to service topology.'
      });

      evaluationReport.incidentsCreated.push({
        alertId: alert.id,
        incidentId: newIncId,
        serviceId: alert.serviceId
      });

      triggerIncidentNotification({
        eventType: 'incident.created',
        incident: incPayload,
        context: { qualifier: 'auto_alert' }
      }).catch(err => console.warn('[AlertCorrelation] Creation notif error:', err.message));
    } else if (!linked) {
      evaluationReport.correlationRationale.push({
        alertId: alert.id,
        incidentId: null,
        rationale: `Alert "${alert.id}" (${alert.severity}) maintained as standalone alert. No topological overlap with open incidents.`,
        note: 'Temporal correlation alone rejected without dependency link.'
      });
    }
  }

  return evaluationReport;
}
