/**
 * Operational Intelligence Repository — InfraPulse Phase 18
 *
 * PostgreSQL persistence layer for:
 * - Recurring operational patterns & pattern evidence
 * - Service risk profiles
 * - Preventive recommendations lifecycle
 * - Operational trend snapshots
 * - Early warning events
 */

import { query, withTransaction } from '../db/connection.js';

/**
 * Maps database row to operational pattern domain object.
 */
function mapPatternRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description,
    affectedServices: typeof row.affected_services === 'string' ? JSON.parse(row.affected_services) : (row.affected_services || []),
    occurrenceCount: row.occurrence_count,
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at,
    trendDirection: row.trend_direction,
    commonSignals: typeof row.common_signals === 'string' ? JSON.parse(row.common_signals) : (row.common_signals || []),
    relatedIncidents: typeof row.related_incidents === 'string' ? JSON.parse(row.related_incidents) : (row.related_incidents || []),
    confidence: row.confidence,
    sampleSize: row.sample_size,
    tenantId: row.tenant_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Maps database row to preventive recommendation domain object.
 */
function mapRecommendationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    explanation: row.explanation,
    serviceId: row.service_id,
    serviceName: row.service_name,
    priority: row.priority,
    status: row.status,
    ownerRole: row.owner_role,
    ownerUserId: row.owner_user_id,
    expectedBenefit: row.expected_benefit,
    benefitType: row.benefit_type,
    supportingPatternIds: typeof row.supporting_pattern_ids === 'string' ? JSON.parse(row.supporting_pattern_ids) : (row.supporting_pattern_ids || []),
    supportingEvidenceRefs: typeof row.supporting_evidence_refs === 'string' ? JSON.parse(row.supporting_evidence_refs) : (row.supporting_evidence_refs || []),
    relevantRunbookIds: typeof row.relevant_runbook_ids === 'string' ? JSON.parse(row.relevant_runbook_ids) : (row.relevant_runbook_ids || []),
    verificationMethod: row.verification_method,
    verificationNotes: row.verification_notes,
    dismissedReason: row.dismissed_reason,
    linkedIssueRef: row.linked_issue_ref,
    tenantId: row.tenant_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Maps database row to service risk profile domain object.
 */
function mapRiskProfileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    riskScore: row.risk_score,
    riskCategory: row.risk_category,
    contributingFactors: typeof row.contributing_factors === 'string' ? JSON.parse(row.contributing_factors) : (row.contributing_factors || {}),
    mttrMinutes: Number(row.mttr_minutes || 0),
    incidentCount: row.incident_count,
    changeFailureRatePercent: Number(row.change_failure_rate_percent || 0),
    sloAttainmentPercent: Number(row.slo_attainment_percent || 100),
    remainingErrorBudgetPercent: Number(row.remaining_error_budget_percent || 100),
    trendDirection: row.trend_direction,
    sampleSize: row.sample_size,
    confidence: row.confidence,
    tenantId: row.tenant_id,
    evaluatedAt: row.evaluated_at
  };
}

/**
 * Maps database row to early warning event domain object.
 */
function mapEarlyWarningRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    serviceId: row.service_id,
    serviceName: row.service_name,
    severity: row.severity,
    indicators: typeof row.indicators === 'string' ? JSON.parse(row.indicators) : (row.indicators || []),
    historicalComparison: row.historical_comparison,
    windowMinutes: row.window_minutes,
    confidence: row.confidence,
    recommendedInvestigation: row.recommended_investigation,
    tenantId: row.tenant_id,
    detectedAt: row.detected_at
  };
}

