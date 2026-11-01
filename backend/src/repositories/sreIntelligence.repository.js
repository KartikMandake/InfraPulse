/**
 * SRE Intelligence Repository — InfraPulse Phase 23K
 * 
 * Multi-tenant durable persistence for:
 * - SRE Health Snapshots
 * - SRE Predictive Risk Forecasts
 * - SRE Capacity & Cost Optimization Insights
 * - SRE Governed Operational Recommendations
 */

import crypto from 'node:crypto';
import { query } from '../db/connection.js';

export const sreIntelligenceRepository = {
  // ==========================================
  // 1. SRE Health Snapshots
  // ==========================================
  async saveHealthSnapshot({
    tenantId = 'default_tenant',
    environment = 'staging',
    overallScore = 100,
    healthStatus = 'HEALTHY',
    telemetryStatus = 'FRESH',
    confidenceLevel = 'HIGH',
    servicesHealth = [],
    resourcesHealth = [],
    riskIndicators = [],
    supportingEvidence = []
  }) {
    const id = `sre-health-${crypto.randomUUID().slice(0, 12)}`;
    const sql = `
      INSERT INTO sre_health_snapshots (
        id, tenant_id, environment, overall_score, health_status,
        telemetry_status, confidence_level, services_health, resources_health,
        risk_indicators, supporting_evidence, evaluated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *;
    `;
    const res = await query(sql, [
      id,
      tenantId,
      environment,
      overallScore,
      healthStatus,
      telemetryStatus,
      confidenceLevel,
      JSON.stringify(servicesHealth),
      JSON.stringify(resourcesHealth),
      JSON.stringify(riskIndicators),
      JSON.stringify(supportingEvidence)
    ]);
    return res.rows[0];
  },

  async getLatestHealthSnapshot({ tenantId = 'default_tenant', environment = 'staging' }) {
    const sql = `
      SELECT * FROM sre_health_snapshots
      WHERE tenant_id = $1 AND environment = $2
      ORDER BY evaluated_at DESC
      LIMIT 1;
    `;
    const res = await query(sql, [tenantId, environment]);
    return res.rows[0] || null;
  },

  // ==========================================
  // 2. SRE Predictive Risks
  // ==========================================
  async saveRiskPrediction({
    id = null,
    tenantId = 'default_tenant',
    environment = 'staging',
    riskType,
    targetResourceId = null,
    targetServiceId = null,
    trendDirection = 'STABLE',
    currentValue = 0,
    projectedValue = 0,
    rateOfChangePerHour = 0,
    observedWindowHours = 24,
    forecastHorizonHours = 48,
    timeToExhaustionHours = null,
    riskLevel = 'LOW',
    confidence = 'HIGH',
    methodology = 'OLS_LINEAR_REGRESSION',
    supportingObservations = [],
    recommendedInvestigation = '',
    status = 'ACTIVE'
  }) {
    const predictionId = id || `sre-risk-${crypto.randomUUID().slice(0, 12)}`;
    const sql = `
      INSERT INTO sre_risk_predictions (
        id, tenant_id, environment, risk_type, target_resource_id, target_service_id,
        trend_direction, current_value, projected_value, rate_of_change_per_hour,
        observed_window_hours, forecast_horizon_hours, time_to_exhaustion_hours,
        risk_level, confidence, methodology, supporting_observations, recommended_investigation,
        status, detected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
      RETURNING *;
    `;
    const res = await query(sql, [
      predictionId,
      tenantId,
      environment,
      riskType,
      targetResourceId,
      targetServiceId,
      trendDirection,
      currentValue,
      projectedValue,
      rateOfChangePerHour,
      observedWindowHours,
      forecastHorizonHours,
      timeToExhaustionHours,
      riskLevel,
      confidence,
      methodology,
      JSON.stringify(supportingObservations),
      recommendedInvestigation,
      status
    ]);
    return res.rows[0];
  },

  async listRiskPredictions({ tenantId = 'default_tenant', environment = 'staging', status = null, riskLevel = null, limit = 50 }) {
    let sql = `
      SELECT * FROM sre_risk_predictions
      WHERE tenant_id = $1 AND environment = $2
    `;
    const params = [tenantId, environment];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (riskLevel) {
      params.push(riskLevel);
      sql += ` AND risk_level = $${params.length}`;
    }

    sql += ` ORDER BY detected_at DESC LIMIT $${params.length + 1};`;
    params.push(limit);

    const res = await query(sql, params);
    return res.rows;
  },

  async updateRiskPredictionStatus(id, status, tenantId = 'default_tenant') {
    const sql = `
      UPDATE sre_risk_predictions
      SET status = $1
      WHERE id = $2 AND tenant_id = $3
      RETURNING *;
    `;
    const res = await query(sql, [status, id, tenantId]);
    return res.rows[0] || null;
  },

  // ==========================================
  // 3. SRE Capacity & Cost Insights
  // ==========================================
  async saveCapacityInsight({
    id = null,
    tenantId = 'default_tenant',
    environment = 'staging',
    resourceId,
    serviceId = null,
    provider = 'aws',
    resourceType = 'compute_instance',
    currentAllocation = {},
    actualUtilization = {},
    underutilizationPercent = 0,
    estimatedMonthlyWasteUsd = 0,
    optimizationCategory,
    recommendedGovernedAction,
    confidence = 'HIGH',
    justification,
    status = 'OPEN'
  }) {
    const insightId = id || `sre-cap-${crypto.randomUUID().slice(0, 12)}`;
    const sql = `
      INSERT INTO sre_capacity_insights (
        id, tenant_id, environment, resource_id, service_id, provider, resource_type,
        current_allocation, actual_utilization, underutilization_percent, estimated_monthly_waste_usd,
        optimization_category, recommended_governed_action, confidence, justification, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      RETURNING *;
    `;
    const res = await query(sql, [
      insightId,
      tenantId,
      environment,
      resourceId,
      serviceId,
      provider,
      resourceType,
      JSON.stringify(currentAllocation),
      JSON.stringify(actualUtilization),
      underutilizationPercent,
      estimatedMonthlyWasteUsd,
      optimizationCategory,
      recommendedGovernedAction,
      confidence,
      justification,
      status
    ]);
    return res.rows[0];
  },

  async listCapacityInsights({ tenantId = 'default_tenant', environment = 'staging', status = null, limit = 50 }) {
    let sql = `
      SELECT * FROM sre_capacity_insights
      WHERE tenant_id = $1 AND environment = $2
    `;
    const params = [tenantId, environment];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ` ORDER BY estimated_monthly_waste_usd DESC, created_at DESC LIMIT $${params.length + 1};`;
    params.push(limit);

    const res = await query(sql, params);
    return res.rows;
  },

  // ==========================================
  // 4. SRE Operational Recommendations
  // ==========================================
  async createOperationalRecommendation({
    tenantId = 'default_tenant',
    environment = 'staging',
    recommendationCode = null,
    title,
    affectedResource,
    affectedService,
    evidence = [],
    priority = 'P2',
    risk = 'MEDIUM',
    confidence = 'HIGH',
    expectedBenefit,
    suggestedAction,
    potentialOperationalImpact,
    requiredApproval = 'SRE Reliability Lead',
    status = 'OPEN',
    assignedTo = null
  }) {
    const id = `sre-rec-${crypto.randomUUID().slice(0, 12)}`;
    const code = recommendationCode || `SRE-REC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const sql = `
      INSERT INTO sre_operational_recommendations (
        id, tenant_id, environment, recommendation_code, title, affected_resource,
        affected_service, evidence, priority, risk, confidence, expected_benefit,
        suggested_action, potential_operational_impact, required_approval, status, assigned_to,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      RETURNING *;
    `;
    const res = await query(sql, [
      id,
      tenantId,
      environment,
      code,
      title,
      affectedResource,
      affectedService,
      JSON.stringify(evidence),
      priority,
      risk,
      confidence,
      expectedBenefit,
      suggestedAction,
      potentialOperationalImpact,
      requiredApproval,
      status,
      assignedTo
    ]);
    return res.rows[0];
  },

  async listOperationalRecommendations({ tenantId = 'default_tenant', environment = 'staging', status = null, priority = null, limit = 50 }) {
    let sql = `
      SELECT * FROM sre_operational_recommendations
      WHERE tenant_id = $1 AND environment = $2
    `;
    const params = [tenantId, environment];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (priority) {
      params.push(priority);
      sql += ` AND priority = $${params.length}`;
    }

    sql += ` ORDER BY CASE priority WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 WHEN 'P2' THEN 3 WHEN 'P3' THEN 4 ELSE 5 END, created_at DESC LIMIT $${params.length + 1};`;
    params.push(limit);

    const res = await query(sql, params);
    return res.rows;
  },

  async getOperationalRecommendationById(id, tenantId = 'default_tenant') {
    const sql = `
      SELECT * FROM sre_operational_recommendations
      WHERE (id = $1 OR recommendation_code = $1) AND tenant_id = $2;
    `;
    const res = await query(sql, [id, tenantId]);
    return res.rows[0] || null;
  },

  async updateOperationalRecommendationStatus(id, { status, resolutionNotes = null, actionedAt = null, assignedTo = null }, tenantId = 'default_tenant') {
    const sql = `
      UPDATE sre_operational_recommendations
      SET status = $1,
          resolution_notes = COALESCE($2, resolution_notes),
          actioned_at = COALESCE($3, actioned_at),
          assigned_to = COALESCE($4, assigned_to),
          updated_at = NOW()
      WHERE (id = $5 OR recommendation_code = $5) AND tenant_id = $6
      RETURNING *;
    `;
    const res = await query(sql, [status, resolutionNotes, actionedAt, assignedTo, id, tenantId]);
    return res.rows[0] || null;
  }
};

