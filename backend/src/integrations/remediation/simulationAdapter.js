import { RemediationAdapter } from './remediationAdapter.interface.js';
import * as servicesRepo from '../../repositories/services.repository.js';
import { getServices as getMemServices } from '../../data/services.js';
import { getTelemetryLogs } from '../../data/telemetry.js';

export const ALLOWLISTED_ACTIONS = Object.freeze([
  'inspect_service_health',
  'read_service_metrics',
  'inspect_recent_logs',
  'verify_dependency_status',
  'simulate_service_restart',
  'simulate_service_scale',
  'simulate_canary_depromote',
  'verify_service_recovery'
]);

export class SimulationRemediationAdapter extends RemediationAdapter {
  constructor() {
    super('simulation');
    this.timeoutMs = 5000;
  }

  isActionSupported(action) {
    return ALLOWLISTED_ACTIONS.includes(action);
  }

  /**
   * Safe execution entry point with strict validation, timeout, and structured response.
   */
  async executeAction({ action, targetServiceId, parameters = {}, context = {} }) {
    const startTime = Date.now();

    try {
      // 1. Validate action is strictly in allowlist
      if (!this.isActionSupported(action)) {
        throw new Error(`Action "${action}" is not permitted. Only allowlisted simulation actions are executable.`);
      }

      // 2. Validate target service ID
      if (!targetServiceId || typeof targetServiceId !== 'string' || !/^[a-zA-Z0-9_\-\*]+$/.test(targetServiceId)) {
        throw new Error(`Invalid target service ID: "${targetServiceId}".`);
      }

      // 3. Reject any parameter attempting command injection or SQL syntax
      const paramStr = JSON.stringify(parameters);
      if (/(rm\s+-rf|drop\s+table|delete\s+from|shutdown|reboot|;\s*--)/i.test(paramStr)) {
        throw new Error('Action parameters contain prohibited command or SQL injection patterns.');
      }

      // 4. Execute action bounded by timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Adapter action "${action}" timed out after ${this.timeoutMs}ms.`)), this.timeoutMs);
      });

      const executionPromise = this._dispatchAction(action, targetServiceId, parameters, context);

      const details = await Promise.race([executionPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      return {
        success: true,
        action,
        adapterType: 'simulation',
        targetServiceId,
        simulated: true,
        durationMs,
        details,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        action,
        adapterType: 'simulation',
        targetServiceId: targetServiceId || 'unknown',
        simulated: true,
        durationMs,
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async _resolveService(serviceId) {
    if (serviceId === '*') return null;
    try {
      const dbServices = await servicesRepo.findAllServices();
      const match = dbServices.find(s => s.id === serviceId);
      if (match) return match;
    } catch {
      // Fallback to memory
    }
    const memServices = getMemServices();
    return memServices.find(s => s.id === serviceId) || {
      id: serviceId,
      name: serviceId,
      status: 'nominal',
      latencyP99: 45,
      errorRate: 0.1,
      cpuPercent: 35,
      memoryPercent: 52,
      podCount: 3,
      dependencies: []
    };
  }

  async _dispatchAction(action, targetServiceId, parameters, context) {
    const service = await this._resolveService(targetServiceId);

    switch (action) {
      case 'inspect_service_health': {
        return {
          serviceId: targetServiceId,
          status: service ? service.status : 'nominal',
          cpuPercent: service ? service.cpuPercent : 42,
          memoryPercent: service ? service.memoryPercent : 64,
          podCount: service ? service.podCount : 3,
          healthCheck: 'passed',
          activeWaitQueues: parameters.resource === 'connectionPool' ? 0 : undefined,
          simulatedOutput: `Container health verified: 3/3 pods ready, CPU=${service ? service.cpuPercent : 42}%, MEM=${service ? service.memoryPercent : 64}%.`
        };
      }

      case 'read_service_metrics': {
        const metric = parameters.metric || 'latencyP99';
        const observedValue = service ? (service[metric] ?? 38) : 38;
        const threshold = parameters.threshold || 200;
        const isAnomalous = observedValue > threshold;

        return {
          serviceId: targetServiceId,
          metric,
          observedValue,
          threshold,
          breached: isAnomalous,
          simulatedOutput: `Metric ${metric} is currently ${observedValue} (Threshold: ${threshold}). Status: ${isAnomalous ? 'ELEVATED' : 'NOMINAL'}.`
        };
      }

      case 'inspect_recent_logs': {
        const logs = getTelemetryLogs().filter(l => targetServiceId === '*' || l.service === targetServiceId);
        const limit = Math.min(parameters.limit || 20, 50);
        const level = parameters.level || 'all';

        const filtered = logs
          .filter(l => level === 'all' || l.level?.toLowerCase() === level.toLowerCase())
          .slice(0, limit)
          .map(l => ({
            timestamp: l.timestamp,
            level: l.level,
            message: l.message
          }));

        return {
          serviceId: targetServiceId,
          logCount: filtered.length,
          recentLines: filtered,
          simulatedOutput: `Retrieved ${filtered.length} log lines for service ${targetServiceId}.`
        };
      }

      case 'verify_dependency_status': {
        const deps = service?.dependencies || [];
        const checkResults = deps.map(depId => ({
          dependencyId: depId,
          status: 'healthy',
          p99LatencyMs: 28,
          circuitBreakerState: 'CLOSED'
        }));

        return {
          serviceId: targetServiceId,
          dependenciesEvaluated: deps.length,
          dependencyDetails: checkResults,
          simulatedOutput: `Evaluated ${deps.length} dependencies for ${targetServiceId}. All circuit breakers CLOSED.`
        };
      }

      case 'simulate_service_restart': {
        // Safe simulation of rolling pod restart with a 150ms synthetic delay
        await new Promise(r => setTimeout(r, 150));
        return {
          serviceId: targetServiceId,
          restartType: 'rolling_restart',
          podsRestarted: service?.podCount || 3,
          readinessCheck: 'all_pods_passed',
          simulatedOutput: `Simulated graceful rolling restart of ${service?.podCount || 3} pods on ${targetServiceId}. Zero dropped connections.`
        };
      }

      case 'simulate_service_scale': {
        const target = parameters.scaleTarget || 'connection_pool';
        const newMax = parameters.maxPoolSize || 180;
        return {
          serviceId: targetServiceId,
          scaledEntity: target,
          previousLimit: 100,
          newLimit: newMax,
          simulatedOutput: `Simulated dynamic expansion of ${target} to ${newMax} on ${targetServiceId}. Pool ceiling reloaded.`
        };
      }

      case 'simulate_canary_depromote': {
        const targetRevision = parameters.targetRevision || 'stable';
        return {
          serviceId: targetServiceId,
          action: 'canary_depromote',
          targetRevision,
          canaryTrafficPercent: 0,
          stableTrafficPercent: 100,
          simulatedOutput: `Simulated instant canary depromotion on ${targetServiceId}. Traffic drained from canary to stable release (${targetRevision}).`
        };
      }

      case 'verify_service_recovery': {
        const metric = parameters.expectedMetric || 'latencyP99';
        const maxAcceptable = parameters.maxAcceptable || 50;
        return {
          serviceId: targetServiceId,
          verifiedMetric: metric,
          currentValue: 32,
          maxAcceptable,
          recovered: true,
          status: 'nominal',
          simulatedOutput: `Recovery verification passed: ${metric} is 32ms (<= ${maxAcceptable}ms). Service status is NOMINAL.`
        };
      }

      default:
        throw new Error(`Unhandled action: ${action}`);
    }
  }
}

// Singleton adapter instance
export const simulationAdapter = new SimulationRemediationAdapter();
