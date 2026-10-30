import crypto from 'node:crypto';

export function correlateEventPair(eventA, eventB, allServices = []) {
  if (!eventA || !eventB || eventA.id === eventB.id) return null;

  const timeA = new Date(eventA.eventTimestamp).getTime();
  const timeB = new Date(eventB.eventTimestamp).getTime();
  const timeDifferenceMs = Math.abs(timeA - timeB);

  const supportingReasons = [];
  const contradictoryEvidence = [];
  let correlationScore = 0;
  let relationshipType = 'temporally_related';
  let dependencyPath = [];
  let confidence = 'medium';

  const svcA = eventA.serviceId;
  const svcB = eventB.serviceId;

  // 1. Same Trace Correlation (Highest deterministic linkage)
  const sharedCorrIds = (eventA.correlationIds || []).filter(id =>
    (eventB.correlationIds || []).includes(id)
  );

  if (sharedCorrIds.length > 0) {
    correlationScore = 95;
    relationshipType = 'same_trace';
    confidence = 'high';
    supportingReasons.push(`Events share trace or request correlation ID(s): ${sharedCorrIds.join(', ')}.`);
  }

  // 2. Incident Membership
  else if (eventA.relatedIncidentId && eventB.relatedIncidentId && eventA.relatedIncidentId === eventB.relatedIncidentId) {
    correlationScore = 90;
    relationshipType = 'incident_member';
    confidence = 'high';
    supportingReasons.push(`Both events are explicitly associated with incident "${eventA.relatedIncidentId}".`);
  }

  // 3. Runbook Response Association
  else if (eventA.eventType === 'runbook_execution' || eventB.eventType === 'runbook_execution') {
    const rbEvt = eventA.eventType === 'runbook_execution' ? eventA : eventB;
    const otherEvt = eventA.eventType === 'runbook_execution' ? eventB : eventA;
    if (rbEvt.serviceId === otherEvt.serviceId || rbEvt.relatedIncidentId === otherEvt.relatedIncidentId) {
      correlationScore = 88;
      relationshipType = 'runbook_response';
      confidence = 'high';
      supportingReasons.push(`Runbook execution "${rbEvt.sourceRefId}" triggered in operational response to service "${otherEvt.serviceId}".`);
    }
  }

  // 4. Deployment / Change Impact Proximity
  else if (eventA.eventType === 'deployment_change' || eventB.eventType === 'deployment_change') {
    const depEvt = eventA.eventType === 'deployment_change' ? eventA : eventB;
    const anomalyEvt = eventA.eventType === 'deployment_change' ? eventB : eventA;

    const depTime = new Date(depEvt.eventTimestamp).getTime();
    const anomTime = new Date(anomalyEvt.eventTimestamp).getTime();

    // Check if anomaly occurred within 60 minutes after deployment
    const deltaPostDeploy = anomTime - depTime;
    if (deltaPostDeploy >= 0 && deltaPostDeploy <= 3600000) {
      if (depEvt.serviceId === anomalyEvt.serviceId) {
        correlationScore = 82;
        relationshipType = 'deployment_related';
        confidence = 'high';
        supportingReasons.push(`Anomaly on "${anomalyEvt.serviceId}" occurred ${Math.round(deltaPostDeploy / 60000)}m post-deployment "${depEvt.sourceRefId}". Strong temporal association.`);
      } else {
        // Check if anomaly service is a downstream caller of deployed service
        const isDownstream = checkDependencyRelationship(anomalyEvt.serviceId, depEvt.serviceId, allServices);
        if (isDownstream.isDirect) {
          correlationScore = 78;
          relationshipType = 'deployment_related';
          dependencyPath = [anomalyEvt.serviceId, depEvt.serviceId];
          confidence = 'high';
          supportingReasons.push(`Anomaly on downstream caller "${anomalyEvt.serviceId}" occurred ${Math.round(deltaPostDeploy / 60000)}m after upstream deployment "${depEvt.sourceRefId}".`);
        }
      }
    }
  }

  // 5. SLO Impact Correlation
  else if (eventA.eventType === 'slo_event' || eventB.eventType === 'slo_event') {
    const sloEvt = eventA.eventType === 'slo_event' ? eventA : eventB;
    const otherEvt = eventA.eventType === 'slo_event' ? eventB : eventA;
    if (sloEvt.serviceId === otherEvt.serviceId && timeDifferenceMs <= 1800000) {
      correlationScore = 85;
      relationshipType = 'slo_impact';
      confidence = 'high';
      supportingReasons.push(`SLO degradation on service "${sloEvt.serviceId}" aligns with observed "${otherEvt.eventType}".`);
    }
  }

  // 6. Same Service Identity
  else if (svcA && svcB && svcA === svcB) {
    if (timeDifferenceMs <= 300000) { // 5m
      correlationScore = 80;
      relationshipType = 'same_service';
      confidence = 'high';
      supportingReasons.push(`Both events occurred on service "${svcA}" within ${Math.round(timeDifferenceMs / 1000)}s.`);
    } else if (timeDifferenceMs <= 1800000) { // 30m
      correlationScore = 65;
      relationshipType = 'same_service';
      confidence = 'medium';
      supportingReasons.push(`Both events occurred on service "${svcA}" within ${Math.round(timeDifferenceMs / 60000)}m.`);
    } else {
      correlationScore = 40;
      relationshipType = 'same_service';
      confidence = 'low';
      supportingReasons.push(`Events share service "${svcA}", but time difference (${Math.round(timeDifferenceMs / 3600000)}h) weakens direct linkage.`);
    }
  }

  // 7. Dependency Graph Relationship (Different services)
  else if (svcA && svcB && svcA !== svcB) {
    const depCheck = checkDependencyRelationship(svcA, svcB, allServices);
    if (depCheck.isDirect && timeDifferenceMs <= 900000) { // 15m
      correlationScore = 75;
      relationshipType = 'dependency_related';
      dependencyPath = depCheck.path;
      confidence = 'high';
      supportingReasons.push(`Direct caller-callee dependency: "${depCheck.caller}" calls "${depCheck.callee}". Cascading telemetry propagation observed within ${Math.round(timeDifferenceMs / 1000)}s.`);
    } else if (depCheck.isTransitive && timeDifferenceMs <= 1800000) { // 30m
      correlationScore = 55;
      relationshipType = 'dependency_related';
      dependencyPath = depCheck.path;
      confidence = 'medium';
      supportingReasons.push(`Transitive 2-hop dependency between "${svcA}" and "${svcB}".`);
    } else if (timeDifferenceMs <= 60000) { // 1m temporal coincidence without dependency
      correlationScore = 25;
      relationshipType = 'temporally_related';
      confidence = 'low';
      supportingReasons.push(`Events occurred within ${Math.round(timeDifferenceMs / 1000)}s of each other.`);
      contradictoryEvidence.push(`Services "${svcA}" and "${svcB}" have no direct or transitive dependency edge in topology. Temporal coincidence alone is NOT evidence of causal relation.`);
    }
  }

  if (correlationScore === 0) return null; // Uncorrelated

  return {
    id: `corr-${crypto.randomUUID().substring(0, 8)}`,
    sourceEventId: eventA.id,
    targetEventId: eventB.id,
    relationshipType,
    correlationScore,
    supportingReasons,
    contradictoryEvidence,
    timeDifferenceMs,
    dependencyPath,
    confidence
  };
}

