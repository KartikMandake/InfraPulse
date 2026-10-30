export const DEFAULT_SCORING_WEIGHTS = {
  anomalySeverity: 0.30,
  deploymentTiming: 0.25,
  dependencyRelationship: 0.25,
  supportingLogs: 0.20
};

/**
 * Parses time strings such as "14:34:12 UTC", "14:22:04 UTC (35m ago)", or ISO strings into minutes.
 */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }
  const isoDate = Date.parse(timeStr);
  if (!isNaN(isoDate)) {
    const d = new Date(isoDate);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  return null;
}

/**
 * 1. Anomaly Severity Scoring (Weight 30%)
 */
export function calculateAnomalyScore(service, serviceAlerts) {
  let rawScore = 0;
  const evidence = [];

  const criticalAlerts = (serviceAlerts || []).filter(a => a.severity === 'critical' && a.state === 'firing');
  const warningAlerts = (serviceAlerts || []).filter(a => a.severity === 'warning' && a.state === 'firing');

  if (criticalAlerts.length > 0) {
    rawScore += Math.min(55, criticalAlerts.length * 35);
    for (const alt of criticalAlerts) {
      evidence.push({
        id: `ev-alt-${alt.id}`,
        type: 'anomaly',
        severity: 'critical',
        title: `Critical Alert: ${alt.title}`,
        description: `Metric ${alt.metric} triggered threshold ${alt.threshold}. Current value: ${alt.currentValue}.`,
        timestamp: alt.firedAt,
        metricValue: alt.currentValue,
        sourceRef: alt.id
      });
    }
  }

  if (warningAlerts.length > 0) {
    rawScore += Math.min(25, warningAlerts.length * 15);
    for (const alt of warningAlerts) {
      evidence.push({
        id: `ev-alt-${alt.id}`,
        type: 'anomaly',
        severity: 'medium',
        title: `Warning Alert: ${alt.title}`,
        description: `Metric ${alt.metric} exceeded threshold ${alt.threshold}.`,
        timestamp: alt.firedAt,
        metricValue: alt.currentValue,
        sourceRef: alt.id
      });
    }
  }

  if (service.status === 'critical') {
    rawScore += 25;
  } else if (service.status === 'degraded') {
    rawScore += 15;
  }

  if (service.latencyBaseline > 0 && service.latencyP99 > service.latencyBaseline * 2) {
    const multiplier = (service.latencyP99 / service.latencyBaseline).toFixed(1);
    rawScore += Math.min(25, 10 + (service.latencyP99 / service.latencyBaseline) * 3);
    evidence.push({
      id: `ev-lat-${service.id}`,
      type: 'anomaly',
      severity: service.latencyP99 > service.latencyBaseline * 5 ? 'critical' : 'high',
      title: `P99 Latency Surge (${multiplier}x baseline)`,
      description: `P99 latency surged to ${service.latencyP99}ms against baseline of ${service.latencyBaseline}ms.`,
      metricValue: `${service.latencyP99}ms`
    });
  }

  if (service.errorRate > 2.0) {
    rawScore += 20;
    evidence.push({
      id: `ev-err-${service.id}`,
      type: 'anomaly',
      severity: service.errorRate > 5.0 ? 'critical' : 'high',
      title: `Elevated Service Error Rate (${service.errorRate}%)`,
      description: `Service error rate is currently ${service.errorRate}%, exceeding nominal 0.05% threshold.`,
      metricValue: `${service.errorRate}%`
    });
  } else if (service.errorRate > 0.5) {
    rawScore += 10;
  }

  const degradedPods = (service.pods || []).filter(p => p.status === 'Degraded' || p.status === 'CrashLoopBackOff');
  if (degradedPods.length > 0) {
    rawScore += 15;
    evidence.push({
      id: `ev-pods-${service.id}`,
      type: 'anomaly',
      severity: 'high',
      title: `${degradedPods.length} Degraded Pod Instance(s)`,
      description: `Pods (${degradedPods.map(p => p.name).join(', ')}) are in degraded or crashloop state.`,
      metricValue: `${degradedPods.length} pods`
    });
  }

  const normalized = Math.min(100, Math.max(0, Math.round(rawScore)));
  return { score: normalized, evidence };
}

/**
 * 2. Deployment Timing Correlation Scoring (Weight 25%)
 */
