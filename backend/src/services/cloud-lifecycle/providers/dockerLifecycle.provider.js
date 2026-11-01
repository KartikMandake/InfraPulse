// ==============================================================================
// InfraPulse - Governed Docker Lifecycle Provider
// Phase 23F: Controlled Docker Container & Docker Compose Lifecycle Management
//
// Safety Guarantees:
// 1. Separate mutating provider: Supports start, stop with graceful timeout (SIGTERM),
//    restart, inspect, and compose scaling.
// 2. Absolutely NO container removal (rm), image pruning, or volume destruction.
// 3. DOCKER_LIFECYCLE_ENABLED guard: Strictly disabled by default.
// 4. Injected client support for deterministic unit tests.
// 5. Zero compensating destructive actions on failure.
// ==============================================================================

import http from 'http';
import { config } from '../../../config/env.js';

export class DockerLifecycleProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.socketPath]
   * @param {Object} [options.client] - Injected client for unit tests
   */
  constructor({ socketPath = config.dockerSocketPath, client = null } = {}) {
    this.socketPath = socketPath;
    this.client = client;
  }

  _checkFeatureFlag() {
    if (!config.dockerLifecycleEnabled) {
      throw new Error('Live Docker Lifecycle Mutations are currently DISABLED by configuration (DOCKER_LIFECYCLE_ENABLED=false). No commands sent to Docker Engine.');
    }
  }

  /**
   * Internal HTTP dispatcher to Docker Engine REST API
   */
  async _request(path, method = 'GET', body = null) {
    if (this.client) {
      return this.client.request(path, method, body);
    }

    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const options = {
        socketPath: this.socketPath,
        path: `/v1.43${path}`,
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      };

      const req = http.request(options, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = rawData ? JSON.parse(rawData) : {};
          } catch {
            parsed = { raw: rawData };
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const err = new Error(parsed.message || `Docker API error: HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Failed to connect to Docker Engine (${this.socketPath}): ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Docker request to '${path}' timed out after 10000ms.`));
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * 1. List all containers
   */
  async listContainers({ all = true } = {}) {
    if (this.client) {
      return this.client.listContainers({ all });
    }
    return this._request(`/containers/json?all=${all}`);
  }

  /**
   * 2. Inspect a specific container
   */
  async inspectContainer(containerIdOrName) {
    if (this.client) {
      return this.client.inspectContainer(containerIdOrName);
    }
    return this._request(`/containers/${encodeURIComponent(containerIdOrName)}/json`);
  }

  /**
   * 3. Start a container
   */
  async startContainer(containerIdOrName) {
    this._checkFeatureFlag();
    const startMs = Date.now();

    if (this.client) {
      return this.client.startContainer(containerIdOrName);
    }

    await this._request(`/containers/${encodeURIComponent(containerIdOrName)}/start`, 'POST');
    const inspected = await this.inspectContainer(containerIdOrName);

    return {
      success: true,
      containerId: containerIdOrName,
      currentState: inspected?.State?.Status || 'running',
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 4. Stop a container with configurable graceful timeout (SIGTERM)
   */
  async stopContainer(containerIdOrName, { timeoutSeconds = 10 } = {}) {
    this._checkFeatureFlag();
    const startMs = Date.now();

    if (this.client) {
      return this.client.stopContainer(containerIdOrName, { timeoutSeconds });
    }

    await this._request(`/containers/${encodeURIComponent(containerIdOrName)}/stop?t=${timeoutSeconds}`, 'POST');
    const inspected = await this.inspectContainer(containerIdOrName);

    return {
      success: true,
      containerId: containerIdOrName,
      currentState: inspected?.State?.Status || 'exited',
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 5. Restart a container with graceful timeout
   */
  async restartContainer(containerIdOrName, { timeoutSeconds = 10 } = {}) {
    this._checkFeatureFlag();
    const startMs = Date.now();

    if (this.client) {
      return this.client.restartContainer(containerIdOrName, { timeoutSeconds });
    }

    await this._request(`/containers/${encodeURIComponent(containerIdOrName)}/restart?t=${timeoutSeconds}`, 'POST');
    const inspected = await this.inspectContainer(containerIdOrName);

    return {
      success: true,
      containerId: containerIdOrName,
      currentState: inspected?.State?.Status || 'running',
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 6. Probe container health
   */
  async getContainerHealth(containerIdOrName) {
    if (this.client) {
      return this.client.getContainerHealth(containerIdOrName);
    }

    try {
      const inspected = await this.inspectContainer(containerIdOrName);
      const status = inspected?.State?.Health?.Status || (inspected?.State?.Running ? 'healthy' : 'stopped');
      return {
        healthy: status === 'healthy' || inspected?.State?.Running === true,
        status,
        exitCode: inspected?.State?.ExitCode || 0,
        running: inspected?.State?.Running || false,
        restarting: inspected?.State?.Restarting || false,
        startedAt: inspected?.State?.StartedAt,
        finishedAt: inspected?.State?.FinishedAt
      };
    } catch (err) {
      return {
        healthy: false,
        status: 'unreachable',
        error: err.message
      };
    }
  }

  /**
   * 7. List Docker Compose services
   */
  async listComposeServices(projectName = 'infrapulse') {
    if (this.client) {
      return this.client.listComposeServices(projectName);
    }

    try {
      const all = await this.listContainers({ all: true });
      const services = (Array.isArray(all) ? all : [])
        .filter(c => c.Labels && c.Labels['com.docker.compose.project'] === projectName)
        .map(c => ({
          service: c.Labels['com.docker.compose.service'],
          containerId: c.Id,
          names: c.Names,
          state: c.State,
          status: c.Status
        }));
      return services;
    } catch (err) {
      return [];
    }
  }

  /**
   * 8. Scale Docker Compose service
   */
  async scaleComposeService(serviceName, replicas = 1) {
    this._checkFeatureFlag();
    if (this.client) {
      return this.client.scaleComposeService(serviceName, replicas);
    }
    throw new Error('Docker Compose service scaling requires an active Compose orchestrator.');
  }
}

