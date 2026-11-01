// ==============================================================================
// InfraPulse - Infrastructure Drift Detection Engine
// Phase 23G: State Comparison, Dependency Impact & Idempotent Drift Tracking
// ==============================================================================

import crypto from 'crypto';
import { driftGovernanceRepository } from '../../../repositories/driftGovernance.repository.js';
import { snapshotService, canonicalizeConfig } from './snapshot.service.js';
import { baselineService } from './baseline.service.js';
import { classifyDriftSeverity } from './driftSeverity.service.js';
import { resourceService } from './resource.service.js';
import { cloudLifecycleRepository } from '../../../repositories/cloudLifecycle.repository.js';

/**
 * Deep field-by-field diff between expected and actual configurations.
 */
export function diffConfigurations(expected, actual, prefix = '') {
  const diffs = [];
  const expectedCanon = canonicalizeConfig(expected) || {};
  const actualCanon = canonicalizeConfig(actual) || {};

  const allKeys = new Set([...Object.keys(expectedCanon), ...Object.keys(actualCanon)]);

  for (const key of allKeys) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const expVal = expectedCanon[key];
    const actVal = actualCanon[key];

    if (expVal === undefined && actVal !== undefined) {
      diffs.push({ field: fieldPath, diffType: 'added', expected: null, actual: actVal });
    } else if (expVal !== undefined && actVal === undefined) {
      diffs.push({ field: fieldPath, diffType: 'removed', expected: expVal, actual: null });
    } else if (typeof expVal === 'object' && expVal !== null && typeof actVal === 'object' && actVal !== null && !Array.isArray(expVal) && !Array.isArray(actVal)) {
      diffs.push(...diffConfigurations(expVal, actVal, fieldPath));
    } else if (JSON.stringify(expVal) !== JSON.stringify(actVal)) {
      diffs.push({ field: fieldPath, diffType: 'modified', expected: expVal, actual: actVal });
    }
  }

  return diffs;
}