export function calculateDeploymentScore(service, incident, deployments) {
  const serviceDeploys = (deployments || []).filter(
    d => {
      const depName = (d.serviceName || d.serviceId || '').toLowerCase();
      const sId = (service.id || '').toLowerCase();
      const sName = (service.name || '').toLowerCase();
      return depName === sId || depName === sName;
    }
  );

  const evidence = [];
  const uncertainty = [];
  const relevantDeployments = [];

  if (serviceDeploys.length === 0) {
    uncertainty.push(`No recent deployment records found for service "${service.name}".`);
    return { score: 0, evidence, relevantDeployments, uncertainty };
  }

  const incidentMin = parseTimeToMinutes(incident.startedAt);
  let maxScore = 0;

  for (const dep of serviceDeploys) {
    let depScore = 0;
    const depMin = parseTimeToMinutes(dep.timestamp);

    if (incidentMin !== null && depMin !== null) {
      const deltaMinutes = incidentMin - depMin;
      if (deltaMinutes >= -5 && deltaMinutes <= 45) {
        depScore += 70;
      } else if (deltaMinutes > 45 && deltaMinutes <= 120) {
        depScore += 40;
      } else if (deltaMinutes > 120 && deltaMinutes <= 360) {
        depScore += 15;
      } else {
        depScore += 5;
      }
    } else {
      depScore += 35;
    }

    if (dep.status === 'unhealthy') {
      depScore += 25;
    }
    if (dep.acaScore < 60) {
      depScore += 20;
    } else if (dep.acaScore < 80) {
      depScore += 10;
    }

    if (depScore > maxScore) {
      maxScore = depScore;
    }

    if (depScore >= 30) {
      relevantDeployments.push(dep);
      evidence.push({
        id: `ev-dep-${dep.id}`,
        type: 'deployment',
        severity: dep.status === 'unhealthy' ? 'critical' : 'high',
        title: `Deployment ${dep.version} (${dep.environment})`,
        description: `Deployed at ${dep.timestamp}. ACA Canary score: ${dep.acaScore}/100. Status: ${dep.status}. Commit: "${dep.commitMessage}"`,
        timestamp: dep.timestamp,
        metricValue: `ACA ${dep.acaScore}`,
        sourceRef: dep.id
      });
    }
  }

  const normalized = Math.min(100, Math.max(0, Math.round(maxScore)));
  return { score: normalized, evidence, relevantDeployments, uncertainty };
}

/**
 * 3. Dependency Relationship Scoring (Weight 25%)
 */
export function calculateDependencyScore(candidateService, incidentService, allServices) {
  const evidence = [];
  const uncertainty = [];

  if (!incidentService) {
    uncertainty.push('Incident primary service could not be resolved from topology graph.');
    return { score: 20, evidence, uncertainty };
  }

  if (candidateService.id === incidentService.id) {
    evidence.push({
      id: `ev-dep-self-${candidateService.id}`,
      type: 'dependency',
      severity: 'high',
      title: 'Direct Incident Target Service',
      description: `Service "${candidateService.name}" is directly declared as the impacted component in the incident ticket.`
    });
    return { score: 90, evidence, uncertainty };
  }

  const incidentDirectDependencies = incidentService.dependencies || [];
  if (incidentDirectDependencies.includes(candidateService.id)) {
    evidence.push({
      id: `ev-dep-downstream-${candidateService.id}`,
      type: 'dependency',
      severity: 'critical',
      title: 'Direct Downstream Dependency (Callee)',
      description: `Impacted service "${incidentService.name}" directly calls candidate "${candidateService.name}". Downstream errors or lockups directly propagate upstream.`
    });
    return { score: 95, evidence, uncertainty };
  }

  const candidateDirectDependencies = candidateService.dependencies || [];
  if (candidateDirectDependencies.includes(incidentService.id)) {
    evidence.push({
      id: `ev-dep-upstream-${candidateService.id}`,
      type: 'dependency',
      severity: 'medium',
      title: 'Direct Upstream Dependency (Caller)',
      description: `Candidate service "${candidateService.name}" calls impacted service "${incidentService.name}". Frequently suffers cascading timeouts.`
    });
    return { score: 55, evidence, uncertainty };
  }

  const is2HopDownstream = incidentDirectDependencies.some(dId => {
    const intermediate = (allServices || []).find(s => s.id === dId);
    return intermediate?.dependencies?.includes(candidateService.id);
  });

  if (is2HopDownstream) {
    evidence.push({
      id: `ev-dep-2hop-${candidateService.id}`,
      type: 'dependency',
      severity: 'low',
      title: 'Secondary (2-Hop) Downstream Dependency',
      description: `Candidate "${candidateService.name}" is reached via a 2-hop downstream path from "${incidentService.name}".`
    });
    return { score: 35, evidence, uncertainty };
  }

  uncertainty.push(`No topology path discovered between "${candidateService.name}" and "${incidentService.name}".`);
  return { score: 5, evidence, uncertainty };
}