export const operationalIntelligenceRepository = {
  // === 1. Operational Patterns ===
  async getPatterns({ tenantId = 'default_tenant', category = null, serviceId = null } = {}) {
    let sql = 'SELECT * FROM operational_patterns WHERE tenant_id = $1';
    const params = [tenantId];

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    if (serviceId) {
      params.push(`%"${serviceId}"%`);
      sql += ` AND affected_services::text LIKE $${params.length}`;
    }

    sql += ' ORDER BY occurrence_count DESC, last_observed_at DESC';
    const result = await query(sql, params);
    return result.rows.map(mapPatternRow);
  },

  async getPatternById(id, tenantId = 'default_tenant') {
    const result = await query(
      'SELECT * FROM operational_patterns WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return mapPatternRow(result.rows[0]);
  },

  async getPatternEvidence(patternId) {
    const result = await query(
      'SELECT * FROM pattern_evidence WHERE pattern_id = $1 ORDER BY observed_at DESC',
      [patternId]
    );
    return result.rows.map(r => ({
      id: r.id,
      patternId: r.pattern_id,
      evidenceType: r.evidence_type,
      sourceRefId: r.source_ref_id,
      title: r.title,
      description: r.description,
      observedAt: r.observed_at,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
      createdAt: r.created_at
    }));
  },

  async upsertPattern(pattern, tenantId = 'default_tenant') {
    const result = await query(
      `INSERT INTO operational_patterns (
        id, category, title, description, affected_services, occurrence_count,
        first_observed_at, last_observed_at, trend_direction, common_signals,
        related_incidents, confidence, sample_size, tenant_id, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        affected_services = EXCLUDED.affected_services,
        occurrence_count = EXCLUDED.occurrence_count,
        last_observed_at = EXCLUDED.last_observed_at,
        trend_direction = EXCLUDED.trend_direction,
        common_signals = EXCLUDED.common_signals,
        related_incidents = EXCLUDED.related_incidents,
        confidence = EXCLUDED.confidence,
        sample_size = EXCLUDED.sample_size,
        updated_at = NOW()
      RETURNING *;`,
      [
        pattern.id, pattern.category, pattern.title, pattern.description,
        JSON.stringify(pattern.affectedServices || []), pattern.occurrenceCount || 1,
        pattern.firstObservedAt, pattern.lastObservedAt, pattern.trendDirection || 'stable',
        JSON.stringify(pattern.commonSignals || []), JSON.stringify(pattern.relatedIncidents || []),
        pattern.confidence || 'medium', pattern.sampleSize || 1, tenantId
      ]
    );
    return mapPatternRow(result.rows[0]);
  },

  // === 2. Preventive Recommendations ===
  async getRecommendations({
    tenantId = 'default_tenant',
    serviceId = null,
    status = null,
    priority = null
  } = {}) {
    let sql = 'SELECT * FROM preventive_recommendations WHERE tenant_id = $1';
    const params = [tenantId];

    if (serviceId) {
      params.push(serviceId);
      sql += ` AND service_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (priority) {
      params.push(priority);
      sql += ` AND priority = $${params.length}`;
    }

    sql += ' ORDER BY CASE priority WHEN \'P0\' THEN 0 WHEN \'P1\' THEN 1 WHEN \'P2\' THEN 2 ELSE 3 END, created_at DESC';
    const result = await query(sql, params);
    return result.rows.map(mapRecommendationRow);
  },

  async getRecommendationById(id, tenantId = 'default_tenant') {
    const result = await query(
      'SELECT * FROM preventive_recommendations WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return mapRecommendationRow(result.rows[0]);
  },

  async createRecommendation(rec, tenantId = 'default_tenant') {
    const result = await query(
      `INSERT INTO preventive_recommendations (
        id, title, explanation, service_id, service_name, priority, status,
        owner_role, owner_user_id, expected_benefit, benefit_type,
        supporting_pattern_ids, supporting_evidence_refs, relevant_runbook_ids,
        verification_method, verification_notes, dismissed_reason, linked_issue_ref, tenant_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      RETURNING *;`,
      [
        rec.id, rec.title, rec.explanation, rec.serviceId, rec.serviceName,
        rec.priority || 'P2', rec.status || 'OPEN', rec.ownerRole || 'SRE Reliability Team',
        rec.ownerUserId || null, rec.expectedBenefit, rec.benefitType || 'qualitative',
        JSON.stringify(rec.supportingPatternIds || []), JSON.stringify(rec.supportingEvidenceRefs || []),
        JSON.stringify(rec.relevantRunbookIds || []), rec.verificationMethod,
        rec.verificationNotes || null, rec.dismissedReason || null, rec.linkedIssueRef || null,
        tenantId
      ]
    );
    return mapRecommendationRow(result.rows[0]);
  },

  async updateRecommendationStatus(id, {
    status,
    verificationNotes = null,
    dismissedReason = null,
    ownerUserId = null,
    linkedIssueRef = null
  }, tenantId = 'default_tenant') {
    let sql = 'UPDATE preventive_recommendations SET status = $1, updated_at = NOW()';
    const params = [status];

    if (verificationNotes !== null) {
      params.push(verificationNotes);
      sql += `, verification_notes = $${params.length}`;
    }
    if (dismissedReason !== null) {
      params.push(dismissedReason);
      sql += `, dismissed_reason = $${params.length}`;
    }
    if (ownerUserId !== null) {
      params.push(ownerUserId);
      sql += `, owner_user_id = $${params.length}`;
    }
    if (linkedIssueRef !== null) {
      params.push(linkedIssueRef);
      sql += `, linked_issue_ref = $${params.length}`;
    }

    params.push(id, tenantId);
    sql += ` WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *;`;

    const result = await query(sql, params);
    return mapRecommendationRow(result.rows[0]);
  },

  // === 3. Service Risk Profiles ===
  async saveRiskProfiles(profiles = [], tenantId = 'default_tenant') {
    const results = [];
    for (const p of profiles) {
      const res = await query(
        `INSERT INTO service_risk_profiles (
          id, service_id, service_name, risk_score, risk_category,
          contributing_factors, mttr_minutes, incident_count,
          change_failure_rate_percent, slo_attainment_percent,
          remaining_error_budget_percent, trend_direction, sample_size,
          confidence, tenant_id, evaluated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        ON CONFLICT (id) DO UPDATE SET
          risk_score = EXCLUDED.risk_score,
          risk_category = EXCLUDED.risk_category,
          contributing_factors = EXCLUDED.contributing_factors,
          mttr_minutes = EXCLUDED.mttr_minutes,
          incident_count = EXCLUDED.incident_count,
          change_failure_rate_percent = EXCLUDED.change_failure_rate_percent,
          slo_attainment_percent = EXCLUDED.slo_attainment_percent,
          remaining_error_budget_percent = EXCLUDED.remaining_error_budget_percent,
          trend_direction = EXCLUDED.trend_direction,
          sample_size = EXCLUDED.sample_size,
          confidence = EXCLUDED.confidence,
          evaluated_at = NOW()
        RETURNING *;`,
        [
          p.id, p.serviceId, p.serviceName, p.riskScore, p.riskCategory,
          JSON.stringify(p.contributingFactors || {}), p.mttrMinutes || 0,
          p.incidentCount || 0, p.changeFailureRatePercent || 0,
          p.sloAttainmentPercent || 100, p.remainingErrorBudgetPercent || 100,
          p.trendDirection || 'stable', p.sampleSize || 0, p.confidence || 'medium',
          tenantId
        ]
      );
      results.push(mapRiskProfileRow(res.rows[0]));
    }
    return results;
  },

  async getLatestRiskProfiles(tenantId = 'default_tenant') {
    const result = await query(
      `SELECT DISTINCT ON (service_id) *
       FROM service_risk_profiles
       WHERE tenant_id = $1
       ORDER BY service_id, evaluated_at DESC;`,
      [tenantId]
    );
    return result.rows.map(mapRiskProfileRow).sort((a, b) => b.riskScore - a.riskScore);
  },

  async getRiskProfileByServiceId(serviceId, tenantId = 'default_tenant') {
    const result = await query(
      `SELECT * FROM service_risk_profiles
       WHERE service_id = $1 AND tenant_id = $2
       ORDER BY evaluated_at DESC
       LIMIT 1;`,
      [serviceId, tenantId]
    );
    return mapRiskProfileRow(result.rows[0]);
  },

  // === 4. Early Warning Events ===
  async getEarlyWarnings({ tenantId = 'default_tenant', serviceId = null, severity = null } = {}) {
    let sql = 'SELECT * FROM early_warning_events WHERE tenant_id = $1';
    const params = [tenantId];

    if (serviceId) {
      params.push(serviceId);
      sql += ` AND service_id = $${params.length}`;
    }

    if (severity) {
      params.push(severity);
      sql += ` AND severity = $${params.length}`;
    }

    sql += ' ORDER BY detected_at DESC';
    const result = await query(sql, params);
    return result.rows.map(mapEarlyWarningRow);
  },

  async saveEarlyWarnings(warnings = [], tenantId = 'default_tenant') {
    const saved = [];
    for (const w of warnings) {
      const res = await query(
        `INSERT INTO early_warning_events (
          id, category, service_id, service_name, severity, indicators,
          historical_comparison, window_minutes, confidence, recommended_investigation,
          tenant_id, detected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING
        RETURNING *;`,
        [
          w.id, w.category, w.serviceId, w.serviceName, w.severity,
          JSON.stringify(w.indicators || []), w.historical_comparison || w.historicalComparison || '',
          w.windowMinutes || 60, w.confidence || 'medium', w.recommendedInvestigation || '',
          tenantId, w.detectedAt || new Date().toISOString()
        ]
      );
      if (res.rows[0]) {
        saved.push(mapEarlyWarningRow(res.rows[0]));
      }
    }
    return saved;
  },

  // === 5. Operational Trend Snapshots ===
  async saveTrendSnapshot(snapshot, tenantId = 'default_tenant') {
    const result = await query(
      `INSERT INTO operational_trend_snapshots (
        id, window_start, window_end, sample_size, metrics,
        category_breakdown, service_risk_rankings, tenant_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *;`,
      [
        snapshot.id, snapshot.windowStart, snapshot.windowEnd,
        snapshot.sampleSize || 0, JSON.stringify(snapshot.metrics || {}),
        JSON.stringify(snapshot.categoryBreakdown || {}),
        JSON.stringify(snapshot.serviceRiskRankings || []),
        tenantId
      ]
    );
    const r = result.rows[0];
    return {
      id: r.id,
      windowStart: r.window_start,
      windowEnd: r.window_end,
      sampleSize: r.sample_size,
      metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : r.metrics,
      categoryBreakdown: typeof r.category_breakdown === 'string' ? JSON.parse(r.category_breakdown) : r.category_breakdown,
      serviceRiskRankings: typeof r.service_risk_rankings === 'string' ? JSON.parse(r.service_risk_rankings) : r.service_risk_rankings,
      tenantId: r.tenant_id,
      createdAt: r.created_at
    };
  },

  async getLatestTrendSnapshots(limit = 10, tenantId = 'default_tenant') {
    const result = await query(
      `SELECT * FROM operational_trend_snapshots
       WHERE tenant_id = $1
       ORDER BY window_end DESC
       LIMIT $2;`,
      [tenantId, limit]
    );
    return result.rows.map(r => ({
      id: r.id,
      windowStart: r.window_start,
      windowEnd: r.window_end,
      sampleSize: r.sample_size,
      metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : r.metrics,
      categoryBreakdown: typeof r.category_breakdown === 'string' ? JSON.parse(r.category_breakdown) : r.category_breakdown,
      serviceRiskRankings: typeof r.service_risk_rankings === 'string' ? JSON.parse(r.service_risk_rankings) : r.service_risk_rankings,
      tenantId: r.tenant_id,
      createdAt: r.created_at
    }));
  }
};