function checkDependencyRelationship(serviceIdA, serviceIdB, allServices = []) {
  const svcA = allServices.find(s => s.id === serviceIdA);
  const svcB = allServices.find(s => s.id === serviceIdB);

  if (!svcA || !svcB) return { isDirect: false, isTransitive: false, path: [] };

  const depsA = Array.isArray(svcA.dependencies) ? svcA.dependencies : [];
  const depsB = Array.isArray(svcB.dependencies) ? svcB.dependencies : [];

  // A calls B
  if (depsA.includes(serviceIdB)) {
    return { isDirect: true, isTransitive: false, caller: serviceIdA, callee: serviceIdB, path: [serviceIdA, serviceIdB] };
  }
  // B calls A
  if (depsB.includes(serviceIdA)) {
    return { isDirect: true, isTransitive: false, caller: serviceIdB, callee: serviceIdA, path: [serviceIdB, serviceIdA] };
  }

  // 2-hop: A calls intermediate which calls B
  for (const midId of depsA) {
    const midSvc = allServices.find(s => s.id === midId);
    if (midSvc && Array.isArray(midSvc.dependencies) && midSvc.dependencies.includes(serviceIdB)) {
      return { isDirect: false, isTransitive: true, caller: serviceIdA, callee: serviceIdB, path: [serviceIdA, midId, serviceIdB] };
    }
  }

  return { isDirect: false, isTransitive: false, path: [] };
}

export function correlateAllEvents(events = [], allServices = [], minScoreThreshold = 25) {
  const correlations = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const corr = correlateEventPair(events[i], events[j], allServices);
      if (corr && corr.correlationScore >= minScoreThreshold) {
        correlations.push(corr);
      }
    }
  }
  return correlations;
}

