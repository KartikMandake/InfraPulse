export class ServiceFaultControls {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.faults = {
      latencyMs: 0,
      http5xxRate: 0, // 0 to 1 (e.g. 0.5 = 50% errors)
      downstreamTimeout: false
    };
  }

  setFaults(newFaults = {}) {
    this.faults = { ...this.faults, ...newFaults };
    return this.faults;
  }

  getFaults() {
    return this.faults;
  }

  reset() {
    this.faults = {
      latencyMs: 0,
      http5xxRate: 0,
      downstreamTimeout: false
    };
    return this.faults;
  }

  middleware() {
    return async (req, res, next) => {
      // Exclude internal fault management and health endpoints from synthetic failure injection
      if (req.path.startsWith('/api/faults') || req.path === '/health') {
        return next();
      }

      // 1. Check HTTP 5xx failure injection
      if (this.faults.http5xxRate > 0 && Math.random() < this.faults.http5xxRate) {
        return res.status(503).json({
          error: `[Fault Injected] Simulated 503 Service Unavailable on ${this.serviceName}`,
          service: this.serviceName,
          timestamp: new Date().toISOString()
        });
      }

      // 2. Check injected latency
      if (this.faults.latencyMs > 0) {
        await new Promise(r => setTimeout(r, this.faults.latencyMs));
      }

      next();
    };
  }
}
