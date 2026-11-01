/**
 * Real Prometheus Integration Provider — InfraPulse Phase 19 / Phase 23H
 *
 * Implements:
 * - Real PromQL instant (/api/v1/query) and range (/api/v1/query_range) queries
 * - Metric metadata discovery (/api/v1/metadata)
 * - BasicAuth and Bearer Token authentication
 * - Bounded query timeouts & SSRF protection
 * - Clear distinction between unreachable endpoint vs healthy 0 metrics
 * - Normalization of PromQL vectors into canonical InfraPulse metrics
 * - Injected client support for unit tests.
 */

import http from 'node:http';
import https from 'node:https';
import { IntegrationProvider } from '../../core/IntegrationProvider.js';
import { validateEndpointUrl,secureLookup } from '../../core/ssrfProtection.js';

export class PrometheusProvider extends IntegrationProvider {
  constructor(opts = {}) {
    const client = opts.client || opts.injectedClient || null;
    super({
      key: 'prometheus',
      name: 'Prometheus',
      category: 'metrics',
      description: 'Executes PromQL instant and range queries, feeds SLI evaluations, and discovers metrics with configurable name mappings.'
    });
    this.injectedClient = client;
  }

  validateConfig(config = {}) {
    const errors = [];
    if (!config.endpoint || typeof config.endpoint !== 'string') {
      errors.push('Config "endpoint" is required (e.g. http://localhost:9090 or https://prometheus.internal)');
    } else {
      const ssrf = validateEndpointUrl(config.endpoint);
      if (!ssrf.safe) {
        errors.push(`Invalid Prometheus endpoint: ${ssrf.error}`);
      }
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateCredentials(credentials = {}) {
    // Prometheus may be internal without auth, or have bearerToken or basicAuth (username/password)
    return { valid: true };
  }

  /**
   * Internal HTTP/HTTPS request dispatcher to Prometheus API
   */
  async _request(path, config = {}, credentials = {}) {
    if (this.injectedClient) {
      return this.injectedClient.request(path);
    }

    const endpoint = config.endpoint;
    const safety=validateEndpointUrl(endpoint);if(!safety.safe)throw new Error(safety.error);
    const parsed = new URL(endpoint);
    const transport = parsed.protocol === 'https:' ? https : http;
    const timeout = config.timeoutMs || 8000;

    let authHeader = null;
    if (credentials.bearerToken) {
      authHeader = `Bearer ${credentials.bearerToken}`;
    } else if (credentials.username && credentials.password) {
      const b64 = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
      authHeader = `Basic ${b64}`;
    }

    return new Promise((resolve, reject) => {
      const fullPath = (parsed.pathname.replace(/\/$/, '') + path).replace(/\/+/g, '/');
      const options = {
        hostname: parsed.hostname.replace(/^\[|\]$/g,''),
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: fullPath,
        method: 'GET',
        lookup:secureLookup,
        timeout,
        headers: {
          'Accept': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        }
      };

      const req = transport.request(options, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 300) {
            return reject(new Error(`Prometheus API error (${res.statusCode}): ${rawData || res.statusMessage}`));
          }
          try {
            const parsed = rawData ? JSON.parse(rawData) : {};
            resolve(parsed);
          } catch {
            resolve(rawData);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Prometheus request to '${fullPath}' timed out after ${timeout}ms.`));
      });

      req.on('error', (err) => {
        reject(new Error(`Prometheus communication error: ${err.message}`));
      });

      req.end();
    });
  }

  async testConnection(config = {}, credentials = {}) {
    const startTime = Date.now();
    const cfgVal = this.validateConfig(config);
    if (!cfgVal.valid) return { ok: false, message: cfgVal.errors.join('; ') };
    const credVal = this.validateCredentials(credentials);
    if (!credVal.valid) return { ok: false, message: credVal.errors.join('; ') };

    if (this.injectedClient) {
      try {
        const ping = await this.injectedClient.ping();
        return {
          ok: ping !== false,
          message: `Successfully connected to Prometheus at ${config.endpoint}. Query API is responsive.`,
          latencyMs: Date.now() - startTime,
          details: { endpoint: config.endpoint, timeoutMs: config.timeoutMs || 5000 }
        };
      } catch (err) {
        return { ok: false, message: `Prometheus Connection Failed: ${err.message}`, latencyMs: Date.now() - startTime };
      }
    }

    try {
      // Test Prometheus API buildinfo or lightweight query
      const res = await this._request('/api/v1/status/buildinfo', config, credentials);
      const version = res.data?.version || 'active';

      return {
        ok: true,
        message: `Successfully connected to Prometheus at ${config.endpoint} (v${version}). PromQL API is responsive.`,
        latencyMs: Date.now() - startTime,
        details: {
          endpoint: config.endpoint,
          version,
          timeoutMs: config.timeoutMs || 5000,
          configuredMappings: Object.keys(config.metricMappings || {}).length
        }
      };
    } catch (err) {
      return {
        ok: false,
        message: `Prometheus Connection Failed: ${err.message}`,
        latencyMs: Date.now() - startTime,
        details: { error: err.message, endpoint: config.endpoint }
      };
    }
  }

  /**
   * Executes a PromQL instant query.
   */
  async queryInstant(queryStr, config = {}, credentials = {}, mockResult = null) {
    if (mockResult) return mockResult;
    if (this.injectedClient) {
      return this.injectedClient.queryInstant(queryStr, config, credentials);
    }

    if (!queryStr || typeof queryStr !== 'string') {
      throw new Error('PromQL query string is required.');
    }

    const encoded = encodeURIComponent(queryStr);
    return this._request(`/api/v1/query?query=${encoded}`, config, credentials);
  }

  /**
   * Executes a PromQL range query.
   */
  async queryRange(queryStr, start, end, step = '15s', config = {}, credentials = {}, mockResult = null) {
    if (mockResult) return mockResult;
    if (this.injectedClient) {
      return this.injectedClient.queryRange(queryStr, start, end, step, config, credentials);
    }

    if (!queryStr || typeof queryStr !== 'string') {
      throw new Error('PromQL query string is required.');
    }

    const encoded = encodeURIComponent(queryStr);
    const startIso = encodeURIComponent(new Date(start).toISOString());
    const endIso = encodeURIComponent(new Date(end).toISOString());

    return this._request(`/api/v1/query_range?query=${encoded}&start=${startIso}&end=${endIso}&step=${step}`, config, credentials);
  }

  /**
   * Discovers Prometheus metric metadata.
   */
  async getMetricMetadata(metricName = '', config = {}, credentials = {}) {
    if (this.injectedClient) {
      return this.injectedClient.getMetricMetadata(metricName, config, credentials);
    }

    const path = metricName ? `/api/v1/metadata?metric=${encodeURIComponent(metricName)}` : '/api/v1/metadata';
    return this._request(path, config, credentials);
  }

  /**
   * Safely formats and maps Prometheus metric results into canonical format.
   * If telemetry is absent or unreachable, marks available = false rather than assuming 0.
   */
  normalizeMetricResult(queryResult, metricName = 'latency_p99', serviceId = 'payment-service') {
    if (!queryResult || queryResult.status !== 'success' || !queryResult.data?.result?.length) {
      return {
        available: false,
        serviceId,
        metricName,
        value: null,
        status: 'UNAVAILABLE',
        reason: 'No series returned by Prometheus for the specified query selector.'
      };
    }

    const firstSeries = queryResult.data.result[0];
    const rawVal = firstSeries.value ? firstSeries.value[1] : null;
    const numVal = rawVal !== null ? parseFloat(rawVal) : null;

    return {
      available: true,
      serviceId,
      metricName,
      value: numVal,
      status: 'AVAILABLE',
      timestamp: firstSeries.value ? new Date(firstSeries.value[0] * 1000).toISOString() : new Date().toISOString(),
      labels: firstSeries.metric || {}
    };
  }
}
