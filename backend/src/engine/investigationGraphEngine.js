/**
 * Unified Investigation Graph Engine
 *
 * Constructs a multi-modal investigation graph connecting services, incidents,
 * alerts, deployments, telemetry anomalies, SLO events, RCA hypotheses, and runbooks.
 */

export function buildInvestigationGraph({
  incident,
  events = [],
  correlations = [],
  services = [],
  hypotheses = [],
  options = {}
}) {
  const {
    filterServiceId = null,
    filterSeverity = null,
    minCorrelationScore = 25,
    windowStart = null,
    windowEnd = null
  } = options;

  const nodeMap = new Map();
  const edgeMap = new Map();

  // Helper to add nodes safely without duplicates
  function addNode(node) {
    if (!node || !node.id) return;
    if (filterServiceId && node.serviceId && node.serviceId !== filterServiceId && node.category !== 'incident') return;
    if (filterSeverity && node.severity && node.severity !== filterSeverity && node.category !== 'service') return;

    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, {
        id: node.id,
        label: node.label || node.id,
        category: node.category, // 'service', 'incident', 'alert', 'deployment', 'metric_anomaly', 'log_error', 'trace_anomaly', 'slo_event', 'rca_hypothesis', 'runbook_execution'
        serviceId: node.serviceId || null,
        timestamp: node.timestamp || null,
        severity: node.severity || 'info',
        telemetryMode: node.telemetryMode || 'simulated',
        metadata: node.metadata || {}
      });
    }
  }

  // Helper to add edges safely without duplicates
  function addEdge(edge) {
    if (!edge || !edge.source || !edge.target || edge.source === edge.target) return;
    const edgeKey = `${edge.source}->${edge.target}:${edge.relationship}`;
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, {
        id: `edge-${edgeKey}`,
        source: edge.source,
        target: edge.target,
        relationship: edge.relationship, // 'calls', 'triggered', 'observed_during', 'affected_by', 'supports_hypothesis', 'contradicts_hypothesis', 'correlated_with', 'responded_to'
        edgeType: edge.edgeType || 'correlation', // 'dependency' | 'correlation' | 'hypothesis' | 'operational'
        score: edge.score ?? 50,
        supportingReasons: edge.supportingReasons || [],
        contradictoryEvidence: edge.contradictoryEvidence || [],
        evidenceRef: edge.evidenceRef || null
      });
    }
  }

  // 1. Add Incident Core Node
  if (incident) {
    addNode({
      id: incident.id,
      label: incident.title || incident.id,
      category: 'incident',
      serviceId: incident.serviceId,
      timestamp: incident.startedAt,
      severity: incident.severity === 'SEV-1' ? 'critical' : 'high',
      metadata: { status: incident.status, lead: incident.lead }
    });
  }

  // 2. Add Service Topology Nodes & Dependency Edges
  services.forEach(svc => {
    addNode({
      id: `svc-${svc.id}`,
      label: svc.name || svc.id,
      category: 'service',
      serviceId: svc.id,
      severity: svc.tier === 0 ? 'critical' : 'info',
      metadata: { tier: svc.tier, protocol: svc.protocol, status: svc.status }
    });

    // Add structural topology call edges (Caller -> Callee)
    if (Array.isArray(svc.dependencies)) {
      svc.dependencies.forEach(depId => {
        addEdge({
          source: `svc-${svc.id}`,
          target: `svc-${depId}`,
          relationship: 'calls',
          edgeType: 'dependency',
          score: 100,
          supportingReasons: [`Topology definition: "${svc.id}" calls "${depId}".`]
        });
      });
    }
  });

  // 3. Add Normalized Events
  events.forEach(evt => {
    // Time filter
    if (windowStart && new Date(evt.eventTimestamp).getTime() < new Date(windowStart).getTime()) return;
    if (windowEnd && new Date(evt.eventTimestamp).getTime() > new Date(windowEnd).getTime()) return;

    addNode({
      id: evt.id,
      label: evt.title || evt.id,
      category: evt.eventType,
      serviceId: evt.serviceId,
      timestamp: evt.eventTimestamp,
      severity: evt.severity,
      telemetryMode: evt.telemetryMode,
      metadata: {
        sourceSystem: evt.sourceSystem,
        sourceRefId: evt.sourceRefId,
        normalizedAttributes: evt.normalizedAttributes
      }
    });

    // Edge between Event and Service
    if (evt.serviceId && nodeMap.has(`svc-${evt.serviceId}`)) {
      addEdge({
        source: evt.id,
        target: `svc-${evt.serviceId}`,
        relationship: 'observed_on',
        edgeType: 'correlation',
        score: 90,
        supportingReasons: [`Event was emitted by component in service "${evt.serviceId}".`],
        evidenceRef: evt.id
      });
    }

    // Edge between Event and Incident
    if (incident && (evt.relatedIncidentId === incident.id || evt.serviceId === incident.serviceId)) {
      addEdge({
        source: evt.id,
        target: incident.id,
        relationship: 'observed_during',
        edgeType: 'correlation',
        score: evt.relatedIncidentId === incident.id ? 95 : 75,
        supportingReasons: [`Event occurred in temporal and spatial proximity to incident ${incident.id}.`],
        evidenceRef: evt.id
      });
    }
  });

  // 4. Add Cross-Event Correlations
  correlations.forEach(corr => {
    if (corr.correlationScore < minCorrelationScore) return;
    if (!nodeMap.has(corr.sourceEventId) || !nodeMap.has(corr.targetEventId)) return;

    addEdge({
      source: corr.sourceEventId,
      target: corr.targetEventId,
      relationship: corr.relationshipType || 'correlated_with',
      edgeType: 'correlation',
      score: corr.correlationScore,
      supportingReasons: corr.supportingReasons,
      contradictoryEvidence: corr.contradictoryEvidence,
      evidenceRef: corr.id
    });
  });

  // 5. Add RCA Hypotheses Nodes & Grounded Evidence Edges
  hypotheses.forEach((hyp, idx) => {
    const hypId = `hyp-${hyp.candidateServiceId || idx}`;
    addNode({
      id: hypId,
      label: `Hypothesis: ${hyp.candidateServiceName || hyp.candidateServiceId} (Rank #${hyp.rank})`,
      category: 'rca_hypothesis',
      serviceId: hyp.candidateServiceId,
      severity: hyp.rank === 1 ? 'critical' : 'warning',
      metadata: { score: hyp.score, causalRole: hyp.causalRole }
    });

    // Link hypothesis to incident
    if (incident) {
      addEdge({
        source: hypId,
        target: incident.id,
        relationship: 'supports_hypothesis',
        edgeType: 'hypothesis',
        score: hyp.score,
        supportingReasons: [hyp.summary || 'Authoritative deterministic RCA candidate ranking.']
      });
    }

    // Link hypothesis to candidate service
    if (hyp.candidateServiceId && nodeMap.has(`svc-${hyp.candidateServiceId}`)) {
      addEdge({
        source: hypId,
        target: `svc-${hyp.candidateServiceId}`,
        relationship: 'targets_service',
        edgeType: 'hypothesis',
        score: hyp.score,
        supportingReasons: [`RCA Engine identified "${hyp.candidateServiceName}" as root cause candidate.`]
      });
    }
  });

  // 6. Identify Disconnected Evidence Groups
  const nodes = Array.from(nodeMap.values());
  const edges = Array.from(edgeMap.values());

  const connectedNodes = new Set();
  edges.forEach(e => {
    connectedNodes.add(e.source);
    connectedNodes.add(e.target);
  });

  const disconnectedGroups = nodes
    .filter(n => !connectedNodes.has(n.id))
    .map(n => ({
      nodeId: n.id,
      category: n.category,
      label: n.label,
      serviceId: n.serviceId,
      explanation: 'Node has no direct correlation or dependency edges connecting to the incident graph.'
    }));

  // 7. Calculate Correlation Summary Metrics
  const sortedEvents = [...events].sort((a, b) => new Date(a.eventTimestamp).getTime() - new Date(b.eventTimestamp).getTime());
  const earliestObservedSignal = sortedEvents[0] ? {
    id: sortedEvents[0].id,
    type: sortedEvents[0].eventType,
    timestamp: sortedEvents[0].eventTimestamp,
    serviceId: sortedEvents[0].serviceId,
    title: sortedEvents[0].title
  } : null;

  // Service impact counts
  const serviceImpactMap = {};
  events.forEach(e => {
    if (e.serviceId) {
      serviceImpactMap[e.serviceId] = (serviceImpactMap[e.serviceId] || 0) + 1;
    }
  });
  const mostAffectedServices = Object.entries(serviceImpactMap)
    .sort((a, b) => b[1] - a[1])
    .map(([serviceId, eventCount]) => ({ serviceId, eventCount }));

  const deploymentAssociations = events.filter(e => e.eventType === 'deployment_change').map(e => ({
    changeId: e.sourceRefId,
    serviceId: e.serviceId,
    version: e.normalizedAttributes?.newVersion,
    timestamp: e.eventTimestamp
  }));

  const sloImpact = events.filter(e => e.eventType === 'slo_event').map(e => ({
    sloId: e.sourceRefId,
    serviceId: e.serviceId,
    status: e.normalizedAttributes?.status,
    remainingBudgetPercent: e.normalizedAttributes?.remainingBudgetPercent
  }));

  return {
    nodes,
    edges,
    disconnectedGroups,
    correlationSummary: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      earliestObservedSignal,
      mostAffectedServices,
      deploymentAssociations,
      sloImpact,
      disconnectedCount: disconnectedGroups.length,
      confidence: events.length > 0 ? 'high' : 'low',
      limitations: [
        'Deterministic graph correlates observed telemetry and topology.',
        'Temporal correlation is evidence of association, not proof of causation without trace stack evidence.'
      ]
    }
  };
}

