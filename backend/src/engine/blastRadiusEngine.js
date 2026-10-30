/**
 * Dependency-Aware Blast Radius Engine
 *
 * Evaluates the structural blast radius of deploying or changing a service:
 * - Direct downstream callers (services that call the changed service)
 * - Transitive downstream callers (callers of callers up to N hops)
 * - Upstream dependencies (services the changed service calls)
 * - Shared dependencies (services called by both the target and its callers)
 * - Critical services in the impact path
 * - Services with active SLOs and existing incidents
 *
 * Edge Direction Convention:
 * If service A declares dependency B (A.dependencies.includes(B)), A is the CALLER (downstream)
 * and B is the CALLEE (upstream dependency).
 * When B is modified, A is directly affected.
 */

export function calculateBlastRadius(targetServiceId, allServices = [], options = {}) {
  const { slos = [], activeIncidents = [], activeAlerts = [] } = options;

  const serviceMap = new Map();
  allServices.forEach(s => serviceMap.set(s.id, s));

  const targetService = serviceMap.get(targetServiceId);
  if (!targetService) {
    return {
      targetServiceId,
      error: `Service "${targetServiceId}" not found in topology.`,
      directDownstream: [],
      transitiveDownstream: [],
      upstreamDependencies: [],
      sharedDependencies: [],
      criticalServices: [],
      allAffectedServices: [],
      totalImpactedCount: 0,
      confidence: 'low',
      summary: `Unable to compute blast radius: target service "${targetServiceId}" is unknown.`
    };
  }

  // 1. Direct downstream callers: services that have targetServiceId in their dependencies
  const directDownstream = [];
  allServices.forEach(s => {
    if (s.id !== targetServiceId && Array.isArray(s.dependencies) && s.dependencies.includes(targetServiceId)) {
      directDownstream.push({
        serviceId: s.id,
        serviceName: s.name || s.id,
        tier: s.tier ?? 1,
        relationshipType: 'direct_downstream',
        dependencyPath: [s.id, targetServiceId],
        hops: 1,
        confidence: 1.0,
        hasSlo: slos.some(slo => slo.serviceId === s.id && slo.enabled !== false),
        hasActiveIncident: activeIncidents.some(inc => (inc.serviceId === s.id || inc.service_id === s.id) && inc.status !== 'resolved'),
        activeAlertCount: activeAlerts.filter(a => (a.serviceId === s.id || a.service_id === s.id) && a.status === 'active').length,
        explanation: `Direct caller: "${s.name || s.id}" calls "${targetService.name || targetServiceId}". Regressions or breaking contract changes in "${targetService.name}" will immediately propagate to "${s.name}".`
      });
    }
  });

  // 2. Transitive downstream callers (BFS from direct callers)
  const transitiveDownstream = [];
  const visited = new Set([targetServiceId, ...directDownstream.map(d => d.serviceId)]);
  const queue = directDownstream.map(d => ({
    serviceId: d.serviceId,
    path: [d.serviceId, targetServiceId],
    hops: 1
  }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.hops >= 4) continue; // bound max traversal depth to 4 hops

    allServices.forEach(s => {
      if (!visited.has(s.id) && Array.isArray(s.dependencies) && s.dependencies.includes(current.serviceId)) {
        visited.add(s.id);
        const hops = current.hops + 1;
        const dependencyPath = [s.id, ...current.path];
        const confidence = hops === 2 ? 0.85 : 0.70;

        const transRecord = {
          serviceId: s.id,
          serviceName: s.name || s.id,
          tier: s.tier ?? 2,
          relationshipType: 'transitive_downstream',
          dependencyPath,
          hops,
          confidence,
          hasSlo: slos.some(slo => slo.serviceId === s.id && slo.enabled !== false),
          hasActiveIncident: activeIncidents.some(inc => (inc.serviceId === s.id || inc.service_id === s.id) && inc.status !== 'resolved'),
          activeAlertCount: activeAlerts.filter(a => (a.serviceId === s.id || a.service_id === s.id) && a.status === 'active').length,
          explanation: `Transitive caller (${hops} hops): "${s.name || s.id}" transitively depends on "${targetService.name || targetServiceId}" via ${dependencyPath.slice(1, -1).join(' -> ')}.`
        };

        transitiveDownstream.push(transRecord);
        queue.push({
          serviceId: s.id,
          path: dependencyPath,
          hops
        });
      }
    });
  }

  // 3. Upstream dependencies: services that targetService calls
  const upstreamDependencies = [];
  const targetDeps = Array.isArray(targetService.dependencies) ? targetService.dependencies : [];
  targetDeps.forEach(depId => {
    const depService = serviceMap.get(depId);
    upstreamDependencies.push({
      serviceId: depId,
      serviceName: depService?.name || depId,
      tier: depService?.tier ?? 2,
      relationshipType: 'upstream_dependency',
      dependencyPath: [targetServiceId, depId],
      confidence: 0.95,
      hasSlo: slos.some(slo => slo.serviceId === depId && slo.enabled !== false),
      hasActiveIncident: activeIncidents.some(inc => (inc.serviceId === depId || inc.service_id === depId) && inc.status !== 'resolved'),
      explanation: `Upstream dependency: "${targetService.name || targetServiceId}" calls "${depService?.name || depId}". Changed client versions may alter traffic patterns or payload contracts to this dependency.`
    });
  });

  // 4. Shared dependencies: services that both targetService and any direct downstream caller depend on
  const sharedDependencies = [];
  const directCallerDepSets = directDownstream.map(d => {
    const callerSvc = serviceMap.get(d.serviceId);
    return {
      callerId: d.serviceId,
      callerName: d.serviceName,
      deps: new Set(Array.isArray(callerSvc?.dependencies) ? callerSvc.dependencies : [])
    };
  });

  targetDeps.forEach(depId => {
    const sharingCallers = directCallerDepSets.filter(c => c.deps.has(depId));
    if (sharingCallers.length > 0) {
      const depService = serviceMap.get(depId);
      sharedDependencies.push({
        serviceId: depId,
        serviceName: depService?.name || depId,
        tier: depService?.tier ?? 2,
        relationshipType: 'shared_dependency',
        sharedWithCallers: sharingCallers.map(c => c.callerName),
        explanation: `Shared dependency: "${depService?.name || depId}" is called by both target "${targetService.name || targetServiceId}" and its caller(s) ${sharingCallers.map(c => `"${c.callerName}"`).join(', ')}. Increased load or resource lock contention during deployment could trigger concurrent degradation.`
      });
    }
  });

  // 5. Critical services in the impact path (Tier 0 or Tier 1)
  const downstreamAll = [...directDownstream, ...transitiveDownstream];
  const criticalServices = downstreamAll.filter(s => s.tier === 0 || s.tier === 1);

  // 6. Summary metrics
  const totalImpactedCount = downstreamAll.length;
  const criticalImpactCount = criticalServices.length;

  let riskTier = 'LOW';
  if (criticalImpactCount > 0 || totalImpactedCount >= 3) {
    riskTier = criticalImpactCount > 1 || totalImpactedCount >= 5 ? 'HIGH' : 'MODERATE';
  }

  const summary = totalImpactedCount === 0
    ? `Target service "${targetService.name || targetServiceId}" has 0 downstream callers. Blast radius is isolated to the service itself.`
    : `Modifying "${targetService.name || targetServiceId}" exposes ${totalImpactedCount} downstream caller(s) (${directDownstream.length} direct, ${transitiveDownstream.length} transitive), including ${criticalImpactCount} critical tier-0/1 service(s).`;

  return {
    targetService: {
      id: targetService.id,
      name: targetService.name,
      tier: targetService.tier,
      namespace: targetService.namespace,
      dependencies: targetDeps
    },
    directDownstream,
    transitiveDownstream,
    upstreamDependencies,
    sharedDependencies,
    criticalServices,
    allAffectedServices: [
      {
        serviceId: targetService.id,
        serviceName: targetService.name,
        relationshipType: 'target_service',
        tier: targetService.tier,
        confidence: 1.0,
        hasSlo: slos.some(slo => slo.serviceId === targetService.id && slo.enabled !== false),
        hasActiveIncident: activeIncidents.some(inc => (inc.serviceId === targetService.id || inc.service_id === targetService.id) && inc.status !== 'resolved')
      },
      ...downstreamAll
    ],
    totalImpactedCount,
    criticalImpactCount,
    riskTier,
    confidence: allServices.length > 0 ? 'high' : 'low',
    summary
  };
}

