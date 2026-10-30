/**
 * Integration Registry — InfraPulse Phase 19
 *
 * Central registry managing all platform ecosystem integration providers.
 */

import { GitHubProvider } from '../providers/github/GitHubProvider.js';
import { KubernetesProvider } from '../providers/kubernetes/KubernetesProvider.js';
import { PrometheusProvider } from '../providers/prometheus/PrometheusProvider.js';
import { GrafanaProvider } from '../providers/grafana/GrafanaProvider.js';
import { SlackProvider } from '../providers/slack/SlackProvider.js';
import { OpenTelemetryProvider } from '../providers/opentelemetry/OpenTelemetryProvider.js';

class IntegrationRegistry {
  constructor() {
    this.providers = new Map();
    this.registerDefaultProviders();
  }

  registerDefaultProviders() {
    this.register(new GitHubProvider());
    this.register(new KubernetesProvider());
    this.register(new PrometheusProvider());
    this.register(new GrafanaProvider());
    this.register(new SlackProvider());
    this.register(new OpenTelemetryProvider());
  }

  register(provider) {
    if (!provider || !provider.key) {
      throw new Error('Cannot register provider without valid key.');
    }
    this.providers.set(provider.key, provider);
  }

  get(providerKey) {
    return this.providers.get(providerKey) || null;
  }

  list() {
    return Array.from(this.providers.values()).map(p => ({
      key: p.key,
      name: p.name,
      category: p.category,
      description: p.description
    }));
  }
}

export const integrationRegistry = new IntegrationRegistry();

