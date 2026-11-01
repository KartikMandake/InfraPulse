/**
 * Operational Intelligence Service — InfraPulse Phase 18
 *
 * Coordinates pattern detection, service risk evaluation, early-warning detection,
 * and unified analytics synthesis across the observability stack.
 */

import { query } from '../db/connection.js';
import { operationalIntelligenceRepository } from '../repositories/operationalIntelligence.repository.js';
import { detectRecurringPatterns } from '../engine/failurePatternEngine.js';
import { rankServicesByRisk } from '../engine/serviceRiskEngine.js';
import { detectEarlyWarnings } from '../engine/earlyWarningEngine.js';
import { initialServices } from '../data/services.js';
import {tenantContext} from '../security/tenantContext.js';
import { ApiError } from '../utils/ApiError.js';

export const operationalIntelligenceService = {
  /**
   * Retrieves high-level Operational Intelligence dashboard summary.
   */
  async getDashboardSummary(tenantId = 'default_tenant') {
    const patterns = await operationalIntelligenceRepository.getPatterns({ tenantId });
    const riskProfiles = await operationalIntelligenceRepository.getLatestRiskProfiles(tenantId);
    const recommendations = await operationalIntelligenceRepository.getRecommendations({ tenantId });
    const earlyWarnings = await operationalIntelligenceRepository.getEarlyWarnings({ tenantId });

    const openRecs = recommendations.filter(r => r.status === 'OPEN' || r.status === 'IN_PROGRESS' || r.status === 'ACKNOWLEDGED');
    const highRiskServices = riskProfiles.filter(p => p.riskCategory === 'high' || p.riskCategory === 'critical');
    const criticalEarlyWarnings = earlyWarnings.filter(w => w.severity === 'critical' || w.severity === 'high');

    // Calculate recurrence rate
    const totalOccurrences = patterns.reduce((sum, p) => sum + (p.occurrenceCount || 0), 0);
    const recurrenceRatePercent = patterns.length > 0
      ? Math.min(100, Math.round((patterns.filter(p => p.occurrenceCount >= 2).length / patterns.length) * 100))
      : 0;

    return {
      kpis: {
        totalRecurringPatterns: patterns.length,
        highRiskServicesCount: highRiskServices.length,
        openRecommendationsCount: openRecs.length,
        activeEarlyWarningsCount: earlyWarnings.length,
        criticalEarlyWarningsCount: criticalEarlyWarnings.length,
        recurrenceRatePercent
      },
      topRiskServices: riskProfiles.slice(0, 5),
      activeEarlyWarnings: earlyWarnings.slice(0, 10),
      recurringPatterns: patterns.slice(0, 8),
      actionableRecommendations: openRecs.slice(0, 6),
      evaluatedAt: new Date().toISOString()
    };
  },

  /**
   * Analyzes and syncs recurring failure patterns from database records.
   */
  async analyzeAndSyncPatterns(tenantId = 'default_tenant') {
    const incRes = await query('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 100');
    const regRes = await query('SELECT * FROM deployment_regressions ORDER BY detected_at DESC LIMIT 50');
    const sloRes = await query('SELECT * FROM slo_alert_events ORDER BY triggered_at DESC LIMIT 50');
    const svcRes = await query('SELECT * FROM services');

    const detected = detectRecurringPatterns({
      incidents: incRes.rows,
      regressions: regRes.rows,
      sloAlerts: sloRes.rows,
      services: svcRes.rows
    });

    const saved = [];
    for (const pat of detected) {
      const up = await operationalIntelligenceRepository.upsertPattern(pat, tenantId);
      saved.push(up);
    }

    return saved.length > 0 ? saved : operationalIntelligenceRepository.getPatterns({ tenantId });
  },

  /**
   * Evaluates service risk profiles and persists them.
   */
  async evaluateAndSyncServiceRiskProfiles(tenantId = 'default_tenant') {
    const svcRes = await query('SELECT * FROM services');
    const incRes = await query('SELECT * FROM incidents');
    const regRes = await query('SELECT * FROM deployment_regressions');
    const sloRes = await query('SELECT * FROM slos');
    const alertRes = await query('SELECT * FROM alerts WHERE status IN (\'firing\', \'acknowledged\')');

    const services = svcRes.rows.length > 0 ? svcRes.rows : tenantContext()?[]:initialServices;

    // Group telemetry by service
    const telemetryMap = {};
    for (const svc of services) {
      const sId = svc.id;
      telemetryMap[sId] = {
        incidents: incRes.rows.filter(i => (i.service_id || i.serviceId) === sId),
        regressions: regRes.rows.filter(r => (r.service_id || r.serviceId) === sId),
        slos: sloRes.rows.filter(s => (s.service_id || s.serviceId) === sId),
        alerts: alertRes.rows.filter(a => (a.service_id || a.serviceId || a.service) === sId)
      };
    }

    const profiles = rankServicesByRisk(services, telemetryMap);
    await operationalIntelligenceRepository.saveRiskProfiles(profiles, tenantId);
    return profiles;
  },

  /**
   * Evaluates early-warning signals and persists them.
   */
  async evaluateAndSyncEarlyWarnings(tenantId = 'default_tenant') {
    const svcRes = await query('SELECT * FROM services');
    const sloRes = await query('SELECT * FROM slos');
    const regRes = await query('SELECT * FROM deployment_regressions ORDER BY detected_at DESC LIMIT 30');
    const alertRes = await query('SELECT * FROM alerts WHERE status IN (\'firing\', \'acknowledged\')');
    const patterns = await operationalIntelligenceRepository.getPatterns({ tenantId });

    const services = svcRes.rows.length > 0 ? svcRes.rows : tenantContext()?[]:initialServices;

    const detected = detectEarlyWarnings({
      services,
      slos: sloRes.rows,
      regressions: regRes.rows,
      alerts: alertRes.rows,
      patterns
    });

    if (detected.length > 0) {
      await operationalIntelligenceRepository.saveEarlyWarnings(detected, tenantId);
    }

    return operationalIntelligenceRepository.getEarlyWarnings({ tenantId });
  },

  // Queries
  async getPatterns(filters = {}, tenantId = 'default_tenant') {
    return operationalIntelligenceRepository.getPatterns({ ...filters, tenantId });
  },

  async getPatternById(id, tenantId = 'default_tenant') {
    const pat = await operationalIntelligenceRepository.getPatternById(id, tenantId);
    if (!pat) {
      throw ApiError.notFound(`Operational pattern not found: ${id}`);
    }
    const evidence = await operationalIntelligenceRepository.getPatternEvidence(id);
    return {
      ...pat,
      evidence
    };
  },

  async getServiceRiskProfiles(tenantId = 'default_tenant') {
    const existing = await operationalIntelligenceRepository.getLatestRiskProfiles(tenantId);
    if (existing && existing.length > 0) {
      return existing;
    }
    // If empty, trigger evaluation
    return this.evaluateAndSyncServiceRiskProfiles(tenantId);
  },

  async getServiceRiskProfile(serviceId, tenantId = 'default_tenant') {
    const profile = await operationalIntelligenceRepository.getRiskProfileByServiceId(serviceId, tenantId);
    if (!profile) {
      throw ApiError.notFound(`Risk profile not found for service: ${serviceId}`);
    }
    return profile;
  },

  async getEarlyWarnings(filters = {}, tenantId = 'default_tenant') {
    return operationalIntelligenceRepository.getEarlyWarnings({ ...filters, tenantId });
  }
};
