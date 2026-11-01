// ==============================================================================
// InfraPulse - Mock Cloud Provider Engine
// Base deterministic provider for simulated lifecycle execution
// ==============================================================================

export class MockCloudProvider {
  constructor(name = 'mock') {
    this.name = name;
    this.isSimulation = true;
  }

  async inspect(resource) {
    return {
      success: true,
      provider: this.name,
      resourceId: resource.id,
      state: resource.current_state,
      healthy: resource.last_health_check_status === 'healthy',
      latencyMs: 12,
      isSimulated: true,
      timestamp: new Date().toISOString()
    };
  }

  async start(resource) {
    if (resource.current_state === 'running') {
      return {
        success: true,
        alreadyInState: true,
        previousState: 'running',
        newState: 'running',
        message: `Resource ${resource.id} is already running.`
      };
    }

    return {
      success: true,
      previousState: resource.current_state,
      newState: 'running',
      message: `Resource ${resource.id} started successfully.`,
      operationDurationMs: 45,
      isSimulated: true,
      timestamp: new Date().toISOString()
    };
  }

  async stop(resource) {
    if (resource.current_state === 'stopped') {
      return {
        success: true,
        alreadyInState: true,
        previousState: 'stopped',
        newState: 'stopped',
        message: `Resource ${resource.id} is already stopped.`
      };
    }

    return {
      success: true,
      previousState: resource.current_state,
      newState: 'stopped',
      message: `Resource ${resource.id} stopped safely. Compute ceased, persistent storage preserved.`,
      operationDurationMs: 40,
      isSimulated: true,
      timestamp: new Date().toISOString()
    };
  }

  async restart(resource) {
    return {
      success: true,
      previousState: resource.current_state,
      newState: 'running',
      message: `Resource ${resource.id} restarted successfully.`,
      operationDurationMs: 65,
      isSimulated: true,
      timestamp: new Date().toISOString()
    };
  }

  async scale(resource, { replicas }) {
    const targetReplicas = parseInt(replicas, 10);
    const newState = targetReplicas === 0 ? 'scaled_down' : 'running';

    return {
      success: true,
      previousReplicas: resource.metadata?.replicas || 1,
      newReplicas: targetReplicas,
      newState,
      message: `Resource ${resource.id} scaled to ${targetReplicas} replicas.`,
      isSimulated: true,
      timestamp: new Date().toISOString()
    };
  }

  async healthCheck(resource) {
    const isOnline = resource.current_state === 'running';
    return {
      success: true,
      healthy: isOnline,
      status: isOnline ? 'healthy' : 'unreachable',
      responseTimeMs: isOnline ? 18 : null,
      isSimulated: true,
      timestamp: new Date().toISOString()
    };
  }
}

