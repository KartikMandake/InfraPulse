/**
 * Integration Provider Base Class — InfraPulse Phase 19
 *
 * All platform ecosystem providers (GitHub, Kubernetes, Prometheus, Grafana, Slack, OpenTelemetry)
 * extend this abstract base class and implement its lifecycle methods.
 */

import { redactSecrets } from './crypto.js';

export class IntegrationProvider {
  /**
   * @param {Object} options
   * @param {string} options.key - Unique provider key (e.g. 'github')
   * @param {string} options.name - Human-readable provider name
   * @param {string} options.category - Provider category ('source_control', 'orchestration', 'metrics', 'alerting', 'messaging', 'tracing')
   * @param {string} options.description - Provider description
   */
  constructor({ key, name, category, description }) {
    if (!key || !name) {
      throw new Error('IntegrationProvider requires key and name.');
    }
    this.key = key;
    this.name = name;
    this.category = category || 'custom';
    this.description = description || '';
  }

  /**
   * Validates non-secret integration configuration options.
   * @param {Object} config
   * @returns {{ valid: boolean, errors?: Array<string> }}
   */
  validateConfig(config) {
    return { valid: true };
  }

  /**
   * Validates secret credential fields before encryption.
   * @param {Object} credentials
   * @returns {{ valid: boolean, errors?: Array<string> }}
   */
  validateCredentials(credentials) {
    return { valid: true };
  }

  /**
   * Actively tests connectivity to the external provider using provided config and credentials.
   * @param {Object} config
   * @param {Object} credentials
   * @returns {Promise<{ ok: boolean, message: string, latencyMs?: number, details?: Object }>}
   */
  async testConnection(config, credentials) {
    throw new Error(`testConnection not implemented by provider ${this.key}`);
  }

  /**
   * Performs quick health check.
   * @param {Object} config
   * @param {Object} credentials
   * @returns {Promise<{ status: 'CONNECTED' | 'DEGRADED' | 'ERROR', reason?: string }>}
   */
  async checkHealth(config, credentials) {
    try {
      const res = await this.testConnection(config, credentials);
      return {
        status: res.ok ? 'CONNECTED' : 'ERROR',
        reason: res.message || (res.ok ? 'Connection healthy' : 'Connection failed')
      };
    } catch (err) {
      return {
        status: 'ERROR',
        reason: err.message
      };
    }
  }

  /**
   * Sanitizes credentials for storage preview or response.
   * @param {Object} credentials
   * @returns {Object}
   */
  redactCredentials(credentials) {
    return redactSecrets(credentials);
  }
}