/**
 * 4. Supporting Log & Distributed Trace Evidence Scoring (Weight 20%)
 */
export function calculateLogAndTraceScore(service, logs, traces) {
  let rawScore = 0;
  const evidence = [];
  const uncertainty = [];

  const serviceLogs = (logs || []).filter(
    l => l.serviceId === service.id || l.service?.toLowerCase() === service.id.toLowerCase() || l.service?.toLowerCase() === service.name.toLowerCase()
  );
  const serviceSpans = (traces || []).filter(
    t => t.service === service.id || t.service?.toLowerCase() === service.name.toLowerCase()
  );

  if (serviceLogs.length === 0 && serviceSpans.length === 0) {
    uncertainty.push(`No correlated log entries or trace spans found for service "${service.name}".`);
    return { score: 0, evidence, uncertainty };
  }

  const errorLogs = serviceLogs.filter(l => l.level === 'ERROR');
  const warnLogs = serviceLogs.filter(l => l.level === 'WARN');

  if (errorLogs.length > 0) {
    rawScore += Math.min(50, errorLogs.length * 25);
    for (const log of errorLogs.slice(0, 3)) {
      evidence.push({
        id: `ev-log-${log.id}`,
        type: 'log',
        severity: 'high',
        title: `Error Log [${log.service}]`,
        description: log.message,
        timestamp: log.timestamp,
        sourceRef: log.traceId
      });
    }
  }

  if (warnLogs.length > 0) {
    rawScore += Math.min(20, warnLogs.length * 10);
  }

  const errorSpans = serviceSpans.filter(s => s.status === 'error');
  const slowSpans = serviceSpans.filter(s => s.durationMs > 250);

  if (errorSpans.length > 0) {
    rawScore += Math.min(40, errorSpans.length * 20);
    for (const span of errorSpans) {
      evidence.push({
        id: `ev-trace-${span.id}`,
        type: 'trace',
        severity: span.isCriticalPath ? 'critical' : 'high',
        title: `Trace Span Error: ${span.operation}`,
        description: `Span duration ${span.durationMs}ms with status ${span.httpStatus || 'ERROR'}. ${span.isCriticalPath ? 'Critical path affected.' : ''}`,
        metricValue: `${span.durationMs}ms`,
        sourceRef: span.traceId
      });
    }
  } else if (slowSpans.length > 0) {
    rawScore += 20;
    evidence.push({
      id: `ev-trace-${slowSpans[0].id}`,
      type: 'trace',
      severity: 'medium',
      title: `Slow Span Execution: ${slowSpans[0].operation}`,
      description: `Latency ${slowSpans[0].durationMs}ms exceeds normal threshold.`,
      metricValue: `${slowSpans[0].durationMs}ms`
    });
  }

  const normalized = Math.min(100, Math.max(0, Math.round(rawScore)));
  return { score: normalized, evidence, uncertainty };
}

/**
 * Combines component scores into normalized 0-100 score according to weights.
 */
export function computeWeightedScore(breakdown, weights = DEFAULT_SCORING_WEIGHTS) {
  const weighted = 
    breakdown.anomalySeverityScore * weights.anomalySeverity +
    breakdown.deploymentCorrelationScore * weights.deploymentTiming +
    breakdown.dependencyRelevanceScore * weights.dependencyRelationship +
    breakdown.logErrorEvidenceScore * weights.supportingLogs;

  const weightedTotalScore = Math.min(100, Math.max(0, Math.round(weighted * 10) / 10));

  return {
    ...breakdown,
    weightedTotalScore
  };
}

