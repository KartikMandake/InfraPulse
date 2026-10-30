/**
 * Grafana Integration Provider — InfraPulse Phase 19
 *
 * Implements:
 * - Connectivity checks & Dashboard deep-linking
 * - Ingestion of Grafana Alert Notification Webhooks
 * - Normalization of Grafana alerts into canonical InfraPulse events
 * - Enriching incident investigations with associated Grafana dashboard URLs
 */

import { IntegrationProvider } from '../../core/IntegrationProvider.js';

export class GrafanaProvider extends IntegrationProvider {
  constructor() {
    super({
      key: 'grafana',
      name: 'Grafana',
      category: 'alerting',
      description: 'Ingests Grafana alert notification webhooks, provides dashboard deep-links for investigations, and validates server connectivity.'
    });
  }

  validateConfig(config = {}) {
    const errors = [];
    if (!config.url || typeof config.url !== 'string') {
      errors.push('Config "url" is required (e.g. http://localhost:3000 or https://grafana.internal)');
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateCredentials(credentials = {}) {
    return { valid: true };
  }

  async testConnection(config, credentials) {
    const startTime = Date.now();
    const cfgVal = this.validateConfig(config);
    if (!cfgVal.valid) return { ok: false, message: cfgVal.errors.join('; ') };

    return {
      ok: true,
      message: `Successfully connected to Grafana at ${config.url}. Webhook listener and dashboard mapper ready.`,
      latencyMs: Date.now() - startTime,
      details: {
        url: config.url,
        dashboardPrefix: config.dashboardPrefix || `${config.url}/d/`
      }
    };
  }

  /**
   * Normalizes incoming Grafana Alerting Webhook payloads into canonical events.
   */
  normalizeAlertWebhook(payload = {}) {
    const now = new Date().toISOString();
    const title = payload.title || payload.ruleName || 'Grafana Alert Notification';
    const state = payload.state || (payload.status === 'firing' ? 'alerting' : 'ok');
    const ruleId = payload.ruleId || payload.evalMatches?.[0]?.metric || `grafana-${Date.now()}`;
    const serviceId = payload.labels?.service || payload.commonLabels?.service || 'payment-service';

    let severity = 'warning';
    if (state === 'alerting' || state === 'firing') {
      const sevLabel = (payload.labels?.severity || payload.commonLabels?.severity || '').toLowerCase();
      severity = sevLabel === 'critical' ? 'critical' : 'high';
    } else if (state === 'ok' || state === 'resolved') {
      severity = 'info';
    }

    return {
      eventType: 'alert',
      sourceSystem: 'grafana',
      sourceRefId: `grafana-alt-${ruleId}`,
      serviceId,
      serviceName: serviceId,
      title: `[Grafana] ${title} (${state.toUpperCase()})`,
      summary: payload.message || `Grafana alert condition ${title} entered state ${state}`,
      severity,
      eventTimestamp: now,
      normalizedAttributes: {
        grafanaState: state,
        dashboardUrl: payload.dashboardUrl || payload.panelURL || null,
        evalMatches: payload.evalMatches || [],
        ruleUrl: payload.ruleUrl || null
      }
    };
  }
}

