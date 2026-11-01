/**
 * Capacity & Cost Optimization Intelligence Service — InfraPulse Phase 23K
 * 
 * Analyzes infrastructure utilization, resource over-allocation, and idle costs:
 * - Underutilized compute (CPU & Memory < 15%)
 * - Over-provisioned instance classes
 * - Idle / stopped resources still incurring EBS persistent storage fees
 * - Unattached Elastic IPs and orphan volumes
 * - Kubernetes request vs actual usage mismatches
 * 
 * Strict Governance & Safety Mandates:
 * - NEVER automatically resize, stop, scale down, or delete infrastructure.
 * - Recommends governed, approval-controlled remediation actions through Phase 23J.
 * - Discloses transparent utilization and pricing calculations.
 */

import { cloudLifecycleRepository } from '../../repositories/cloudLifecycle.repository.js';
import { sreIntelligenceRepository } from '../../repositories/sreIntelligence.repository.js';

export const capacityOptimizationService = {
  /**
   * Analyzes all cloud resources and returns capacity & cost optimization opportunities.
   */
  async analyzeCapacityAndCost({
    tenantId = 'default_tenant',
    environment = 'staging',
    resourceOverrides = null,
    persist = true
  } = {}) {
    const resources = resourceOverrides || (await cloudLifecycleRepository.getAllResources({ environment }).catch(() => []));

    const insights = [];
    let totalMonthlyWasteUsd = 0;
    let underutilizedComputeCount = 0;
    let idleResourcesCount = 0;

    for (const r of resources) {
      const breakdown = r.cost_breakdown || {};
      const computeHourly = parseFloat(breakdown.compute || 0);
      const storageHourly = parseFloat(breakdown.storage || 0);
      const ipv4Hourly = parseFloat(breakdown.ipv4 || 0);
      const currentState = r.current_state || r.state || 'running';
      const metrics = r.metrics || r.metadata?.metrics || r.metadata || {};

      const cpuUsage = Number(metrics.cpuPercent ?? metrics.cpu_percent ?? metrics.cpuUtilization ?? metrics.cpu ?? 50);
      const memUsage = Number(metrics.memoryPercent ?? metrics.memory_percent ?? metrics.memoryUtilization ?? metrics.memory ?? 50);

      // --- 1. Idle Stopped Compute Incurring Storage / IP Fees ---
      if (currentState === 'stopped' && (storageHourly > 0 || ipv4Hourly > 0)) {
        idleResourcesCount++;
        const monthlyIdleStorageWaste = Number(((storageHourly + ipv4Hourly) * 730).toFixed(2));
        totalMonthlyWasteUsd += monthlyIdleStorageWaste;

        insights.push({
          tenantId,
          environment,
          resourceId: r.id,
          serviceId: r.serviceId || null,
          provider: r.provider || 'aws',
          resourceType: r.resource_type || r.resourceType || 'compute_instance',
          currentAllocation: { state: 'stopped', attachedStorageHourly: storageHourly, ipv4Hourly },
          actualUtilization: { cpuPercent: 0, memoryPercent: 0 },
          underutilizationPercent: 100.0,
          estimatedMonthlyWasteUsd: monthlyIdleStorageWaste,
          optimizationCategory: 'IDLE_RESOURCE',
          recommendedGovernedAction: 'REVIEW_ORPHAN_STORAGE_AND_EIP',
          confidence: 'HIGH',
          justification: `Instance "${r.id}" is stopped but persistently accumulates $${monthlyIdleStorageWaste}/mo in storage and unassociated IP reservations.`
        });
      }

      // --- 2. Underutilized Compute Instances ---
      if (currentState === 'running' && computeHourly > 0 && cpuUsage < 15.0 && memUsage < 20.0) {
        underutilizedComputeCount++;
        // Downsizing would save ~50% of the compute cost
        const monthlyWaste = Number(((computeHourly * 0.5) * 730).toFixed(2));
        totalMonthlyWasteUsd += monthlyWaste;

        insights.push({
          tenantId,
          environment,
          resourceId: r.id,
          serviceId: r.serviceId || null,
          provider: r.provider || 'aws',
          resourceType: r.resource_type || r.resourceType || 'compute_instance',
          currentAllocation: { computeHourly, instanceType: r.instance_type || r.instanceType || 't3.medium' },
          actualUtilization: { cpuPercent: cpuUsage, memoryPercent: memUsage },
          underutilizationPercent: Number(((100 - ((cpuUsage + memUsage) / 2))).toFixed(1)),
          estimatedMonthlyWasteUsd: monthlyWaste,
          optimizationCategory: 'OVER_PROVISIONED_COMPUTE',
          recommendedGovernedAction: 'DOCKER_CONTAINER_RESTART', // Governed action
          confidence: 'HIGH',
          justification: `Compute workload "${r.id}" averages ${cpuUsage.toFixed(1)}% CPU and ${memUsage.toFixed(1)}% memory. Downsizing or right-sizing saves ~$${monthlyWaste}/mo.`
        });
      }

      // --- 3. Kubernetes / Docker Over-Allocation ---
      if ((r.provider === 'kubernetes' || r.resource_type === 'container') && r.limits) {
        const memLimitMb = r.limits.memoryMb || 1024;
        const memUsedMb = metrics.memoryMb || (memLimitMb * (memUsage / 100));
        if (memUsedMb < memLimitMb * 0.25) { // Using less than 25% of memory limit
          insights.push({
            tenantId,
            environment,
            resourceId: r.id,
            serviceId: r.serviceId || null,
            provider: r.provider,
            resourceType: 'container',
            currentAllocation: { memoryLimitMb: memLimitMb },
            actualUtilization: { memoryUsedMb: Math.round(memUsedMb), usagePercent: Math.round((memUsedMb / memLimitMb) * 100) },
            underutilizationPercent: Number((100 - ((memUsedMb / memLimitMb) * 100)).toFixed(1)),
            estimatedMonthlyWasteUsd: 15.00, // Nominal container cluster footprint
            optimizationCategory: 'EXCESSIVE_K8S_LIMITS',
            recommendedGovernedAction: 'REVISE_K8S_LIMITS',
            confidence: 'MEDIUM',
            justification: `Workload "${r.id}" allocated ${memLimitMb}MB limit but consumes only ${Math.round(memUsedMb)}MB (${Math.round((memUsedMb / memLimitMb) * 100)}%). Recommend tuning pod request/limits.`
          });
        }
      }
    }

    // Persist insights
    const saved = [];
    if (persist) {
      for (const item of insights) {
        const ins = await sreIntelligenceRepository.saveCapacityInsight(item).catch(err => {
          console.warn('[CapacityOptimization] Failed to persist insight:', err.message);
          return item;
        });
        saved.push(ins);
      }
    }

    return {
      summary: {
        totalResourcesAnalyzed: resources.length,
        underutilizedComputeCount,
        idleResourcesCount,
        totalMonthlyWasteUsd: Number(totalMonthlyWasteUsd.toFixed(2)),
        currency: 'USD'
      },
      insights: saved.length > 0 ? saved : insights,
      analyzedAt: new Date().toISOString()
    };
  }
};

