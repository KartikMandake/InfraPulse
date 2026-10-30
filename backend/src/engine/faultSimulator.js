import { FAULT_TYPES, SEVERITY_LEVELS } from './faultScenarios.js';

/**
 * Deep clone helper to ensure isolated telemetry simulation without mutating baseline.
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Build a reverse dependency map (callers / downstream services depending on a given service).
 * If service A depends on service B (A calls B), then A is downstream from B (B is upstream of A).
 * When B fails, callers like A get impacted.
 */
function findDownstreamCallers(targetServiceId, services) {
  const callers = [];
  for (const s of services) {
    if (Array.isArray(s.dependencies) && s.dependencies.includes(targetServiceId)) {
      callers.push(s);
    }
  }
  return callers;
}

/**
 * Recursively find all downstream callers in the dependency chain.
 */
function getTransitiveCallers(targetServiceId, services, visited = new Set()) {
  const result = [];
  const directCallers = findDownstreamCallers(targetServiceId, services);

  for (const caller of directCallers) {
    if (!visited.has(caller.id)) {
      visited.add(caller.id);
      result.push(caller.id);
      const upstream = getTransitiveCallers(caller.id, services, visited);
      result.push(...upstream);
    }
  }

  return Array.from(new Set(result));
}

/**
 * Severity scaling factors for latency and error rate.
 */
const SEVERITY_SCALING = {
  [SEVERITY_LEVELS.LOW]: 0.5,
  [SEVERITY_LEVELS.MEDIUM]: 1.0,
  [SEVERITY_LEVELS.HIGH]: 1.75,
  [SEVERITY_LEVELS.CRITICAL]: 2.5
};

/**
 * Applies a fault simulation to an isolated copy of baseline observability data.
 *
 * @param {Object} params
 * @param {string} params.scenarioId
 * @param {string} params.targetServiceId
 * @param {string} params.faultType
 * @param {string} params.severity
 * @param {Object} [params.customParams]
 * @param {Array} baselineServices
 * @param {Array} baselineAlerts
 * @param {Array} baselineDeployments
 * @param {Array} baselineLogs
 * @param {Array} baselineTraces
 * @returns {Object} Simulation state containing mutated data and metadata
 */
