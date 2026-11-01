/**
 * SRE SLO and Error Budget Management Service — InfraPulse Phase 23K
 * 
 * Provides unified SLO and Error Budget monitoring, real-time SLI calculation,
 * multi-window burn-rate tracking, and data-quality disclosures.
 * Reuses core logic from sloEngine.js and slo.repository.js.
 */

import * as sloRepo from '../../repositories/slo.repository.js';
import * as servicesRepo from '../../repositories/services.repository.js';
import {
  calculateSliValue,
  calculateErrorBudget,
  calculateBurnRate,
  detectBurnRateAlerts,
  SLI_TYPES,
  SLO_STATUSES,
  DATA_QUALITIES
} from '../../engine/sloEngine.js';

export const sloBudgetService = {
  /**
   * Retrieves high-level SRE SLO overview across all registered services.
   */
  async getSloOverview(filters = {}) {
    const slos = await sloRepo.findAllSlos(filters).catch(() => []);
    const services = await servicesRepo.findAllServices().catch(() => []);
    const serviceMap = new Map(services.map(s => [s.id, s.name]));

    let totalSlos = slos.length;
    let nominalCount = 0;
    let burnWarningCount = 0;
    let breachedCount = 0;
    let insufficientDataCount = 0;

    const evaluatedSlos = [];
    const atRiskServices = new Set();

    for (const slo of slos) {
      const latestEval = await sloRepo.findLatestEvaluationBySloId(slo.id).catch(() => null);
      const activeAlerts = await sloRepo.findActiveAlertEvents(slo.id).catch(() => []);

      let status = latestEval?.status || SLO_STATUSES.NOMINAL;
      let dataQuality = latestEval?.dataQuality || DATA_QUALITIES.GOOD;
      let remainingBudget = Number(latestEval?.remainingBudgetPercent ?? 100);
      let burnRate1h = Number(latestEval?.burnRate1h ?? 0);
      let sliValue = latestEval?.sliValue !== null && latestEval?.sliValue !== undefined ? Number(latestEval.sliValue) : null;

      // Status classification
      if (status === SLO_STATUSES.BREACHED || remainingBudget <= 0) {
        breachedCount++;
        atRiskServices.add(slo.serviceId);
      } else if (status === SLO_STATUSES.BURN_WARNING || remainingBudget <= 20 || burnRate1h >= 3.0) {
        burnWarningCount++;
        atRiskServices.add(slo.serviceId);
      } else if (status === SLO_STATUSES.INSUFFICIENT_DATA || status === SLO_STATUSES.ZERO_TRAFFIC) {
        insufficientDataCount++;
      } else {
        nominalCount++;
      }

      evaluatedSlos.push({
        id: slo.id,
        name: slo.name,
        serviceId: slo.serviceId,
        serviceName: serviceMap.get(slo.serviceId) || slo.serviceId,
        sliType: slo.sliType,
        targetPercent: Number(slo.targetPercent),
        currentSliValue: sliValue,
        remainingBudgetPercent: remainingBudget,
        budgetConsumedPercent: Number(latestEval?.budgetConsumedPercent ?? 0),
        burnRate1h,
        burnRate6h: Number(latestEval?.burnRate6h ?? 0),
        burnRate24h: Number(latestEval?.burnRate24h ?? 0),
        status,
        dataQuality,
        activeAlertsCount: activeAlerts.length,
        evaluatedAt: latestEval?.evaluatedAt || slo.updatedAt || new Date().toISOString()
      });
    }

    return {
      kpis: {
        totalSlos,
        nominalCount,
        burnWarningCount,
        breachedCount,
        insufficientDataCount,
        atRiskServicesCount: atRiskServices.size,
        overallCompliancePercent: totalSlos > 0 ? Math.round(((totalSlos - breachedCount) / totalSlos) * 100) : 100
      },
      slos: evaluatedSlos,
      atRiskServiceIds: Array.from(atRiskServices),
      evaluatedAt: new Date().toISOString()
    };
  },

  /**
   * Evaluates an SLI on the fly given raw event counts.
   */
  evaluateSli({ sliType, targetPercent, totalEvents = 0, goodEvents = 0, badEvents = 0, latencyMs = null, latencyThresholdMs = null }) {
    // Latency evaluation adjustment
    if (sliType === SLI_TYPES.LATENCY && latencyMs !== null && latencyThresholdMs !== null) {
      if (totalEvents === 0) totalEvents = 1;
      if (latencyMs <= latencyThresholdMs) {
        goodEvents = totalEvents;
        badEvents = 0;
      } else {
        goodEvents = 0;
        badEvents = totalEvents;
      }
    }

    const sli = calculateSliValue(sliType, { totalEvents, goodEvents, badEvents });
    const budget = calculateErrorBudget({ targetPercent, totalEvents, goodEvents, badEvents });
    const burnRate = calculateBurnRate({ totalEvents, badEvents, targetPercent });

    // Multi-window burn-rate alerts
    const alerts = detectBurnRateAlerts({
      slo: { id: 'temp-slo-eval' },
      evaluation: {
        totalEvents,
        burnRate1h: null,
        burnRate6h: null,
        remainingBudgetPercent: budget.remainingBudgetPercent
      },
      policy: { minEventsRequired: 1 }
    });

    return {
      sliValue: sli.sliValue,
      targetPercent: Number(targetPercent),
      errorBudgetPercent: budget.errorBudgetPercent,
      allowedBadEvents: budget.allowedBadEvents,
      remainingBadEvents: budget.remainingBadEvents,
      budgetConsumedPercent: budget.budgetConsumedPercent,
      remainingBudgetPercent: budget.remainingBudgetPercent,
      burnRateMultiplier: burnRate,
      status: budget.status,
      dataQuality: budget.dataQuality,
      alerts
    };
  }
};
