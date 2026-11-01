// ==============================================================================
// InfraPulse - Desired-State Baseline Management Service
// Phase 23G: Explicit, Authorized Baseline Creation, Versioning & Resource Configurations
// ==============================================================================

import crypto from 'crypto';
import { driftGovernanceRepository } from '../../../repositories/driftGovernance.repository.js';
import { snapshotService, computeConfigHash, canonicalizeConfig } from './snapshot.service.js';
import { resourceService } from './resource.service.js';
import { recordAuditEvent } from '../../audit.service.js';
import { withTransaction } from '../../../db/connection.js';

export const baselineService = {
  /**
   * Creates or activates an authorized desired-state baseline.
   *
   * @param {Object} params
   * @param {string} params.environment - 'staging', 'production', etc.
   * @param {string} params.name - Descriptive name (e.g. 'Staging Golden Baseline v1')
   * @param {Object} params.resourceConfigurations - Map of resourceId -> desired configuration
   * @param {Object} params.user - Submitting user (must be responder or admin)
   */
  async createBaseline(arg1, arg2, arg3) {
    let environment = 'staging';
    let name = null;
    let resourceConfigurations = {};
    let user = null;
    let organizationId = 'default_tenant';
    let tenantId = 'default_tenant';

    if (typeof arg1 === 'object' && !Array.isArray(arg1) && (arg1.resourceConfigurations || arg1.environment || arg1.name || arg1.user)) {
      environment = arg1.environment || 'staging';
      name = arg1.name;
      resourceConfigurations = arg1.resourceConfigurations || {};
      user = arg1.user;
      organizationId = arg1.organizationId || 'default_tenant';
      tenantId = arg1.tenantId || 'default_tenant';
    } else if (typeof arg1 === 'string') {
      environment = arg1;
      if (Array.isArray(arg2)) {
        resourceConfigurations = {};
        for (const r of arg2) {
          const resId = r.resource_id || r.id;
          resourceConfigurations[resId] = r;
        }
        user = arg3;
      } else if (typeof arg2 === 'string') {
        name = arg2;
        resourceConfigurations = arg3 || {};
      } else if (typeof arg2 === 'object') {
        resourceConfigurations = arg2 || {};
        user = arg3;
      }
    }

    if (!user || user.role === 'viewer') {
      throw new Error(`Forbidden: Role 'viewer' is not authorized to create or update infrastructure baselines. Minimum role required: 'responder'.`);
    }

    if (!name || typeof name !== 'string') {
      name = `${environment.toUpperCase()} Baseline (${new Date().toISOString().split('T')[0]})`;
    }

    // Canonicalize all resource configurations
    const canonicalConfigs = {};
    for (const [resId, cfg] of Object.entries(resourceConfigurations)) {
      canonicalConfigs[resId] = canonicalizeConfig(cfg);
    }

    const baselineHash = computeConfigHash(canonicalConfigs);
    const baselineId = `base_${crypto.randomBytes(6).toString('hex')}`;

    return withTransaction(async (client) => {
      // Deactivate older active baselines for this environment
      await driftGovernanceRepository.deactivateBaselinesForEnv(environment, tenantId, client);

      // Determine next version number
      const history = await driftGovernanceRepository.getBaselineHistory(environment, tenantId, 1);
      const nextVersion = history.length > 0 ? (history[0].version + 1) : 1;

      const created = await driftGovernanceRepository.createBaseline({
        id: baselineId,
        tenantId,
        organizationId,
        environment,
        name,
        version: nextVersion,
        isActive: true,
        resourceConfigurations: canonicalConfigs,
        configurationHash: baselineHash,
        createdBy: user.email || user.name || 'admin'
      }, client);

      await recordAuditEvent({
        userId: user.id || null,
        userEmail: user.email || 'admin',
        action: 'CLOUD_BASELINE_CREATED',
        resourceType: 'cloud_baseline',
        resourceId: baselineId,
        details: { environment, name, version: nextVersion, hash: baselineHash, resourceCount: Object.keys(canonicalConfigs).length }
      });

      const parsedConfigs = typeof created.resource_configurations === 'string'
        ? JSON.parse(created.resource_configurations)
        : (created.resource_configurations || {});

      created.resources = {};
      for (const [resKey, resVal] of Object.entries(parsedConfigs)) {
        created.resources[resKey] = {
          id: resKey,
          name: resVal.name || resVal.resource_name || resKey,
          config: resVal.config || resVal.metadata || resVal
        };
      }

      return created;
    });
  },

  /**
   * Initializes a baseline from current verified infrastructure inventory.
   * NOTE: This is an explicit, administrative operation.
   */
  async initializeBaselineFromInventory({ environment = 'staging', name = null, user, organizationId = 'default_tenant', tenantId = 'default_tenant' }) {
    if (user?.role !== 'admin') {
      throw new Error('Forbidden: Only Administrators can initialize baselines from current inventory.');
    }

    const resources = await resourceService.getAllResources({ environment });
    if (resources.length === 0) {
      throw new Error(`Cannot initialize baseline: No resources found in environment '${environment}'.`);
    }

    const resourceConfigs = {};
    for (const r of resources) {
      resourceConfigs[r.id] = snapshotService.normalizeResourceConfig(r);
    }

    const baselineName = name || `${environment.toUpperCase()} Canonical Baseline (${new Date().toLocaleDateString()})`;

    return this.createBaseline({
      environment,
      name: baselineName,
      resourceConfigurations: resourceConfigs,
      user,
      organizationId,
      tenantId
    });
  },

  /**
   * Retrieves active baseline for environment.
   */
  async getActiveBaseline(environment = 'staging', tenantId = 'default_tenant') {
    return driftGovernanceRepository.getActiveBaseline(environment, tenantId);
  },

  /**
   * Retrieves baseline version history.
   */
  async getBaselineHistory(environment = 'staging', tenantId = 'default_tenant', limit = 20) {
    return driftGovernanceRepository.getBaselineHistory(environment, tenantId, limit);
  },

  /**
   * Updates desired configuration for a single resource in the baseline, incrementing baseline version.
   */
  async updateResourceInBaseline(arg1, arg2, arg3, arg4) {
    let environment = 'staging';
    let resourceId;
    let configuration;
    let user;
    let organizationId = 'default_tenant';
    let tenantId = 'default_tenant';

    if (typeof arg1 === 'object' && arg1.resourceId) {
      environment = arg1.environment || 'staging';
      resourceId = arg1.resourceId;
      configuration = arg1.configuration;
      user = arg1.user;
      organizationId = arg1.organizationId || 'default_tenant';
      tenantId = arg1.tenantId || 'default_tenant';
    } else {
      environment = arg1;
      resourceId = arg2;
      configuration = arg3;
      user = arg4;
    }

    if (user?.role !== 'admin') {
      throw new Error('Forbidden: Only Administrators can update desired-state resource configurations.');
    }

    const active = await this.getActiveBaseline(environment, tenantId);
    if (!active) {
      throw new Error(`No active baseline found for environment '${environment}'. Initialize a baseline first.`);
    }

    const currentConfigs = typeof active.resource_configurations === 'string'
      ? JSON.parse(active.resource_configurations)
      : { ...active.resource_configurations };

    // Update target resource
    const existing = currentConfigs[resourceId] || {};
    currentConfigs[resourceId] = {
      ...existing,
      ...canonicalizeConfig(configuration),
      config: canonicalizeConfig(configuration)
    };

    return this.createBaseline({
      environment,
      name: `${active.name} (Updated ${resourceId})`,
      resourceConfigurations: currentConfigs,
      user,
      organizationId,
      tenantId
    });
  }
};
