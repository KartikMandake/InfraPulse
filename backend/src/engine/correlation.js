import { parseTimeToMinutes } from './scoring.js';

/**
 * Correlates deployments that occurred within a configurable window before the incident.
 */
export function correlateDeployments(service, incident, deployments, windowMinutes = 120) {
  if (!service || !deployments) return [];
  const incidentMin = parseTimeToMinutes(incident?.startedAt);

  return deployments.filter(dep => {
    const depName = (dep.serviceName || dep.service_name || dep.serviceId || dep.service_id || '').toLowerCase();
    const sId = (service.id || '').toLowerCase();
    const sName = (service.name || '').toLowerCase();
    const matchesService = depName === sId || depName === sName;
    
    if (!matchesService) return false;
    if (incidentMin === null) return true;

    const depMin = parseTimeToMinutes(dep.timestamp || dep.deployed_at || dep.deployedAt);
    if (depMin === null) return true;

    const deltaMinutes = incidentMin - depMin;
    return deltaMinutes >= -5 && deltaMinutes <= windowMinutes;
  });
}

/**
 * Correlates active or firing alerts with a candidate service.
 */
export function correlateAlerts(service, alerts) {
  if (!service || !alerts) return [];
  return alerts.filter(a => {
    const aId = a.serviceId || a.service_id;
    const aName = (a.serviceName || a.service_name || '').toLowerCase();
    const sId = (service.id || '').toLowerCase();
    const sName = (service.name || '').toLowerCase();
    return aId === service.id || aName === sId || aName === sName;
  });
}

/**
 * Traces topology distance between impacted service and candidate service.
 */
export function correlateTopology(candidateService, impactedService, allServices) {
  if (!candidateService || !impactedService) {
    return { relationship: 'unrelated', distance: Infinity };
  }

  if (candidateService.id === impactedService.id) {
    return { relationship: 'self', distance: 0 };
  }

  // Downstream check (impacted calls candidate)
  if (impactedService.dependencies?.includes(candidateService.id)) {
    return { relationship: 'direct_downstream_callee', distance: 1 };
  }

  // Upstream check (candidate calls impacted)
  if (candidateService.dependencies?.includes(impactedService.id)) {
    return { relationship: 'direct_upstream_caller', distance: 1 };
  }

  // 2-hop check
  const is2Hop = (impactedService.dependencies || []).some(dId => {
    const intermediate = (allServices || []).find(s => s.id === dId);
    return intermediate?.dependencies?.includes(candidateService.id);
  });

  if (is2Hop) {
    return { relationship: '2_hop_downstream', distance: 2 };
  }

  return { relationship: 'unconnected', distance: Infinity };
}