export const driftDetectionService = {
  /**
   * Computes dependency-aware impact for a drift on a specific resource.
   */
  async analyzeDependencyImpact(resourceId, resourceType = null, environment = 'staging') {
    const allResources = await cloudLifecycleRepository.getAllResources();
    const targetResource = allResources.find(r => r.id === resourceId);

    const downstreamCallers = allResources.filter(r => {
      if (r.id === resourceId) return false;
      const deps = Array.isArray(r.dependencies) ? r.dependencies : [];
      return deps.includes(resourceId);
    });

    const isCritical = targetResource?.is_critical_dependency === true ||
      (targetResource?.name || '').includes('postgres') ||
      targetResource?.resource_type === 'k8s_statefulset';

    const callersRunning = downstreamCallers.filter(c => ['running', 'in-use', 'available'].includes(c.current_state));

    return {
      directlyAffected: resourceId,
      directlyAffectedResource: targetResource ? { id: targetResource.id, name: targetResource.name, type: targetResource.resource_type } : null,
      downstreamCallers: downstreamCallers.map(c => c.name || c.id),
      activeCallersCount: callersRunning.length,
      criticalInfrastructureInvolved: isCritical,
      summary: downstreamCallers.length > 0
        ? `${downstreamCallers.length} downstream service(s) rely on '${targetResource?.name || resourceId}' (${callersRunning.length} currently running).`
        : `Workload '${targetResource?.name || resourceId}' has zero downstream dependencies.`
    };
  },

  /**
   * Evaluates drift for an entire environment against its active baseline.
   */
  async detectDriftForEnvironment(arg1 = 'staging', arg2 = {}) {
    let environment = 'staging';
    let organizationId = 'default_tenant';
    let tenantId = 'default_tenant';
    let user = null;
    let liveResourcesOverride = null;

    if (typeof arg1 === 'object') {
      environment = arg1.environment || 'staging';
      organizationId = arg1.organizationId || 'default_tenant';
      tenantId = arg1.tenantId || 'default_tenant';
      user = arg1.user || null;
      liveResourcesOverride = arg1.liveResourcesOverride || null;
    } else {
      environment = arg1;
      organizationId = arg2.organizationId || 'default_tenant';
      tenantId = arg2.tenantId || 'default_tenant';
      user = arg2.user || null;
      liveResourcesOverride = arg2.liveResourcesOverride || null;
    }

    // 1. Retrieve Active Desired-State Baseline
    const activeBaseline = await baselineService.getActiveBaseline(environment, tenantId);
    if (!activeBaseline) {
      return {
        environment,
        hasBaseline: false,
        message: `No active baseline found for environment '${environment}'. Please initialize a baseline before running drift detection.`,
        driftsDetectedCount: 0,
        driftsDetected: [],
        drifts: []
      };
    }

    const baselineConfigs = typeof activeBaseline.resource_configurations === 'string'
      ? JSON.parse(activeBaseline.resource_configurations)
      : activeBaseline.resource_configurations;

    // 2. Capture fresh observed snapshots from inventory
    const currentResources = liveResourcesOverride
      ? liveResourcesOverride.map(r => ({
          ...r,
          id: r.id || r.resource_id,
          name: r.name || r.resource_name || r.id || r.resource_id,
          provider: r.provider,
          resource_type: r.resource_type || r.type,
          current_state: r.current_state || r.state || 'running',
          environment: r.environment || environment,
          metadata: r.metadata || {}
        }))
      : await resourceService.getAllResources({ environment });

    const observedMap = new Map();

    for (const r of currentResources) {
      const snapConfig = snapshotService.normalizeResourceConfig(r);
      observedMap.set(r.id, {
        resource: r,
        snapshot: { id: `snap_${crypto.randomBytes(6).toString('hex')}` },
        config: snapConfig
      });
    }

    const driftEvents = [];
    const inspectedResourceIds = new Set();

    // 3. Inspect All Resources Present in Baseline
    for (const [resId, rawExpectedConfig] of Object.entries(baselineConfigs)) {
      inspectedResourceIds.add(resId);
      const observed = observedMap.get(resId);
      const expectedConfig = rawExpectedConfig.resourceId ? snapshotService.canonicalizeConfig(rawExpectedConfig) : snapshotService.normalizeResourceConfig(
        rawExpectedConfig.provider || 'generic',
        rawExpectedConfig.resource_type || rawExpectedConfig.resourceType,
        {
          ...(rawExpectedConfig.metadata || {}),
          ...rawExpectedConfig,
          id: resId,
          name: rawExpectedConfig.resource_name || rawExpectedConfig.name || resId,
          state: rawExpectedConfig.state || rawExpectedConfig.current_state || 'running'
        }
      );

      // Check Missing Resource
      if (!observed) {
        const impact = await this.analyzeDependencyImpact(resId);
        const severityResult = classifyDriftSeverity({
          driftType: 'MISSING_RESOURCE',
          resource: { id: resId, name: expectedConfig.name, environment },
          environment,
          changedFields: [{ field: 'presence', diffType: 'REMOVED', expected: 'present', actual: 'missing' }],
          dependencyImpact: impact
        });

        const drift = await this._recordOrUpdateDrift({
          tenantId,
          organizationId,
          environment,
          resourceId: resId,
          resourceName: expectedConfig.name || resId,
          provider: expectedConfig.provider || 'unknown',
          resourceType: expectedConfig.resourceType || 'unknown',
          driftType: 'MISSING_RESOURCE',
          severity: severityResult.severity,
          severityReason: severityResult.reason,
          severityEvidence: severityResult.evidence,
          expectedConfiguration: { ...expectedConfig, state: 'running' },
          actualConfiguration: { status: 'missing', state: 'missing', hash: 'MISSING' },
          changedFields: [{ field: 'presence', diffType: 'REMOVED', expected: 'present', actual: 'missing' }],
          dependencyImpact: impact,
          baselineId: activeBaseline.id,
          baselineVersion: activeBaseline.version,
          snapshotId: null
        });

        driftEvents.push(drift);
        continue;
      }

      // Diff Expected vs Observed
      const actualConfig = observed.config;
      const diffs = diffConfigurations(expectedConfig, actualConfig);

      if (diffs.length > 0) {
        const impact = await this.analyzeDependencyImpact(resId);

        // Identify specific drift type
        let driftType = 'CONFIGURATION_DRIFT';
        const hasReplicaDiff = diffs.some(d => d.field.includes('replicas'));
        const hasStateDiff = diffs.some(d => d.field === 'state' || d.field.endsWith('.state'));

        if (hasReplicaDiff) {
          driftType = 'REPLICA_MISMATCH';
        } else if (hasStateDiff) {
          driftType = 'WORKLOAD_STATE_DRIFT';
        }

        const severityResult = classifyDriftSeverity({
          driftType,
          resource: observed.resource,
          environment,
          changedFields: diffs,
          dependencyImpact: impact
        });

        const drift = await this._recordOrUpdateDrift({
          tenantId,
          organizationId,
          environment,
          resourceId: resId,
          resourceName: observed.resource.name,
          provider: observed.resource.provider,
          resourceType: observed.resource.resource_type,
          driftType,
          severity: severityResult.severity,
          severityReason: severityResult.reason,
          severityEvidence: severityResult.evidence,
          expectedConfiguration: { ...expectedConfig, state: expectedConfig.state || 'running' },
          actualConfiguration: { ...actualConfig, state: observed.resource.current_state },
          changedFields: diffs,
          dependencyImpact: impact,
          baselineId: activeBaseline.id,
          baselineVersion: activeBaseline.version,
          snapshotId: observed.snapshot.id
        });

        driftEvents.push(drift);
      } else {
        // If resource configuration matches expected, auto-reconcile any previously active drift!
        await this._autoReconcileIfResolved(environment, resId, tenantId);
      }
    }

    // 4. Check for Unexpected Resource Additions (Observed but not in Baseline)
    for (const [resId, observed] of observedMap.entries()) {
      if (!inspectedResourceIds.has(resId)) {
        const impact = await this.analyzeDependencyImpact(resId);
        const severityResult = classifyDriftSeverity({
          driftType: 'UNEXPECTED_ADDITION',
          resource: observed.resource,
          environment,
          changedFields: [{ field: 'presence', diffType: 'ADDED', expected: 'not_present', actual: 'observed' }],
          dependencyImpact: impact
        });

        const drift = await this._recordOrUpdateDrift({
          tenantId,
          organizationId,
          environment,
          resourceId: resId,
          resourceName: observed.resource.name,
          provider: observed.resource.provider,
          resourceType: observed.resource.resource_type,
          driftType: 'UNEXPECTED_ADDITION',
          severity: severityResult.severity,
          severityReason: severityResult.reason,
          severityEvidence: severityResult.evidence,
          expectedConfiguration: { status: 'not_present', state: 'not_present' },
          actualConfiguration: { ...observed.config, state: observed.resource.current_state },
          changedFields: [{ field: 'presence', diffType: 'ADDED', expected: 'not_present', actual: 'observed' }],
          dependencyImpact: impact,
          baselineId: activeBaseline.id,
          baselineVersion: activeBaseline.version,
          snapshotId: observed.snapshot.id
        });

        driftEvents.push(drift);
      }
    }

    return {
      environment,
      hasBaseline: true,
      baselineVersion: activeBaseline.version,
      baselineName: activeBaseline.name,
      observedResourcesCount: currentResources.length,
      driftsDetectedCount: driftEvents.length,
      driftsDetected: driftEvents,
      drifts: driftEvents
    };
  },

  /**
   * Idempotent drift recorder: Updates existing unresolved drift or creates new one.
   */
  async _recordOrUpdateDrift(driftData) {
    const existing = await driftGovernanceRepository.findActiveDriftByResourceAndType(
      driftData.environment,
      driftData.resourceId,
      driftData.driftType,
      driftData.tenantId
    );

    if (existing) {
      // Update observation count and last observed timestamp
      const updated = await driftGovernanceRepository.updateDriftObservation(existing.id, {
        actualConfiguration: driftData.actualConfiguration,
        changedFields: driftData.changedFields,
        severity: driftData.severity,
        severityReason: driftData.severityReason,
        severityEvidence: driftData.severityEvidence
      });
      return updated;
    }

    // Create new drift event
    const driftId = `drift_${crypto.randomBytes(6).toString('hex')}`;
    const created = await driftGovernanceRepository.createDriftEvent({
      ...driftData,
      id: driftId
    });

    return created;
  },

  /**
   * If a resource matches desired baseline, automatically mark previously active drift as reconciled.
   */
  async _autoReconcileIfResolved(environment, resourceId, tenantId = 'default_tenant') {
    const activeDrifts = await driftGovernanceRepository.getAllDriftEvents({
      environment,
      resourceId,
      status: 'detected',
      tenantId
    });

    for (const drift of activeDrifts) {
      await driftGovernanceRepository.updateDriftStatus(drift.id, 'reconciled', {
        resolvedBy: 'system:verification_confirmed'
      });
    }
  }
};
