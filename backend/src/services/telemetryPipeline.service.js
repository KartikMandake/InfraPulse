import {query,withTransaction} from '../db/connection.js';
import {tenantContext,withTenant} from '../security/tenantContext.js';
// ==============================================================================
// InfraPulse - Unified Telemetry Normalization & Pipeline Router
// Phase 23H & 23I: Live Telemetry Ingestion, Deduplication, Staleness & Dead-Letter
// ==============================================================================

import crypto from 'node:crypto';
import { integrationRepository } from '../repositories/integration.repository.js';
import { cloudLifecycleRepository } from '../repositories/cloudLifecycle.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import { ingestEvent, normalizeEventPayload } from './eventNormalizer.service.js';
import { evaluateAndCorrelateAlerts } from './alertCorrelation.service.js';
import { driftDetectionService } from './cloud-lifecycle/services/driftDetection.service.js';
import { serviceMappingService } from './serviceMapping.service.js';

function validateEventTimestamp(event) {
  const rawTs = event.eventTimestamp || event.timestamp || event.time;
  if (!rawTs) return { valid: true, timestamp: new Date().toISOString() };
  const date = new Date(rawTs);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Malformed timestamp format', code: 'INVALID_TIMESTAMP' };
  }
  const now = Date.now();
  const eventTime = date.getTime();
  // Future clock skew beyond 5 minutes
  if (eventTime > now + 300000) {
    return { valid: false, error: `Event timestamp is in the future (${rawTs}) beyond 5-minute skew tolerance.`, code: 'FUTURE_TIMESTAMP_EXCEEDED' };
  }
  // Historical events older than 7 days
  if (eventTime < now - 604800000) {
    return { valid: false, error: `Event timestamp is too old (${rawTs}) beyond 7-day retention window.`, code: 'HISTORICAL_TIMESTAMP_EXCEEDED' };
  }
  return { valid: true, timestamp: date.toISOString() };
}

