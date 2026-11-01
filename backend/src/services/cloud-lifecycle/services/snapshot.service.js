// ==============================================================================
// InfraPulse - Infrastructure State Snapshot Service
// Phase 23G: Canonical JSON Normalization, SHA-256 Hashing & Configuration Capture
// ==============================================================================

import crypto from 'crypto';
import { driftGovernanceRepository } from '../../../repositories/driftGovernance.repository.js';
import { resourceService } from './resource.service.js';

/**
 * Volatile runtime keys that must be stripped during canonical hashing to avoid false drift.
 */
export const VOLATILE_RUNTIME_KEYS = new Set([
  'observed_at',
  'observedat',
  'timestamp',
  'last_operation_at',
  'last_health_check_at',
  'last_health_check_status',
  'last_observed_at',
  'lastobservedat',
  'created_at',
  'updated_at',
  'creationtimestamp',
  'creation_timestamp',
  'startedat',
  'finishedat',
  'started_at',
  'finished_at',
  'uid',
  'resourceversion',
  'generation',
  'selflink',
  'containerid',
  'pid',
  'podip',
  'restartcount',
  'restart_count',
  'conditions',
  'readyreplicas',
  'availablereplicas',
  'lasttransitiontime',
  'operationdurationms',
  'durationms',
  'latency',
  'latencyms'
]);

/**
 * Deeply sorts object keys alphabetically and strips volatile runtime fields.
 */
export function canonicalizeConfig(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => canonicalizeConfig(item));
  }

  const sortedKeys = Object.keys(obj)
    .filter(key => !VOLATILE_RUNTIME_KEYS.has(key.toLowerCase()))
    .sort();

  const canonical = {};
  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined && typeof val !== 'function') {
      canonical[key] = canonicalizeConfig(val);
    }
  }
  return canonical;
}

/**
 * Computes deterministic SHA-256 hash of canonicalized configuration.
 */
export function computeConfigHash(config) {
  const canonical = canonicalizeConfig(config);
  const jsonString = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(jsonString, 'utf8').digest('hex');
}

export const snapshotService = {
  canonicalizeConfig,
  computeConfigHash,

  /**
   * Normalizes resource object into standard canonical configuration dictionary.
   */
  normalizeResourceConfig(arg1, arg2, arg3) {
    let provider, type, meta, resource;

    if (typeof arg1 === 'string') {
      provider = arg1;
      type = arg2;
      meta = arg3 || {};
      resource = {
        id: meta.id || meta.name || 'test-resource',
        name: meta.name || 'test-resource',
        provider,
        resource_type: type,
        environment: meta.environment || 'staging',
        region: meta.region || 'ap-south-1',
        current_state: meta.state || 'running',
        metadata: meta
      };
    } else {
      resource = arg1 || {};
      provider = resource.provider;
      type = resource.resource_type;
      meta = resource.metadata || {};
    }

    let normalized = {
      resourceId: resource.id,
      name: resource.name,
      provider,
      resourceType: type,
      environment: resource.environment||meta.environment||'staging',
      region: resource.region||meta.region||'ap-south-1',
      state: resource.current_state,
      dependencies: Array.isArray(resource.dependencies) ? [...resource.dependencies].sort() : []
    };

    if (meta.image !== undefined) normalized.image = meta.image;
    if (meta.replicas !== undefined) normalized.replicas = meta.replicas;
    if (meta.env !== undefined) normalized.env = canonicalizeConfig(meta.env);
    if (meta.cpu !== undefined) normalized.cpu = meta.cpu;
    if (meta.memory !== undefined) normalized.memory = meta.memory;
    if (meta.status !== undefined) normalized.status = canonicalizeConfig(meta.status);

    if (provider === 'aws' || ['ec2_instance', 'ec2'].includes(type)) {
      normalized.ec2 = {
        instanceType: meta.instance_type || 't4g.small',
        availabilityZone: meta.availability_zone,
        publicIp: meta.public_ip || null,
        privateIp: meta.private_ip || null,
        tags: meta.tags || {},
        securityGroups: Array.isArray(meta.security_groups) ? [...meta.security_groups].sort() : [],
        blockDeviceMappings: resource.persistence_requirements || {}
      };
    } else if (provider === 'docker' || ['docker_container', 'docker_compose_service'].includes(type)) {
      normalized.docker = {
        containerName: meta.container_name || resource.name,
        image: meta.image || 'alpine:latest',
        portMapping: meta.port_mapping || null,
        command: meta.command || null,
        environmentVariables: meta.env ? { ...meta.env } : {},
        persistentVolume: resource.persistence_requirements?.volume_name || null,
        privileged: meta.privileged || false,
        restartPolicy: meta.restart_policy || 'unless-stopped'
      };
    } else if (provider === 'kubernetes' || ['k8s_deployment', 'k8s_statefulset'].includes(type)) {
      normalized.kubernetes = {
        workloadType: type === 'k8s_statefulset' ? 'StatefulSet' : 'Deployment',
        namespace: meta.namespace || 'infrapulse',
        replicas: meta.replicas !== undefined ? meta.replicas : 1,
        selector: meta.selector || null,
        image: meta.image || 'infrapulse-app:latest',
        resourceRequests: meta.resources?.requests || { cpu: '250m', memory: '256Mi' },
        resourceLimits: meta.resources?.limits || { cpu: '500m', memory: '512Mi' },
        hasPvc: resource.persistence_requirements?.has_pvc || false,
        pvcClaimName: resource.persistence_requirements?.claim_name || null
      };
    } else {
      normalized.generic = { ...meta };
    }

    return canonicalizeConfig(normalized);
  },

  /**
   * Captures and persists an observed state snapshot for a single resource.
   */
  async captureResourceSnapshot(resource, { organizationId = 'default_tenant', tenantId = 'default_tenant', client = null } = {}) {
    const normalized = this.normalizeResourceConfig(resource);
    const hash = computeConfigHash(normalized);
    const snapshotId = `snap_${crypto.randomBytes(6).toString('hex')}`;

    const snapshot = await driftGovernanceRepository.createSnapshot({
      id: snapshotId,
      tenantId,
      organizationId,
      environment: resource.environment,
      provider: resource.provider,
      resourceType: resource.resource_type,
      resourceId: resource.id,
      resourceConfiguration: normalized,
      configurationHash: hash,
      snapshotVersion: 1,
      collectionStatus: 'success',
      sourceProvider: resource.provider,
      observedAt: new Date().toISOString()
    }, client);

    return snapshot;
  },

  /**
   * Captures snapshots for all active resources in an environment.
   */
  async captureEnvironmentSnapshots(environment = 'staging', { organizationId = 'default_tenant', tenantId = 'default_tenant' } = {}) {
    const allResources = await resourceService.getAllResources({ environment });
    const snapshots = [];

    for (const res of allResources) {
      const snap = await this.captureResourceSnapshot(res, { organizationId, tenantId });
      snapshots.push(snap);
    }

    return {
      environment,
      snapshotCount: snapshots.length,
      snapshots
    };
  }
};
