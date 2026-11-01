/**
 * Infrastructure Health Intelligence Service — InfraPulse Phase 23K
 * 
 * Computes unified, evidence-backed infrastructure health across:
 * - CPU, Memory, Disk, Network utilization
 * - Container health & Kubernetes workload readiness
 * - AWS EC2 and RDS resource states
 * - Application latency, error rates, and service availability
 * - Runtime dependency topology & incident frequency
 * - Infrastructure drift & telemetry freshness
 * 
 * Strict Reliability Guarantee:
 * - Never assumes missing telemetry equals healthy infrastructure.
 * - Explicitly distinguishes UNAVAILABLE, STALE, and FRESH data.
 * - Produces transparent confidence ratings and verifiable supporting evidence.
 */

import { cloudLifecycleRepository } from '../../repositories/cloudLifecycle.repository.js';
import * as servicesRepo from '../../repositories/services.repository.js';
import * as incidentsRepo from '../../repositories/incidents.repository.js';
import { driftGovernanceRepository } from '../../repositories/driftGovernance.repository.js';
import { sreIntelligenceRepository } from '../../repositories/sreIntelligence.repository.js';
import { query } from '../../db/connection.js';
import {tenantContext,withTenant} from '../../security/tenantContext.js';

const STALE_THRESHOLD_SECONDS = 300; // 5 minutes
const UNAVAILABLE_THRESHOLD_SECONDS = 86400; // 24 hours

