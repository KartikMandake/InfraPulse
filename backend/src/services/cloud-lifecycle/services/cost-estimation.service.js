// ==============================================================================
// InfraPulse - Cloud Cost Estimation & Governance Service
// Computes hourly, daily, and monthly projections with idle compute savings analysis
// ==============================================================================

import crypto from 'crypto';
import { cloudLifecycleRepository } from '../../../repositories/cloudLifecycle.repository.js';

export const costEstimationService = {
  /**
   * Calculates comprehensive cost breakdowns across all inventoried resources.
   *
   * @param {string} [environment='staging']
   * @returns {Promise<Object>} Cost projections and estimated savings
   */
  async calculateCostProjections(environment = 'staging') {
    const resources = await cloudLifecycleRepository.getAllResources({ environment });

    let totalHourlyCompute = 0.0;
    let totalHourlyStorage = 0.0;
    let totalHourlyIpv4 = 0.0;
    let totalHourlyNetworking = 0.0;
    let totalHourlyManaged = 0.0;

    let stoppedHourlyCompute = 0.0;
    let activeHourlyCompute = 0.0;

    for (const r of resources) {
      const breakdown = r.cost_breakdown || {};
      const compute = parseFloat(breakdown.compute || 0);
      const storage = parseFloat(breakdown.storage || 0);
      const ipv4 = parseFloat(breakdown.ipv4 || 0);
      const networking = parseFloat(breakdown.networking || 0);
      const managed = parseFloat(breakdown.managed || 0);

      totalHourlyCompute += compute;
      totalHourlyStorage += storage;
      totalHourlyIpv4 += ipv4;
      totalHourlyNetworking += networking;
      totalHourlyManaged += managed;

      if (r.current_state === 'stopped' || r.current_state === 'scaled_down') {
        stoppedHourlyCompute += compute;
      } else {
        activeHourlyCompute += compute;
      }
    }

    const currentTotalHourly = totalHourlyCompute + totalHourlyStorage + totalHourlyIpv4 + totalHourlyNetworking + totalHourlyManaged;
    const estimatedDailyTotal = currentTotalHourly * 24;
    const estimatedMonthlyTotal = currentTotalHourly * 730; // 730 standard hours in a month

    // Savings Calculation:
    // If non-production compute is stopped overnight (12 hrs/day on 22 weekdays = 264h) + weekends (48 hrs * 4.3 wks = 206h) = ~470 hours saved per month out of 730 (~64.3% savings on compute)
    const monthlyComputeHoursSaved = 470;
    const potentialMonthlyComputeSavings = activeHourlyCompute * monthlyComputeHoursSaved;

    // Ongoing storage and fixed networking cost that remains even if ALL compute is stopped
    const ongoingMonthlyFixedCost = (totalHourlyStorage + totalHourlyIpv4 + totalHourlyManaged) * 730;

    const estimateData = {
      id: `est_${crypto.randomBytes(6).toString('hex')}`,
      environment,
      total_hourly_compute: parseFloat(totalHourlyCompute.toFixed(4)),
      total_hourly_storage: parseFloat(totalHourlyStorage.toFixed(4)),
      total_hourly_ipv4: parseFloat(totalHourlyIpv4.toFixed(4)),
      total_hourly_networking: parseFloat(totalHourlyNetworking.toFixed(4)),
      total_hourly_managed: parseFloat(totalHourlyManaged.toFixed(4)),
      current_hourly_total: parseFloat(currentTotalHourly.toFixed(4)),
      estimated_daily_total: parseFloat(estimatedDailyTotal.toFixed(2)),
      estimated_monthly_total: parseFloat(estimatedMonthlyTotal.toFixed(2)),
      estimated_monthly_savings: parseFloat(potentialMonthlyComputeSavings.toFixed(2)),
      ongoing_monthly_storage_cost: parseFloat(ongoingMonthlyFixedCost.toFixed(2)),
      currency: 'USD',
      is_simulated: true,
      disclaimer: 'Cost estimates are simulated projections based on AWS ap-south-1 published rates and Docker/K8s allocations. Not an official AWS invoice.'
    };

    // Save to historical table
    await cloudLifecycleRepository.saveCostEstimate(estimateData);

    return estimateData;
  }
};