export const telemetryPipelineService = {
  /**
   * Normalizes incoming telemetry payload (metrics, traces, logs) and routes through pipeline.
   * Includes duplicate detection, timestamp validation, dead-letter routing, and dependency inference.
   */
  async normalizeAndRouteTelemetry({
    integrationId = null,
    tenantId = 'default_tenant',
    organizationId = 'default_org',
    environment = 'staging',
    provider = 'opentelemetry',
    telemetryType = 'metric', // 'metric' | 'trace' | 'log'
    events = [],
    rawBytes = 0
  }) {
    if(!tenantContext())return withTenant(tenantId,()=>this.normalizeAndRouteTelemetry({integrationId,tenantId,organizationId,environment,provider,telemetryType,events,rawBytes}));
    const startTime = Date.now();
    const summary = {
      tenantId,
      environment,
      provider,
      telemetryType,
      processedCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      alertTriggers: 0,
      inferredDependencies: 0,
      ingestedEvents: []
    };

    let metricsCount = 0;
    let tracesCount = 0;
    let logsCount = 0;
    let errorCount = 0;

    // 1. Chronological Sorting for Out-of-Order Events
    const sortedEvents = [...events].sort((a, b) => {
      const tA = new Date(a.eventTimestamp || a.timestamp || 0).getTime();
      const tB = new Date(b.eventTimestamp || b.timestamp || 0).getTime();
      return tA - tB;
    });

    // 2. Process each event with validation and deduplication
    for (const rawEv of sortedEvents) {
      try {
        // Timestamp validation
        const tsValidation = validateEventTimestamp(rawEv);
        if (!tsValidation.valid) {
          summary.rejectedCount++;
          await integrationRepository.recordDeadLetter({
            integrationId,
            tenantId,
            environment,
            provider,
            telemetryType,
            payload: rawEv,
            errorReason: tsValidation.error,
            errorCode: tsValidation.code
          }).catch(() => {});
          continue;
        }

        const dedupId=crypto.createHash('sha256').update(JSON.stringify({integrationId:integrationId||null,identity:String(rawEv.sourceRefId||rawEv.id||crypto.createHash('sha256').update(JSON.stringify(rawEv)).digest('hex')),observedAt:(rawEv.eventTimestamp||rawEv.timestamp||rawEv.time)?tsValidation.timestamp:null})).digest('hex');
        const result=await withTransaction(async()=>{
          const claim=await query('INSERT INTO telemetry_deduplication(tenant_id,environment,provider,telemetry_type,event_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING event_key',[tenantId,environment,provider,telemetryType,dedupId]);
          if(!claim.rowCount)return {duplicate:true};
          const mappedServiceId=serviceMappingService.resolveServiceIdentity({serviceName:rawEv.serviceId||rawEv.serviceName||rawEv.service,environment,k8sLabels:rawEv.normalizedAttributes?.resourceAttributes||rawEv.labels||{},composeService:rawEv.composeService||rawEv.normalizedAttributes?.composeService,resourceId:rawEv.resourceId||rawEv.sourceRefId});
          const canonicalEv={...rawEv,tenantId,organizationId,environment,serviceId:mappedServiceId,serviceName:mappedServiceId,eventTimestamp:tsValidation.timestamp};
          const saved=await ingestEvent(canonicalEv,{tenantId});
          if(!saved.success)throw new Error(saved.error);
          let alertTriggers=0;
          if(telemetryType==='metric'){
            await this._updateServiceFromMetric(canonicalEv);
            const alertRes=await evaluateAndCorrelateAlerts({mode:'simulated',useDatabase:true,tenantId});
            alertTriggers=alertRes.rulesTriggered||0;
          }
          return {event:{...canonicalEv,id:saved.event.id},alertTriggers};
        });
        if(result.duplicate){summary.duplicateCount++;continue;}
        summary.ingestedEvents.push(result.event);summary.alertTriggers+=result.alertTriggers||0;
        if(telemetryType==='metric')metricsCount++;else if(telemetryType==='trace')tracesCount++;else logsCount++;
        summary.processedCount++;
      } catch (err) {
        errorCount++;
        summary.rejectedCount++;
        console.warn(`[TelemetryPipeline] Error processing ${telemetryType} event:`, err.message);
        await integrationRepository.recordDeadLetter({
          integrationId,
          tenantId,
          environment,
          provider,
          telemetryType,
          payload: rawEv,
          errorReason: err.message,
          errorCode: 'PROCESSING_ERROR'
        }).catch(() => {});
      }
    }

    // 3. Infer Dependencies from Distributed Traces
    if (telemetryType === 'trace' && summary.ingestedEvents.length > 0) {
      try {
        const inferred = await serviceMappingService.inferDependenciesFromTraces(summary.ingestedEvents, tenantId, environment);
        summary.inferredDependencies = inferred.length;
      } catch (depErr) {
        console.warn('[TelemetryPipeline] Trace dependency inference warning:', depErr.message);
      }
    }

    const processingLatencyMs = Date.now() - startTime;

    // 5. Record enriched stats in integration_telemetry_stats
    if (integrationId) {
      await integrationRepository.recordTelemetryStats({
        integrationId,
        provider,
        environment,
        tenantId,
        organizationId,
        metricsReceived: metricsCount,
        tracesReceived: tracesCount,
        logsReceived: logsCount,
        eventsCount: summary.processedCount,
        bytesReceived: rawBytes || 0,
        eventsRejected: summary.rejectedCount,
        duplicateEvents: summary.duplicateCount,
        processingLatencyMs,
        errorsEncountered: errorCount,
        lastError: errorCount > 0 ? 'Partial telemetry event ingestion failure' : null
      }).catch(statErr => console.warn('[TelemetryPipeline] recordTelemetryStats warning:', statErr.message));
    }

    return summary;
  },

  /**
   * Helper to update live service health & metrics in services table.
   */
  async _updateServiceFromMetric(canonicalEv) {
    try {
      const serviceId = canonicalEv.serviceId;
      const metricName = canonicalEv.metric || canonicalEv.metricName;
      const value = Number(canonicalEv.value);

      if (!serviceId || isNaN(value)) return;

      const existingService = await servicesRepo.findServiceById(serviceId);
      if (!existingService) return;

      const updates = {};
      if (metricName === 'cpu_utilization' || metricName === 'cpu_percent') {
        updates.cpuPercent = value;
      } else if (metricName === 'memory_utilization' || metricName === 'memory_percent') {
        updates.memoryPercent = value;
      } else if (metricName === 'latency_p99' || metricName === 'response_time') {
        updates.latencyP99 = value;
      } else if (metricName === 'error_rate' || metricName === 'http_error_rate') {
        updates.errorRate = value;
        if (value > 2) updates.status = 'critical';
        else if (value > 1) updates.status = 'degraded';
        else updates.status = 'nominal';
      }

      if (Object.keys(updates).length > 0) {
        await servicesRepo.updateServiceRecord(serviceId, updates);
      }
    } catch (err) {
      console.warn('[TelemetryPipeline] _updateServiceFromMetric warning:', err.message);
    }
  },

  /**
   * Calculates telemetry freshness and staleness for an integration.
   */
  async getTelemetryFreshness(integrationId, tenantId = 'default_tenant') {
    const stats = await integrationRepository.getTelemetryStats(integrationId, tenantId);
    if (!stats || !stats.last_ingested_at) {
      return {
        integrationId,
        status: 'OFFLINE',
        freshnessSeconds: null,
        isStale: true,
        lastIngestedAt: null,
        label: 'No telemetry received'
      };
    }

    const lastIngestedTime = new Date(stats.last_ingested_at).getTime();
    const freshnessSeconds = Math.max(0, Math.round((Date.now() - lastIngestedTime) / 1000));

    let status = 'FRESH';
    let label = 'Live (< 2m ago)';

    if (freshnessSeconds >= 600) {
      status = 'STALE';
      label = `Stale (${Math.round(freshnessSeconds / 60)}m ago)`;
    } else if (freshnessSeconds >= 120) {
      status = 'AGING';
      label = `Aging (${Math.round(freshnessSeconds / 60)}m ago)`;
    }

    return {
      integrationId,
      status,
      freshnessSeconds,
      isStale: status === 'STALE',
      lastIngestedAt: stats.last_ingested_at,
      label,
      stats
    };
  },

  /**
   * Ingests discovered live infrastructure resources into cloud_resources and triggers drift checks.
   */
  async syncInfrastructureInventory({
    integration,
    discoveredResources = [],
    telemetryMetrics = [],
    tenantId = 'default_tenant',
    organizationId = 'default_org',
    environment = 'staging'
  }) {
    if(!tenantContext())return withTenant(tenantId,()=>this.syncInfrastructureInventory({integration,discoveredResources,telemetryMetrics,tenantId,organizationId,environment}));
    const upserted = [];

    // 1. Upsert resources into cloud_resources
    for (const res of discoveredResources) {
      try {
        const record = await cloudLifecycleRepository.upsertResource({
          id: res.id,
          name: res.name || res.id,
          provider: res.provider || integration.provider,
          resource_type: res.resource_type || 'generic',
          region: res.region || integration.config?.region || 'ap-south-1',
          environment: res.environment || environment,
          current_state: res.current_state || 'running',
          estimated_hourly_cost: res.estimated_hourly_cost || 0.0,
          cost_breakdown: res.cost_breakdown || {},
          dependencies: res.dependencies || [],
          persistence_requirements: res.persistence_requirements || {},
          is_critical_dependency: res.is_critical_dependency || false,
          metadata: {
            ...res.metadata,
            discovered_at: new Date().toISOString(),
            integration_id: integration.id,
            tenant_id: tenantId,
            organization_id: organizationId
          },
          last_lifecycle_operation: 'DISCOVERY_SYNC',
          last_health_check_status: res.current_state === 'running' || res.current_state === 'in-use' ? 'healthy' : 'degraded'
        });
        upserted.push(record);

        // Also connect infrastructure resource to service identity if metadata is present
        if (res.metadata?.compose_service || res.metadata?.serviceMapping || res.metadata?.tags?.Service) {
          const serviceId = serviceMappingService.resolveServiceIdentity({
            composeService: res.metadata?.compose_service,
            k8sLabels: { service: res.metadata?.serviceMapping },
            awsTags: res.metadata?.tags || {},
            resourceId: res.id
          });
          // Infer infrastructure dependency (service depends on infrastructure resource)
          await serviceMappingService.recordDependencyRelationship({
            tenantId,
            environment,
            sourceServiceId: serviceId,
            targetServiceId: res.id,
            relationshipType: 'hosted_on',
            detectionSource: 'cloud_resource',
            confidence: 0.85,
            metadata: { resourceType: res.resource_type, provider: res.provider }
          });
        }
      } catch (err) {
        console.warn(`[TelemetryPipeline] Upsert error for resource ${res.id}:`, err.message);
        throw err;
      }
    }

    // 2. Ingest associated telemetry metrics if present
    if (telemetryMetrics.length > 0) {
      await this.normalizeAndRouteTelemetry({
        integrationId: integration.id,
        tenantId,
        organizationId,
        environment,
        provider: integration.provider,
        telemetryType: 'metric',
        events: telemetryMetrics
      });
    }

    // 3. Trigger Drift Detection for the environment
    let detectedDrifts = [];
    try {
      detectedDrifts = await driftDetectionService.detectDriftForEnvironment({
        environment,
        tenantId,
        organizationId
      });
    } catch (driftErr) {
      console.warn('[TelemetryPipeline] Drift detection notice:', driftErr.message);
    }

    // 4. Update integration last sync timestamps
    await integrationRepository.update(integration.id, {
      lastSyncAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      status: 'CONNECTED',
      errorMessage: null
    }, tenantId);

    // 5. Update stats
    await integrationRepository.recordTelemetryStats({
      integrationId: integration.id,
      tenantId,
      provider: integration.provider,
      environment,
      metricsReceived: telemetryMetrics.length,
      tracesReceived: 0,
      logsReceived: 0,
      bytesReceived: JSON.stringify(discoveredResources).length,
      eventsCount: discoveredResources.length,
      errorsEncountered: 0
    });

    return {
      success: true,
      resourcesDiscovered: discoveredResources.length,
      resourcesUpserted: upserted.length,
      driftsIdentified: detectedDrifts.length,
      resources: upserted
    };
  }
};
