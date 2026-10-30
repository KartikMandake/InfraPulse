/**
 * Evidence Context Builder for AI Investigation Assistant
 *
 * Responsibilities:
 * - Collects incident, RCA hypotheses, topology, telemetry, deployments, and alerts
 * - Redacts passwords, tokens, API keys, cookies, and sensitive payloads
 * - Prunes oversized trace waterfalls and logs to fit context boundaries
 * - Builds a verifiable evidence catalog (with stable IDs)
 * - Excludes hidden Fault Lab ground-truth labels
 */

const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /bearer\s+[a-zA-Z0-9_\-\.]+/i,
  /api[_-]?key/i,
  /webhook/i
];

export function redactSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      let cleaned = obj;
      // Redact bearer tokens
      cleaned = cleaned.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
      // Redact suspected key-value pairs like password=xyz or token=xyz
      cleaned = cleaned.replace(/((?:password|secret|token|api_?key|auth)\s*[:=]\s*)['"]?[^'"\s,;]+['"]?/gi, '$1[REDACTED]');
      return cleaned;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSensitiveKey = SENSITIVE_PATTERNS.some(p => p.test(key));
    if (isSensitiveKey) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = redactSensitiveData(value);
    }
  }
  return sanitized;
}

export function buildEvidenceContext({
  incident,
  investigation,
  services = [],
  alerts = [],
  deployments = [],
  timelineEvents = [],
  runbooks = [],
  changes = [],
  regressions = [],
  normalizedEvents = [],
  investigationGraph = null
}) {
  const hypotheses = investigation?.hypotheses || [];
  const topCandidate = hypotheses[0] || null;

  // Build verifiable catalog of evidence items
  const evidenceCatalog = [];

  // 1. Evidence from hypotheses
  for (const h of hypotheses) {
    for (const ev of h.supportingEvidence || []) {
      evidenceCatalog.push({
        id: ev.id,
        type: ev.type,
        serviceId: h.candidateServiceId,
        serviceName: h.candidateServiceName,
        title: ev.title,
        description: ev.description,
        metricValue: ev.metricValue
      });
    }
  }

  // 2. Evidence from firing alerts
  for (const a of (alerts || []).slice(0, 10)) {
    const altId = `alt-${a.id}`;
    if (!evidenceCatalog.some(e => e.id === altId)) {
      evidenceCatalog.push({
        id: altId,
        type: 'alert',
        serviceId: a.serviceId,
        serviceName: a.serviceName || a.serviceId,
        title: a.title,
        description: `${a.metric} ${a.operator} ${a.threshold} (current: ${a.currentValue})`,
        metricValue: a.currentValue
      });
    }
  }

  // 3. Evidence from deployments
  for (const d of (deployments || []).slice(0, 5)) {
    const depId = `dep-${d.id}`;
    if (!evidenceCatalog.some(e => e.id === depId)) {
      evidenceCatalog.push({
        id: depId,
        type: 'deployment',
        serviceId: d.serviceName,
        serviceName: d.serviceName,
        title: `Deployment ${d.version}`,
        description: `Status: ${d.status}, ACA score: ${d.acaScore}/100 at ${d.timestamp}`,
        metricValue: `ACA ${d.acaScore}`
      });
    }
  }

  // 4. Evidence from Change Intelligence & Post-Deployment Regressions
  for (const chg of (changes || []).slice(0, 5)) {
    const chgId = `chg-${chg.id}`;
    if (!evidenceCatalog.some(e => e.id === chgId)) {
      evidenceCatalog.push({
        id: chgId,
        type: 'change_event',
        serviceId: chg.service_id || chg.serviceId,
        serviceName: chg.service_name || chg.serviceName,
        title: `Change Event ${chg.new_version || chg.newVersion} (${chg.environment})`,
        description: `Strategy: ${chg.deployment_strategy || chg.deploymentStrategy}, Status: ${chg.status}, Commit: ${chg.commit_sha || chg.commitSha}`,
        metricValue: chg.status
      });
    }
  }

  for (const reg of (regressions || []).slice(0, 5)) {
    const regId = `reg-${reg.id}`;
    if (!evidenceCatalog.some(e => e.id === regId)) {
      evidenceCatalog.push({
        id: regId,
        type: 'deployment_regression',
        serviceId: reg.service_id || reg.serviceId,
        serviceName: reg.service_id || reg.serviceId,
        title: `Regression ${reg.metric_name || reg.metricName}`,
        description: `${reg.explanation} (Delta: ${reg.delta_percent || reg.deltaPercent}%)`,
        metricValue: `${reg.current_value || reg.currentValue}`
      });
    }
  }

  // 5. Evidence from Normalized Observability Events
  for (const evt of (normalizedEvents || []).slice(0, 10)) {
    const evtId = evt.id;
    if (!evidenceCatalog.some(e => e.id === evtId)) {
      evidenceCatalog.push({
        id: evtId,
        type: evt.event_type || evt.eventType,
        serviceId: evt.service_id || evt.serviceId,
        serviceName: evt.service_name || evt.serviceName || evt.service_id || evt.serviceId,
        title: evt.title,
        description: evt.summary,
        metricValue: evt.severity
      });
    }
  }

  // Build bounded context payload
  const rawContext = {
    incident: {
      id: incident.id,
      title: incident.title,
      summary: incident.summary,
      severity: incident.severity,
      status: incident.status,
      serviceId: incident.serviceId,
      serviceName: incident.serviceName,
      startedAt: incident.startedAt,
      durationMinutes: incident.durationMinutes
    },
    topRankedCandidate: topCandidate ? {
      serviceId: topCandidate.candidateServiceId,
      serviceName: topCandidate.candidateServiceName,
      score: topCandidate.score,
      rank: topCandidate.rank,
      causalRole: topCandidate.causalRole,
      evidenceQuality: topCandidate.evidenceQuality,
      evidenceQualityPoints: topCandidate.evidenceQualityPoints,
      sufficientEvidence: topCandidate.sufficientEvidence,
      summary: topCandidate.summary,
      suggestedNextAction: topCandidate.suggestedNextAction
    } : null,
    hypotheses: hypotheses.slice(0, 5),
    hypothesesSummary: hypotheses.slice(0, 5).map(h => ({
      rank: h.rank,
      serviceId: h.candidateServiceId,
      serviceName: h.candidateServiceName,
      score: h.score,
      causalRole: h.causalRole,
      evidenceQuality: h.evidenceQuality,
      breakdown: h.breakdown
    })),
    servicesTopology: services.map(s => ({
      id: s.id,
      name: s.name,
      tier: s.tier,
      status: s.status,
      latencyP99: s.latencyP99,
      latencyBaseline: s.latencyBaseline,
      errorRate: s.errorRate,
      dependencies: s.dependencies || []
    })),
    deployments: (deployments || []).slice(0, 5).map(d => ({
      id: d.id,
      serviceName: d.serviceName,
      version: d.version,
      timestamp: d.timestamp,
      status: d.status,
      acaScore: d.acaScore
    })),
    timelineSummary: (timelineEvents || []).slice(0, 15).map(ev => ({
      id: ev.id,
      time: ev.time,
      type: ev.type,
      title: ev.title,
      serviceName: ev.serviceName
    })),
    availableRunbooks: (runbooks || []).map(rb => ({
      id: rb.id,
      title: rb.title,
      riskLevel: rb.riskLevel,
      executionMode: rb.executionMode,
      supportedIncidentTypes: rb.supportedIncidentTypes,
      applicableServices: rb.applicableServices,
      preconditions: rb.preconditions
    })),
    changesSummary: (changes || []).slice(0, 5).map(chg => ({
      id: chg.id,
      serviceId: chg.service_id || chg.serviceId,
      newVersion: chg.new_version || chg.newVersion,
      environment: chg.environment,
      status: chg.status,
      deployedAt: chg.deployed_at || chg.deployedAt
    })),
    regressionsSummary: (regressions || []).slice(0, 5).map(reg => ({
      id: reg.id,
      serviceId: reg.service_id || reg.serviceId,
      metricName: reg.metric_name || reg.metricName,
      deltaPercent: reg.delta_percent || reg.deltaPercent,
      severity: reg.regression_severity || reg.regressionSeverity,
      causalityStatus: reg.causality_status || reg.causalityStatus
    })),
    investigationGraphSummary: investigationGraph ? {
      nodesCount: investigationGraph.nodesCount || investigationGraph.nodes?.length,
      edgesCount: investigationGraph.edgesCount || investigationGraph.edges?.length,
      correlationSummary: investigationGraph.correlationSummary
    } : null,
    evidenceCatalog
  };

  return redactSensitiveData(rawContext);
}