export function simulateFault(params, {
  baselineServices = [],
  baselineAlerts = [],
  baselineDeployments = [],
  baselineLogs = [],
  baselineTraces = []
}) {
  const {
    scenarioId,
    targetServiceId,
    faultType,
    severity = SEVERITY_LEVELS.HIGH,
    customParams = {}
  } = params;

  // 1. Verify target service exists in baseline
  const targetService = baselineServices.find(s => s.id === targetServiceId);
  if (!targetService) {
    throw new Error(`Target service "${targetServiceId}" is not present in the registered services catalog.`);
  }

  // 2. Validate fault type
  const validFaultTypes = Object.values(FAULT_TYPES);
  if (!validFaultTypes.includes(faultType)) {
    throw new Error(`Unsupported fault type "${faultType}". Valid types: ${validFaultTypes.join(', ')}`);
  }

  // 3. Clone baselines for clean isolation
  const simServices = clone(baselineServices);
  // Important: In a controlled simulation, start with empty firing alerts or filter alerts relevant to the target and downstream callers,
  // so pre-existing incident alerts (like ALT-1092/ALT-1093 from the default INC-4921) do not contaminate the new fault simulation.
  const simAlerts = clone(baselineAlerts).filter(a => a.serviceId === targetServiceId);
  // Remove unrelated pre-existing deployments so they don't falsely bias isolated fault simulations
  const simDeployments = clone(baselineDeployments).filter(d => 
    d.serviceName.toLowerCase() === targetServiceId.toLowerCase()
  );
  const simLogs = clone(baselineLogs).filter(l => l.serviceId === targetServiceId);
  const simTraces = clone(baselineTraces);

  const scale = SEVERITY_SCALING[severity] || 1.0;
  const now = new Date();
  const timestampStr = now.toISOString().substring(11, 19) + ' UTC';

  // 4. Locate mutated target in the clone
  const simTarget = simServices.find(s => s.id === targetServiceId);
  simTarget.status = severity === SEVERITY_LEVELS.CRITICAL ? 'critical' : 'degraded';

  let latencyDelta = 150 * scale;
  let errorRateDelta = 4.0 * scale;

  switch (faultType) {
    case FAULT_TYPES.LATENCY_SPIKE:
      latencyDelta = Math.round(simTarget.latencyBaseline * (8 * scale));
      errorRateDelta = +(1.5 * scale).toFixed(2);
      simTarget.cpuPercent = Math.min(99, Math.round((simTarget.cpuPercent || 50) + (25 * scale)));
      break;

    case FAULT_TYPES.HTTP_5XX_SURGE:
      latencyDelta = Math.round(simTarget.latencyBaseline * (3 * scale));
      errorRateDelta = +(12.0 * scale).toFixed(2);
      break;

    case FAULT_TYPES.SERVICE_UNAVAILABLE:
      latencyDelta = Math.round(simTarget.latencyBaseline * (6 * scale));
      errorRateDelta = +(24.0 * scale).toFixed(2);
      simTarget.status = 'critical';
      if (simTarget.pods && simTarget.pods.length > 0) {
        simTarget.pods[0].status = 'CrashLoopBackOff';
        simTarget.pods[0].restarts = (simTarget.pods[0].restarts || 0) + 5;
      }
      break;

    case FAULT_TYPES.DATABASE_SLOWDOWN:
      latencyDelta = Math.round(simTarget.latencyBaseline * (14 * scale));
      errorRateDelta = +(6.5 * scale).toFixed(2);
      simTarget.memoryPercent = Math.min(98, Math.round((simTarget.memoryPercent || 60) + (30 * scale)));
      break;

    case FAULT_TYPES.DEPENDENCY_TIMEOUT:
      latencyDelta = Math.round(simTarget.latencyBaseline * (10 * scale));
      errorRateDelta = +(5.0 * scale).toFixed(2);
      break;

    default:
      break;
  }

  // Apply custom overrides if specified
  if (customParams.latencyMultiplier) {
    latencyDelta = Math.round(simTarget.latencyBaseline * customParams.latencyMultiplier * scale);
  }
  if (customParams.errorRateIncrease) {
    errorRateDelta = +(customParams.errorRateIncrease * scale).toFixed(2);
  }

  simTarget.latencyP99 = Math.max(simTarget.latencyBaseline + latencyDelta, simTarget.latencyP99);
  simTarget.errorRate = +(Math.max(simTarget.errorRate + errorRateDelta, errorRateDelta)).toFixed(2);

  // Mark endpoints on the target service
  if (Array.isArray(simTarget.endpoints) && simTarget.endpoints.length > 0) {
    simTarget.endpoints[0].p99Ms = simTarget.latencyP99;
    simTarget.endpoints[0].errorRatePercent = simTarget.errorRate;
    simTarget.endpoints[0].status = simTarget.status === 'critical' ? 'failing' : 'degraded';
  }

  // 5. Generate Target Alerts
  const alertId = `SIM-ALT-${Date.now().toString().slice(-4)}`;
  const simAlert = {
    id: alertId,
    title: `${faultType.toUpperCase().replace(/_/g, ' ')} detected on ${simTarget.name}`,
    severity: severity === SEVERITY_LEVELS.CRITICAL ? 'critical' : 'warning',
    state: 'firing',
    serviceId: simTarget.id,
    serviceName: simTarget.name,
    region: simTarget.region || 'us-east-1',
    metric: `${faultType}.anomaly`,
    threshold: `p99 > ${simTarget.latencyBaseline * 3}ms || err > 1.0%`,
    currentValue: `${simTarget.latencyP99}ms / ${simTarget.errorRate}%`,
    firedAt: timestampStr
  };
  simAlerts.unshift(simAlert);

  // 6. Generate Injected Logs
  simLogs.unshift({
    id: `sim-log-${Date.now()}-1`,
    timestamp: timestampStr,
    level: 'ERROR',
    service: simTarget.name,
    serviceId: simTarget.id,
    pod: simTarget.pods?.[0]?.name || `${simTarget.name}-0`,
    message: `[FAULT_INJECTION] ${faultType.toUpperCase()}: threshold breach latency=${simTarget.latencyP99}ms errorRate=${simTarget.errorRate}% (Severity: ${severity})`
  });

  // 7. Propagate fault effects downstream to callers
  const downstreamCallerIds = getTransitiveCallers(simTarget.id, simServices);
  const propagatedServices = [];

  for (const callerId of downstreamCallerIds) {
    const caller = simServices.find(s => s.id === callerId);
    if (!caller) continue;

    // Dampened downstream cascade (50% of the target's delta)
    const dampening = 0.5;
    const callerLatencyBump = Math.round(latencyDelta * dampening);
    const callerErrorBump = +(errorRateDelta * dampening).toFixed(2);

    caller.latencyP99 = Math.max(caller.latencyBaseline + callerLatencyBump, caller.latencyP99);
    caller.errorRate = +(caller.errorRate + callerErrorBump).toFixed(2);
    caller.status = caller.errorRate > 2.0 ? 'degraded' : caller.status;

    propagatedServices.push({
      serviceId: caller.id,
      serviceName: caller.name,
      latencyP99: caller.latencyP99,
      errorRate: caller.errorRate,
      status: caller.status
    });

    // Add downstream propagation log
    simLogs.unshift({
      id: `sim-log-${Date.now()}-${caller.id}`,
      timestamp: timestampStr,
      level: 'WARN',
      service: caller.name,
      serviceId: caller.id,
      pod: caller.pods?.[0]?.name || `${caller.name}-0`,
      message: `Downstream dependency degradation detected: caller stalled awaiting ${simTarget.name}`
    });
  }

  // 8. Generate simulated incident to evaluate against
  const simIncidentId = `INC-SIM-${Date.now().toString().slice(-4)}`;
  const simIncident = {
    id: simIncidentId,
    title: `Simulated Incident: ${faultType.replace(/_/g, ' ')} on ${simTarget.name}`,
    summary: `Controlled fault injection experiment [${scenarioId || 'custom'}] triggered on ${simTarget.name} with severity ${severity}. Cascaded to ${downstreamCallerIds.length} downstream caller(s).`,
    severity: severity === SEVERITY_LEVELS.CRITICAL ? 'SEV-1' : 'SEV-2',
    status: 'investigating',
    serviceId: simTarget.id,
    serviceName: simTarget.name,
    lead: 'Fault Lab Automator',
    leadRole: 'Chaos Engineering Suite',
    channel: '#lab-fault-sim',
    startedAt: timestampStr,
    durationMinutes: 5,
    dropRatePercent: simTarget.errorRate,
    sloBreached: simTarget.errorRate > 0.05,
    timeline: [
      {
        time: timestampStr,
        title: `Fault Injected (${faultType})`,
        description: `Synthetic perturbation applied to ${simTarget.name}. Severity set to ${severity}.`,
        source: 'fault_injection_lab'
      },
      {
        time: timestampStr,
        title: 'Cascade Propagated',
        description: `Downstream caller(s) impacted: ${downstreamCallerIds.join(', ') || 'None'}.`,
        source: 'telemetry_anomaly'
      }
    ]
  };

  const simulationId = `sim-${Date.now()}-${process.hrtime.bigint().toString(36)}`;

  return {
    simulationId,
    scenarioId: scenarioId || 'custom-scenario',
    targetServiceId: simTarget.id,
    targetServiceName: simTarget.name,
    faultType,
    severity,
    createdAt: now.toISOString(),
    expectedRootCauseServiceId: simTarget.id,
    expectedDownstreamAffected: downstreamCallerIds,
    propagatedServices,
    simulatedIncident: simIncident,
    telemetry: {
      services: simServices,
      alerts: simAlerts,
      deployments: simDeployments,
      logs: simLogs,
      traces: simTraces
    },
    baselineMetrics: {
      targetBaselineLatency: targetService.latencyP99,
      targetBaselineErrorRate: targetService.errorRate,
      simulatedLatency: simTarget.latencyP99,
      simulatedErrorRate: simTarget.errorRate
    }
  };
}