export const infrastructureHealthService = {
  /**
   * Evaluates end-to-end infrastructure health.
   * Can accept optional telemetryOverrides for deterministic testing.
   */
  async evaluateHealth({
    tenantId = 'default_tenant',
    environment = 'staging',
    telemetryOverrides = null,
    persistSnapshot = true
  } = {}) {
    if(!tenantContext())return withTenant(tenantId,()=>this.evaluateHealth({tenantId,environment,telemetryOverrides,persistSnapshot}));
    const evaluatedAt = new Date();
    const evaluatedAtIso = evaluatedAt.toISOString();

    // 1. Gather all system state in parallel
    const [cloudResources, registeredServices, activeIncidents, activeDriftEvents, dbTelemetryEvents] = await Promise.all([
      cloudLifecycleRepository.getAllResources().catch(() => []),
      servicesRepo.findAllServices().catch(() => []),
      incidentsRepo.findAllIncidents({ status: 'open' }).catch(() => []),
      driftGovernanceRepository.listDriftEvents({ tenantId, environment, status: 'OPEN' }).catch(() => []),
      query(`SELECT id,service_id AS "serviceId",event_timestamp AS timestamp,normalized_attributes AS metrics FROM normalized_events WHERE tenant_id=$1 AND environment=$2 AND telemetry_mode='live' ORDER BY event_timestamp DESC LIMIT 1000`,[tenantId,environment]).then(r=>r.rows)
    ]);

    // Use overrides if provided (for deterministic testing), otherwise DB/repo data
    const telemetryEvents = telemetryOverrides?.events || dbTelemetryEvents;
    const resources = telemetryOverrides?.resources || cloudResources;
    const services = telemetryOverrides?.services || registeredServices;
    const incidents = telemetryOverrides?.incidents || activeIncidents;
    const driftEvents = telemetryOverrides?.driftEvents || activeDriftEvents;

    // 2. Evaluate Telemetry Freshness
    let mostRecentTimestamp = null;
    for (const evt of telemetryEvents) {
      const ts = new Date(evt.eventTimestamp || evt.timestamp || evt.last_ingested_at).getTime();
      if (!isNaN(ts) && (!mostRecentTimestamp || ts > mostRecentTimestamp)) {
        mostRecentTimestamp = ts;
      }
    }

    let globalTelemetryStatus = 'FRESH';
    let globalFreshnessSeconds = 0;
    let globalConfidence = 'HIGH';

    if (!mostRecentTimestamp) {
      globalTelemetryStatus = 'UNAVAILABLE';
      globalFreshnessSeconds = Infinity;
      globalConfidence = 'LOW';
    } else {
      globalFreshnessSeconds = Math.max(0, Math.floor((evaluatedAt.getTime() - mostRecentTimestamp) / 1000));
      if (globalFreshnessSeconds > UNAVAILABLE_THRESHOLD_SECONDS) {globalTelemetryStatus='UNAVAILABLE';globalConfidence='LOW';}
      else if (globalFreshnessSeconds > STALE_THRESHOLD_SECONDS) {
        globalTelemetryStatus = 'STALE';
        globalConfidence = 'MEDIUM';
      }
    }

    // 3. Evaluate Resource Health
    const resourcesHealth = [];
    const riskIndicators = [];
    const supportingEvidence = [];

    let totalResourceScore = 0;
    let validResourceCount = 0;

    for (const res of resources) {
      const resourceTelemetry = (telemetryOverrides?.resourceMetrics?.[res.id]) ||
        telemetryEvents.filter(e => e.resourceId === res.id || e.payload?.resourceId === res.id);

      let resHealthScore = 100;
      let resStatus = 'HEALTHY';
      let resTelemetryStatus = 'FRESH';
      let resConfidence = 'HIGH';
      const resDeductions = [];

      // Check telemetry availability
      if (!resourceTelemetry || (Array.isArray(resourceTelemetry) && resourceTelemetry.length === 0 && !res.metrics)) {
        resTelemetryStatus = 'UNAVAILABLE';
        resConfidence = 'LOW';
        resStatus = 'UNKNOWN';
        resHealthScore = 40; // Penalty: Missing telemetry cannot be assumed healthy
        resDeductions.push('No telemetry ingested for resource. Health cannot be confirmed.');
        riskIndicators.push({
          type: 'MISSING_TELEMETRY',
          resourceId: res.id,
          severity: 'WARNING',
          message: `Resource "${res.id}" (${res.provider}) has no recent telemetry.`
        });
      } else {
        // Evaluate metrics
        const metrics = res.metrics || (resourceTelemetry[0]?.metrics || resourceTelemetry[0]?.payload || {});
        const lastSeen = res.lastReportedAt || resourceTelemetry[0]?.timestamp || resourceTelemetry[0]?.created_at;
        const freshnessSec = lastSeen ? Math.max(0, Math.floor((evaluatedAt.getTime() - new Date(lastSeen).getTime()) / 1000)) : 9999;

        if (freshnessSec > STALE_THRESHOLD_SECONDS) {
          resTelemetryStatus = 'STALE';
          resConfidence = 'MEDIUM';
          resHealthScore -= 20;
          resDeductions.push(`Telemetry is stale (${freshnessSec}s old).`);
        }

        // CPU
        const cpu = Number(metrics.cpuPercent || metrics.cpuUtilization || metrics.cpu || 0);
        if (cpu > 90) {
          resHealthScore -= 35;
          resDeductions.push(`Critical CPU saturation: ${cpu.toFixed(1)}%`);
          riskIndicators.push({ type: 'CPU_SATURATION', resourceId: res.id, severity: 'HIGH', message: `CPU utilization is at ${cpu.toFixed(1)}%` });
        } else if (cpu > 75) {
          resHealthScore -= 15;
          resDeductions.push(`Elevated CPU: ${cpu.toFixed(1)}%`);
        }

        // Memory
        const memory = Number(metrics.memoryPercent || metrics.memoryUtilization || metrics.memory || 0);
        if (memory > 90) {
          resHealthScore -= 35;
          resDeductions.push(`Critical Memory saturation: ${memory.toFixed(1)}%`);
          riskIndicators.push({ type: 'MEMORY_SATURATION', resourceId: res.id, severity: 'HIGH', message: `Memory utilization is at ${memory.toFixed(1)}%` });
        } else if (memory > 80) {
          resHealthScore -= 15;
          resDeductions.push(`Elevated Memory: ${memory.toFixed(1)}%`);
        }

        // Disk
        const disk = Number(metrics.diskPercent || metrics.diskUtilization || metrics.disk || 0);
        if (disk > 90) {
          resHealthScore -= 30;
          resDeductions.push(`Critical Disk utilization: ${disk.toFixed(1)}%`);
          riskIndicators.push({ type: 'DISK_EXHAUSTION', resourceId: res.id, severity: 'CRITICAL', message: `Disk usage reached ${disk.toFixed(1)}%` });
        }

        // Provider specific status checks
        if (res.provider === 'docker' || res.resourceType === 'container') {
          if (res.state === 'exited' || res.state === 'crashed' || metrics.status === 'exited') {
            resHealthScore -= 50;
            resDeductions.push('Container exited abnormally or crashed');
          }
          if (Number(metrics.restartCount || res.restartCount || 0) > 3) {
            resHealthScore -= 25;
            resDeductions.push(`High container restart loop count: ${metrics.restartCount || res.restartCount}`);
          }
        }

        if (res.provider === 'kubernetes' || res.resourceType === 'deployment') {
          const desired = Number(res.desiredReplicas || metrics.replicasDesired || 1);
          const ready = Number(res.readyReplicas || metrics.replicasReady || 0);
          if (ready < desired) {
            resHealthScore -= Math.min(50, Math.round(((desired - ready) / desired) * 50));
            resDeductions.push(`Kubernetes workload degraded: ${ready}/${desired} replicas ready`);
          }
        }

        if (res.provider === 'aws' && res.state === 'stopped') {
          // Stopped EC2 instances are offline
          resHealthScore -= 40;
          resDeductions.push('AWS EC2 instance is stopped');
        }
      }

      // Check active drift for resource
      const hasDrift = driftEvents.some(d => d.resource_id === res.id || d.resourceId === res.id);
      if (hasDrift) {
        resHealthScore -= 15;
        resDeductions.push('Active un-reconciled infrastructure drift detected');
        riskIndicators.push({ type: 'INFRASTRUCTURE_DRIFT', resourceId: res.id, severity: 'MEDIUM', message: `Resource "${res.id}" has active drift.` });
      }

      resHealthScore = Math.max(0, Math.min(100, resHealthScore));
      if (resTelemetryStatus === 'UNAVAILABLE') resStatus = 'UNKNOWN';
      else if (resHealthScore < 40) resStatus = 'CRITICAL';
      else if (resHealthScore < 70) resStatus = 'DEGRADED';
      else resStatus = 'HEALTHY';

      resourcesHealth.push({
        resourceId: res.id,
        name: res.name || res.id,
        provider: res.provider || 'unknown',
        resourceType: res.resourceType || res.type || 'compute',
        healthScore: resHealthScore,
        status: resStatus,
        telemetryStatus: resTelemetryStatus,
        confidence: resConfidence,
        deductions: resDeductions
      });

      totalResourceScore += resHealthScore;
      validResourceCount++;
    }

    // 4. Evaluate Services Health
    const servicesHealth = [];
    let totalServiceScore = 0;

    for (const svc of services) {
      let svcHealthScore = 100;
      let svcStatus = 'HEALTHY';
      let svcTelemetryStatus = 'FRESH';
      let svcConfidence = 'HIGH';
      const svcDeductions = [];

      // Associated telemetry
      const svcTelemetry = telemetryEvents.filter(e => e.serviceId === svc.id || e.service === svc.id || e.payload?.serviceId === svc.id);
      const svcIncidents = incidents.filter(i => (i.service_id || i.serviceId) === svc.id);

      if (svcTelemetry.length === 0 && !telemetryOverrides?.serviceMetrics?.[svc.id]) {
        svcTelemetryStatus = 'UNAVAILABLE';
        svcConfidence = 'LOW';
        svcStatus = 'UNKNOWN';
        svcHealthScore = 50;
        svcDeductions.push('No telemetry ingested for service in evaluation window.');
      } else {
        const latestMetrics=Object.fromEntries([...svcTelemetry].reverse().filter(e=>e.metrics?.metric).map(e=>[e.metrics.metric,e.metrics.currentValue]));
        const metrics = telemetryOverrides?.serviceMetrics?.[svc.id] || {
          ...(svcTelemetry[0]?.metrics||svcTelemetry[0]?.payload||{}),
          latencyMs:latestMetrics.latency_p99??svc.latencyP99,
          errorRatePercent:latestMetrics.error_rate??svc.errorRate
        };
        const latencyP95 = Number(metrics.latencyP95 || metrics.latencyMs || 0);
        const errorRate = Number(metrics.errorRatePercent || metrics.errorRate || 0);

        if (latencyP95 > 2000) {
          svcHealthScore -= 30;
          svcDeductions.push(`Critical p95 latency: ${latencyP95}ms`);
        } else if (latencyP95 > 500) {
          svcHealthScore -= 15;
          svcDeductions.push(`Elevated p95 latency: ${latencyP95}ms`);
        }

        if (errorRate > 5.0) {
          svcHealthScore -= 40;
          svcDeductions.push(`High error rate: ${errorRate.toFixed(2)}%`);
        } else if (errorRate > 1.0) {
          svcHealthScore -= 15;
          svcDeductions.push(`Elevated error rate: ${errorRate.toFixed(2)}%`);
        }
      }

      if(svcTelemetry.length){const age=(evaluatedAt.getTime()-new Date(svcTelemetry[0].timestamp||svcTelemetry[0].eventTimestamp).getTime())/1000;if(!Number.isFinite(age)||age>UNAVAILABLE_THRESHOLD_SECONDS){svcTelemetryStatus='UNAVAILABLE';svcConfidence='LOW';}else if(age>STALE_THRESHOLD_SECONDS){svcTelemetryStatus='STALE';svcConfidence='MEDIUM';}}
      // Incidents impact
      if (svcIncidents.length > 0) {
        const criticalCount = svcIncidents.filter(i => i.severity === 'critical' || i.severity === 'P0').length;
        if (criticalCount > 0) {
          svcHealthScore -= 45;
          svcDeductions.push(`${criticalCount} active critical incident(s) firing`);
        } else {
          svcHealthScore -= 20;
          svcDeductions.push(`${svcIncidents.length} active incident(s) firing`);
        }
      }

      svcHealthScore = Math.max(0, Math.min(100, svcHealthScore));
      if (svcTelemetryStatus === 'UNAVAILABLE') svcStatus = 'UNKNOWN';
      else if (svcHealthScore < 40) svcStatus = 'CRITICAL';
      else if (svcHealthScore < 70) svcStatus = 'DEGRADED';
      else svcStatus = 'HEALTHY';

      servicesHealth.push({
        serviceId: svc.id,
        serviceName: svc.name || svc.id,
        healthScore: svcHealthScore,
        status: svcStatus,
        telemetryStatus: svcTelemetryStatus,
        confidence: svcConfidence,
        activeIncidentsCount: svcIncidents.length,
        deductions: svcDeductions
      });

      totalServiceScore += svcHealthScore;
    }

    // 5. Calculate Overall Health Score
    let overallScore = 100;
    if (validResourceCount > 0 || services.length > 0) {
      const avgRes = validResourceCount > 0 ? (totalResourceScore / validResourceCount) : 100;
      const avgSvc = services.length > 0 ? (totalServiceScore / services.length) : 100;
      // Weighted 60% services, 40% underlying infrastructure
      overallScore = Math.round((avgSvc * 0.6) + (avgRes * 0.4));
    }

    const entities=[...resourcesHealth,...servicesHealth];
    const missing=entities.filter(e=>e.telemetryStatus==='UNAVAILABLE').length;
    if(entities.length&&missing===entities.length){globalTelemetryStatus='UNAVAILABLE';globalConfidence='LOW';}
    else if(missing){globalConfidence='LOW';}
    // Telemetry gap penalty on global score if no data at all
    if (globalTelemetryStatus === 'UNAVAILABLE') {
      overallScore = Math.min(overallScore, 45);
      supportingEvidence.push({
        type: 'TELEMETRY_GAP',
        note: 'Zero recent telemetry ingested. Overall health cannot be validated as nominal.'
      });
    }

    let overallHealthStatus = 'HEALTHY';
    if (globalTelemetryStatus === 'UNAVAILABLE') overallHealthStatus = 'UNKNOWN';
    else if (overallScore < 40) overallHealthStatus = 'CRITICAL';
    else if (overallScore < 70) overallHealthStatus = 'DEGRADED';

    // Supporting evidence items
    supportingEvidence.push({
      totalResourcesEvaluated: resources.length,
      totalServicesEvaluated: services.length,
      activeIncidentsCount: incidents.length,
      activeDriftCount: driftEvents.length,
      telemetryFreshnessSeconds: globalFreshnessSeconds === Infinity ? null : globalFreshnessSeconds
    });

    const snapshot = {
      tenantId,
      environment,
      overallScore,
      healthStatus: overallHealthStatus,
      telemetryStatus: globalTelemetryStatus,
      confidenceLevel: globalConfidence,
      dataFreshnessSeconds: globalFreshnessSeconds === Infinity ? null : globalFreshnessSeconds,
      servicesHealth,
      resourcesHealth,
      riskIndicators,
      supportingEvidence,
      evaluatedAt: evaluatedAtIso
    };

    if (persistSnapshot) {
      await sreIntelligenceRepository.saveHealthSnapshot(snapshot).catch(err => {
        console.warn('[InfrastructureHealth] Failed to persist snapshot:', err.message);
      });
    }

    return snapshot;
  }
};
