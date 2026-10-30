/**
 * Causal Dependency Reasoning Engine
 *
 * Distinguishes:
 * - Originating anomalous service (upstream root cause)
 * - Directly affected downstream callers (callee -> caller propagation)
 * - Indirectly affected callers (2+ hops)
 * - Downstream dependencies (dependencies called by the candidate)
 * - Unrelated services
 *
 * DIRECTION DEFINITIONS:
 * If service A has dependency B (A -> B), A is the CALLER (downstream client)
 * and B is the CALLEE (upstream dependency/server).
 * If B fails or slows down, A suffers cascading symptoms (timeout, 504).
 * Therefore, an anomalous Callee B is a plausible root cause for Caller A.
 */

export function analyzeCausalRelationship(candidateService, incidentService, allServices = []) {
  if (!candidateService || !incidentService) {
    return {
      relationship: 'unknown',
      score: 15,
      direction: 'unknown',
      evidence: [],
      uncertainty: ['Incident target service or candidate service could not be resolved from topology.']
    };
  }

  // 1. Candidate IS the incident service
  if (candidateService.id === incidentService.id) {
    return {
      relationship: 'self',
      score: 85,
      direction: 'self',
      evidence: [{
        id: `causal-self-${candidateService.id}`,
        type: 'causal_topology',
        title: 'Primary Incident Target Service',
        description: `Service "${candidateService.name}" is directly declared as the primary impacted component.`
      }],
      uncertainty: []
    };
  }

  const incidentDeps = Array.isArray(incidentService.dependencies) ? incidentService.dependencies : [];
  const candidateDeps = Array.isArray(candidateService.dependencies) ? candidateService.dependencies : [];

  // 2. Incident Service calls Candidate Service (Incident -> Candidate)
  // Candidate is the Callee / Dependency. If candidate has an anomaly, it is an UPSTREAM ROOT CAUSE!
  if (incidentDeps.includes(candidateService.id)) {
    return {
      relationship: 'direct_dependency_callee',
      score: 95,
      direction: 'upstream_cause_to_downstream_caller',
      evidence: [{
        id: `causal-callee-${candidateService.id}`,
        type: 'causal_topology',
        title: 'Direct Dependency (Callee / Upstream Cause)',
        description: `Impacted service "${incidentService.name}" calls candidate "${candidateService.name}". Downstream errors or stalls in "${candidateService.name}" directly cause upstream failures in "${incidentService.name}".`
      }],
      uncertainty: []
    };
  }

  // 3. 2-Hop Dependency (Incident -> Intermediate -> Candidate)
  const is2HopCallee = incidentDeps.some(depId => {
    const intermediate = allServices.find(s => s.id === depId);
    return Array.isArray(intermediate?.dependencies) && intermediate.dependencies.includes(candidateService.id);
  });

  if (is2HopCallee) {
    return {
      relationship: 'transitive_dependency_callee',
      score: 75,
      direction: 'transitive_upstream_cause',
      evidence: [{
        id: `causal-2hop-${candidateService.id}`,
        type: 'causal_topology',
        title: 'Transitive 2-Hop Dependency (Callee)',
        description: `Impacted service "${incidentService.name}" transitively depends on "${candidateService.name}" via intermediate callers.`
      }],
      uncertainty: []
    };
  }

  // 4. Candidate calls Incident Service (Candidate -> Incident)
  // Candidate is an UPSTREAM CALLER (Downstream symptom). It suffers because incident service failed.
  if (candidateDeps.includes(incidentService.id)) {
    return {
      relationship: 'caller_symptom',
      score: 40,
      direction: 'downstream_symptom',
      evidence: [{
        id: `causal-caller-${candidateService.id}`,
        type: 'causal_topology',
        title: 'Upstream Caller (Downstream Symptom)',
        description: `Candidate "${candidateService.name}" calls impacted service "${incidentService.name}". Its errors are likely cascading symptoms rather than the originating root cause.`
      }],
      uncertainty: []
    };
  }

  // 5. Shared Dependency Peer (Both call the same third service)
  const sharedDep = incidentDeps.find(d => candidateDeps.includes(d));
  if (sharedDep) {
    return {
      relationship: 'peer_consumer',
      score: 30,
      direction: 'peer',
      evidence: [{
        id: `causal-peer-${candidateService.id}`,
        type: 'causal_topology',
        title: `Peer Consumer of Shared Dependency (${sharedDep})`,
        description: `Both "${candidateService.name}" and "${incidentService.name}" share downstream dependency "${sharedDep}".`
      }],
      uncertainty: []
    };
  }

  // 6. Unconnected in topology graph
  return {
    relationship: 'unrelated',
    score: 10,
    direction: 'none',
    evidence: [],
    uncertainty: [`No topological connection discovered between "${candidateService.name}" and "${incidentService.name}".`]
  };
}

