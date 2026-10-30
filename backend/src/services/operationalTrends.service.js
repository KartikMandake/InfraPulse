/**
 * Operational Trends Service — InfraPulse Phase 18
 *
 * Computes historical reliability trends, recurrence rates, MTTR evolution,
 * and failure category distributions over rolling time windows (7d, 30d, 90d).
 *
 * Strict Sample-Size Transparency:
 * - Always reports sample_size.
 * - When sample_size < 3, labels confidence as 'low' with explicit disclosure of insufficient historical data.
 */

import crypto from 'node:crypto';
import { query } from '../db/connection.js';
import { operationalIntelligenceRepository } from '../repositories/operationalIntelligence.repository.js';

export const operationalTrendsService = {
  /**
   * Computes operational trends over the specified window in days (default 30d).
   */
  async computeTrends({ days = 30, tenantId = 'default_tenant' } = {}) {
    const windowEnd = new Date();
    const windowStart = new Date(Date.now() - days * 86400000);

    // 1. Fetch incidents in window
    const incRes = await query(
      `SELECT * FROM incidents
       WHERE created_at >= $1 AND created_at <= $2
       ORDER BY created_at ASC`,
      [windowStart.toISOString(), windowEnd.toISOString()]
    );
    const incidents = incRes.rows;

    // 2. Fetch regressions in window
    const regRes = await query(
      `SELECT * FROM deployment_regressions
       WHERE detected_at >= $1 AND detected_at <= $2
       ORDER BY detected_at ASC`,
      [windowStart.toISOString(), windowEnd.toISOString()]
    );
    const regressions = regRes.rows;

    // 3. Fetch recurring patterns
    const patterns = await operationalIntelligenceRepository.getPatterns({ tenantId });

    // 4. Fetch latest service risk profiles
    const riskProfiles = await operationalIntelligenceRepository.getLatestRiskProfiles(tenantId);

    // Calculate metrics
    const sampleSize = incidents.length;
    const isSufficientSample = sampleSize >= 3;
    const confidence = sampleSize >= 6 ? 'high' : sampleSize >= 3 ? 'medium' : 'low';

    // MTTR across resolved incidents in window
    let totalResolvedMinutes = 0;
    let resolvedCount = 0;
    for (const inc of incidents) {
      if (inc.resolved_at) {
        const start = new Date(inc.created_at).getTime();
        const end = new Date(inc.resolved_at).getTime();
        if (end > start) {
          totalResolvedMinutes += (end - start) / (1000 * 60);
          resolvedCount++;
        }
      }
    }
    const averageMttrMinutes = resolvedCount > 0
      ? Math.round((totalResolvedMinutes / resolvedCount) * 10) / 10
      : 0;

    // Recurrence Rate (% of incidents associated with services experiencing > 1 incident or recurring pattern)
    const serviceIncCounts = {};
    for (const inc of incidents) {
      const sId = inc.service_id || 'unknown';
      serviceIncCounts[sId] = (serviceIncCounts[sId] || 0) + 1;
    }
    let recurringIncCount = 0;
    for (const inc of incidents) {
      const sId = inc.service_id || 'unknown';
      if (serviceIncCounts[sId] > 1) {
        recurringIncCount++;
      }
    }
    const incidentRecurrenceRatePercent = sampleSize > 0
      ? Math.round((recurringIncCount / sampleSize) * 100)
      : 0;

    // Category Breakdown
    const categoryBreakdown = {};
    for (const p of patterns) {
      categoryBreakdown[p.category] = (categoryBreakdown[p.category] || 0) + p.occurrenceCount;
    }

    const metrics = {
      windowDays: days,
      incidentCount: sampleSize,
      resolvedIncidentCount: resolvedCount,
      averageMttrMinutes,
      regressionCount: regressions.length,
      activePatternsCount: patterns.length,
      incidentRecurrenceRatePercent,
      isSufficientSample,
      sampleSizeNote: isSufficientSample
        ? `Analyzed ${sampleSize} historical incidents within ${days}-day window.`
        : `Limited sample size (${sampleSize} incidents in ${days}d). Metric confidence is marked low.`
    };

    const serviceRiskRankings = riskProfiles.slice(0, 5).map(p => ({
      serviceId: p.serviceId,
      serviceName: p.serviceName,
      riskScore: p.riskScore,
      riskCategory: p.riskCategory,
      trendDirection: p.trendDirection
    }));

    return {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      sampleSize,
      confidence,
      metrics,
      categoryBreakdown,
      serviceRiskRankings
    };
  },

  /**
   * Captures and stores an immutable snapshot of current operational trends.
   */
  async captureSnapshot({ days = 30, tenantId = 'default_tenant' } = {}) {
    const trendData = await this.computeTrends({ days, tenantId });
    const snapshotId = `snap-${crypto.randomBytes(6).toString('hex')}`;

    return operationalIntelligenceRepository.saveTrendSnapshot({
      id: snapshotId,
      windowStart: trendData.windowStart,
      windowEnd: trendData.windowEnd,
      sampleSize: trendData.sampleSize,
      metrics: trendData.metrics,
      categoryBreakdown: trendData.categoryBreakdown,
      serviceRiskRankings: trendData.serviceRiskRankings
    }, tenantId);
  },

  async getRecentSnapshots(limit = 10, tenantId = 'default_tenant') {
    return operationalIntelligenceRepository.getLatestTrendSnapshots(limit, tenantId);
  }
};

