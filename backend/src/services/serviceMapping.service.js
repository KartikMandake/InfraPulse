// ==============================================================================
// InfraPulse - Service Identity & Dependency Mapping Engine
// Phase 23I: Real-Infrastructure-to-Service Mapping, Observed & Inferred Graph
// ==============================================================================

import crypto from 'node:crypto';
import { query } from '../db/connection.js';
import * as servicesRepo from '../repositories/services.repository.js';

export const serviceMappingService = {
  /**
   * Resolves or maps an incoming infrastructure workload or telemetry entity to a canonical service ID.
   */
  resolveServiceIdentity({
    serviceName = null,
    serviceNamespace = null,
    environment = 'staging',
    composeService = null,
    composeProject = null,
    k8sDeployment = null,
    k8sLabels = {},
    awsTags = {},
    resourceId = null
  } = {}) {
    // 1. Explicit service name from telemetry (e.g., OTLP service.name)
    if (serviceName && typeof serviceName === 'string' && serviceName.trim().length > 0) {
      return this._canonicalizeServiceName(serviceName);
    }

    // 2. Kubernetes labels / deployment
    const k8sApp = k8sLabels['app'] || k8sLabels['app.kubernetes.io/name'] || k8sLabels['service'];
    if (k8sApp) {
      return this._canonicalizeServiceName(k8sApp);
    }
    if (k8sDeployment) {
      return this._canonicalizeServiceName(k8sDeployment);
    }

    // 3. Docker Compose service label
    if (composeService) {
      return this._canonicalizeServiceName(composeService);
    }

    // 4. AWS tags
    const awsServiceTag = awsTags['Service'] || awsTags['service'] || awsTags['App'] || awsTags['app'] || awsTags['Name'];
    if (awsServiceTag) {
      return this._canonicalizeServiceName(awsServiceTag);
    }

    // 5. Fallback based on resourceId heuristic (e.g., "payment-ec2-01" -> "payment-service")
    if (resourceId) {
      const lower = resourceId.toLowerCase();
      if (lower.includes('payment')) return 'payment-service';
      if (lower.includes('auth')) return 'auth-gateway-v2';
      if (lower.includes('order')) return 'order-processor';
      if (lower.includes('notif')) return 'notification-service';
      if (lower.includes('inventory')) return 'inventory-service';
      if (lower.includes('checkout')) return 'checkout-service';
    }

    return 'unknown-service';
  },

  /**
   * Canonicalizes names (converts to lowercase kebab-case, normalizes common suffixes).
   */
  _canonicalizeServiceName(name) {
    let clean = String(name).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    // Ensure clean ID
    if (clean.startsWith('/')) clean = clean.substring(1);
    if (clean.endsWith('-')) clean = clean.substring(0, clean.length - 1);
    return clean;
  },

  /**
   * Records or increments an observed or inferred dependency between two services.
   */
  async recordDependencyRelationship({
    tenantId = 'default_tenant',
    environment = 'staging',
    sourceServiceId,
    targetServiceId,
    relationshipType = 'calls',
    detectionSource = 'distributed_trace', // 'distributed_trace' | 'compose_link' | 'k8s_service' | 'cloud_resource'
    confidence = 1.0,
    metadata = {}
  }) {
    if (!sourceServiceId || !targetServiceId || sourceServiceId === targetServiceId) {
      return null;
    }

    const cleanSource = this._canonicalizeServiceName(sourceServiceId);
    const cleanTarget = this._canonicalizeServiceName(targetServiceId);

    const depId = `dep-${tenantId}-${environment}-${cleanSource}-${cleanTarget}-${detectionSource}`;

    // 1. Upsert into service_observed_dependencies table
    const res = await query(
      `INSERT INTO service_observed_dependencies (
        id, tenant_id, environment, source_service_id, target_service_id,
        relationship_type, detection_source, confidence,
        first_observed_at, last_observed_at, observation_count, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), 1, $9)
      ON CONFLICT (id) DO UPDATE SET
        last_observed_at = NOW(),
        observation_count = service_observed_dependencies.observation_count + 1,
        confidence = GREATEST(service_observed_dependencies.confidence, EXCLUDED.confidence),
        metadata = service_observed_dependencies.metadata || EXCLUDED.metadata
      RETURNING *;`,
      [
        depId, tenantId, environment, cleanSource, cleanTarget,
        relationshipType, detectionSource, confidence, JSON.stringify(metadata)
      ]
    );

    // 2. Synchronize target into source service's dependencies array in services table
    await this._syncServiceDependenciesArray(cleanSource, cleanTarget);

    return res.rows[0];
  },

  /**
   * Helper to ensure services table dependencies array includes the observed dependency.
   */
  async _syncServiceDependenciesArray(sourceId, targetId) {
    try {
      const service = await servicesRepo.findServiceById(sourceId);
      if (!service) return;

      const currentDeps = Array.isArray(service.dependencies) ? service.dependencies : [];
      if (!currentDeps.includes(targetId)) {
        const updatedDeps = [...currentDeps, targetId];
        await servicesRepo.updateServiceRecord(sourceId, { dependencies: updatedDeps });
      }
    } catch (err) {
      console.warn('[ServiceMapping] _syncServiceDependenciesArray warning:', err.message);
    }
  },

  /**
   * Ingests trace spans and extracts parent -> child call relationships.
   */
  async inferDependenciesFromTraces(traces = [], tenantId = 'default_tenant', environment = 'staging') {
    const relationships = [];
    const traceIds=[...new Set(traces.map(t=>t.traceId||t.normalizedAttributes?.traceId).filter(Boolean))];
    if(traceIds.length){const stored=await query("SELECT service_id,normalized_attributes FROM normalized_events WHERE tenant_id=$1 AND environment=$2 AND normalized_attributes->>'traceId'=ANY($3) AND event_timestamp>NOW()-INTERVAL '2 hours'",[tenantId,environment,traceIds]);traces=[...stored.rows.map(r=>({serviceId:r.service_id,...r.normalized_attributes})),...traces];}
    // Map spans by spanId to trace parent-child callers
    const spanMap = new Map();

    for (const t of traces) {
      const spanId = t.spanId || t.normalizedAttributes?.spanId || t.sourceRefId;
      const service = t.serviceId || t.service;
      if (spanId && service) {
        spanMap.set((t.traceId||t.normalizedAttributes?.traceId||'unknown')+':'+spanId, { service, parentSpanId: (t.traceId||t.normalizedAttributes?.traceId||'unknown')+':'+(t.parentSpanId || t.normalizedAttributes?.parentSpanId) });
      }
    }

    for (const [spanId, span] of spanMap.entries()) {
      if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
        const parentSpan = spanMap.get(span.parentSpanId);
        if (parentSpan.service !== span.service) {
          const recorded = await this.recordDependencyRelationship({
            tenantId,
            environment,
            sourceServiceId: parentSpan.service,
            targetServiceId: span.service,
            relationshipType: 'calls',
            detectionSource: 'distributed_trace',
            confidence: 0.95,
            metadata: { parentSpanId: span.parentSpanId, childSpanId: spanId }
          });
          if (recorded) relationships.push(recorded);
        }
      }
    }

    return relationships;
  },

  /**
   * Retrieves all verified & inferred dependencies for a tenant with freshness.
   */
  async getServiceDependencies(tenantId = 'default_tenant', environment = 'staging') {
    const res = await query(
      `SELECT * FROM service_observed_dependencies
       WHERE tenant_id = $1 AND environment = $2
       ORDER BY confidence DESC, observation_count DESC;`,
      [tenantId, environment]
    );
    return res.rows;
  }
};
