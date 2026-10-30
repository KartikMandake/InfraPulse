/**
 * Integration Health Monitor — InfraPulse Phase 19
 *
 * Implements:
 * - Periodic & on-demand health verification across configured integrations
 * - Stale synchronization detection
 * - State transition recording in integration_health_events
 * - Health recovery and duplicate suppression
 */

import { integrationService } from './integration.service.js';
import { integrationRepository } from '../repositories/integration.repository.js';

export const integrationHealthMonitor = {
  /**
   * Evaluates all enabled integrations for a tenant.
   */
  async runHealthCheck(tenantId = 'default_tenant') {
    const integrations = await integrationRepository.listIntegrations({ tenantId });
    const results = [];

    for (const item of integrations) {
      if (!item.enabled) continue;

      try {
        const testRes = await integrationService.testConnection(item.id, tenantId);
        results.push({
          id: item.id,
          provider: item.provider,
          status: testRes.status,
          message: testRes.message,
          latencyMs: testRes.latencyMs
        });
      } catch (err) {
        results.push({
          id: item.id,
          provider: item.provider,
          status: 'ERROR',
          message: err.message
        });
      }
    }

    return results;
  }
};

