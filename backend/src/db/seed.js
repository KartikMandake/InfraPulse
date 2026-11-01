import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { withTransaction, closePool } from './connection.js';
import { initialServices } from '../data/services.js';
import { INITIAL_ALERT_RULES } from '../services/alertRules.service.js';
import { initialAlerts } from '../data/alerts.js';
import { initialIncidents } from '../data/incidents.js';
import { initialDeployments } from '../data/deployments.js';
import { INITIAL_RUNBOOKS } from '../data/runbooks.js';
import { INITIAL_SLOS } from '../data/slos.js';
import { INITIAL_CHANGES } from '../data/changes.js';
import { INITIAL_NORMALIZED_EVENTS, INITIAL_EVENT_CORRELATIONS } from '../data/canonicalEvents.js';
import {
  INITIAL_OPERATIONAL_PATTERNS,
  INITIAL_PATTERN_EVIDENCE,
  INITIAL_PREVENTIVE_RECOMMENDATIONS,
  INITIAL_EARLY_WARNINGS
} from '../data/operationalIntelligence.js';
import {
  INITIAL_CLOUD_RESOURCES,
  INITIAL_CLOUD_SCHEDULES
} from '../data/cloudResources.js';

const __filename = fileURLToPath(import.meta.url);

/**
 * Idempotently seeds initial mock datasets into PostgreSQL.
 * Safe to run multiple times without overwriting modifications or duplicating rows.
 */
export async function seedDatabase() {
  console.log('[Seed] Seeding database idempotently...');

  await withTransaction(async (client) => {
    // 1. Seed Services
    for (const s of initialServices) {
      await client.query(
        `INSERT INTO services (
          id, name, tier, protocol, status, latency_p99, latency_baseline,
          error_rate, rps, pod_count, region, namespace, cpu_percent, memory_percent,
          dependencies, tags, endpoints, pods
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          s.id, s.name, s.tier || 0, s.protocol || 'HTTP', s.status || 'nominal',
          s.latencyP99 || 0, s.latencyBaseline || 0, s.errorRate || 0, s.rps || 0,
          s.podCount || 1, s.region || 'us-east-1', s.namespace || 'default',
          s.cpuPercent || 0, s.memoryPercent || 0,
          s.dependencies || [], s.tags || [],
          JSON.stringify(s.endpoints || []), JSON.stringify(s.pods || [])
        ]
      );
    }

    // 2. Seed Alert Rules
    for (const r of INITIAL_ALERT_RULES) {
      await client.query(
        `INSERT INTO alert_rules (
          id, name, description, type, target_service_id, metric, operator,
          threshold, window_minutes, severity, enabled, cooldown_minutes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          r.id, r.name, r.description || '', r.type, r.targetServiceId || '*',
          r.metric, r.operator, String(r.threshold), r.windowMinutes || 5,
          r.severity || 'warning', r.enabled !== false, r.cooldownMinutes || 15
        ]
      );
    }

    // 3. Seed Incidents
    for (const inc of initialIncidents) {
      await client.query(
        `INSERT INTO incidents (
          id, title, summary, severity, status, service_id, service_name,
          lead, lead_role, channel, started_at, duration_minutes, drop_rate_percent,
          estimated_cost_per_min, slo_breached, slo_current, slo_target,
          ai_confidence_percent, ai_hypothesis, ai_remediation_recommendation,
          canary_version, stable_version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          inc.id, inc.title, inc.summary || '', inc.severity || 'SEV-2', inc.status || 'investigating',
          inc.serviceId, inc.serviceName || inc.serviceId, inc.lead || 'On-Call SRE',
          inc.leadRole || 'Incident Commander', inc.channel || `#inc-${inc.id}`,
          inc.startedAt, inc.durationMinutes || 0, inc.dropRatePercent || 0,
          inc.estimatedCostPerMin || 0, Boolean(inc.sloBreached), inc.sloCurrent || 100,
          inc.sloTarget || 99.9, inc.aiConfidencePercent || 75,
          inc.aiHypothesis || '', inc.aiRemediationRecommendation || '',
          inc.canaryVersion || null, inc.stableVersion || null
        ]
      );

      // Seed timeline milestones
      if (Array.isArray(inc.timeline)) {
        for (let idx = 0; idx < inc.timeline.length; idx++) {
          const item = inc.timeline[idx];
          const eventId = `evt-${inc.id}-${idx}`;
          await client.query(
            `INSERT INTO incident_events (
              id, incident_id, type, time, title, description, source, is_key_milestone
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8
            )
            ON CONFLICT (id) DO NOTHING;`,
            [
              eventId, inc.id, 'incident_milestone', item.time, item.title,
              item.description || '', item.source || 'ai_engine', Boolean(item.isKeyMilestone)
            ]
          );
        }
      }
    }

    // 4. Seed Alerts
    for (const a of initialAlerts) {
      await client.query(
        `INSERT INTO alerts (
          id, rule_id, title, severity, status, state, service_id, service_name,
          region, metric, operator, threshold, current_value, observed_value,
          fired_at, triggered_at, acknowledged_at, resolved_at, silence_duration,
          incident_id, occurrence_count, source, evidence_refs
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          a.id, a.ruleId || null, a.title, a.severity || 'warning',
          a.status || 'active', a.state || 'firing', a.serviceId, a.serviceName || a.serviceId,
          a.region || 'us-east-1', a.metric || 'unknown', a.operator || '>',
          String(a.threshold), String(a.currentValue), a.observedValue || null,
          a.firedAt || '12:00:00 UTC', a.triggeredAt || new Date().toISOString(),
          a.acknowledgedAt || null, a.resolvedAt || null, a.silenceDuration || null,
          a.incidentId || null, a.occurrenceCount || 1, a.source || 'rule_evaluator',
          JSON.stringify(a.evidenceRefs || [])
        ]
      );
    }

    // 5. Seed Deployments
    for (const d of initialDeployments) {
      await client.query(
        `INSERT INTO deployments (
          id, service_name, version, environment, author, commit_sha,
          commit_message, timestamp, status, aca_score, canary_traffic_percent,
          p99_canary_vs_stable, error_rate_canary_vs_stable
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          d.id, d.serviceName, d.version, d.environment || 'production',
          d.author || 'System', d.commitSha || '0000000', d.commitMessage || '',
          d.timestamp, d.status || 'healthy', d.acaScore || 100,
          d.canaryTrafficPercent || 0,
          JSON.stringify(d.p99CanaryVsStable || {}),
          JSON.stringify(d.errorRateCanaryVsStable || {})
        ]
      );
    }

    // 6. Seed Demo Users
    const defaultPasswordHash = bcrypt.hashSync('Password123!', 10);
    const initialUsers = [
      {
        id: 'usr_admin_001',
        name: 'Sarah Chen',
        email: 'sarah.chen@infrapulse.io',
        role: 'admin'
      },
      {
        id: 'usr_responder_002',
        name: 'Marcus Vance',
        email: 'marcus.v@infrapulse.io',
        role: 'responder'
      },
      {
        id: 'usr_viewer_003',
        name: 'Alex Ross',
        email: 'alex.ross@infrapulse.io',
        role: 'viewer'
      }
    ];

    for (const u of initialUsers) {
      await client.query(
        `INSERT INTO users (
          id, name, email, password_hash, role, status
        ) VALUES (
          $1, $2, $3, $4, $5, 'active'
        )
        ON CONFLICT (email) DO NOTHING;`,
        [u.id, u.name, u.email, defaultPasswordHash, u.role]
      );
    }

    // 7. Seed Notification Channels & Preferences
    const initialChannels = [
      {
        id: 'chan_slack_default',
        name: 'Slack Incident Channel (#incidents-war-room)',
        type: 'slack',
        enabled: true,
        config: { channel: '#incidents-war-room', team: 'InfraPulse SRE', minSeverity: 'SEV-2' }
      },
      {
        id: 'chan_email_default',
        name: 'SRE On-Call Email List',
        type: 'email',
        enabled: true,
        config: { recipients: ['sre-oncall@infrapulse.io', 'lead-commander@infrapulse.io'], minSeverity: 'SEV-2' }
      }
    ];

    for (const c of initialChannels) {
      await client.query(
        `INSERT INTO notification_channels (
          id, name, type, enabled, config
        ) VALUES (
          $1, $2, $3, $4, $5
        )
        ON CONFLICT (id) DO NOTHING;`,
        [c.id, c.name, c.type, c.enabled, JSON.stringify(c.config)]
      );
    }

    const initialPreferences = [
      { id: 'pref_slack_01', channelId: 'chan_slack_default', eventType: 'incident.created', minSeverity: 'SEV-2' },
      { id: 'pref_slack_02', channelId: 'chan_slack_default', eventType: 'incident.escalated', minSeverity: 'SEV-2' },
      { id: 'pref_slack_03', channelId: 'chan_slack_default', eventType: 'incident.assigned', minSeverity: 'SEV-2' },
      { id: 'pref_slack_04', channelId: 'chan_slack_default', eventType: 'alert.critical', minSeverity: 'SEV-1' },
      { id: 'pref_slack_05', channelId: 'chan_slack_default', eventType: 'incident.resolved', minSeverity: 'SEV-2' },
      { id: 'pref_email_01', channelId: 'chan_email_default', eventType: 'incident.created', minSeverity: 'SEV-2' },
      { id: 'pref_email_02', channelId: 'chan_email_default', eventType: 'incident.escalated', minSeverity: 'SEV-1' },
      { id: 'pref_email_03', channelId: 'chan_email_default', eventType: 'incident.resolved', minSeverity: 'SEV-2' }
    ];

    for (const p of initialPreferences) {
      await client.query(
        `INSERT INTO notification_preferences (
          id, channel_id, event_type, min_severity, enabled
        ) VALUES (
          $1, $2, $3, $4, true
        )
        ON CONFLICT (id) DO NOTHING;`,
        [p.id, p.channelId, p.eventType, p.minSeverity]
      );
    }

    // 8. Seed Remediation and Diagnostic Runbooks
    for (const rb of INITIAL_RUNBOOKS) {
      await client.query(
        `INSERT INTO runbooks (
          id, title, description, risk_level, execution_mode,
          supported_incident_types, applicable_services, preconditions,
          expected_outcome, verification_procedure, rollback_procedure,
          required_approval_role, version, enabled
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          rb.id, rb.title, rb.description, rb.riskLevel, rb.executionMode,
          JSON.stringify(rb.supportedIncidentTypes), JSON.stringify(rb.applicableServices),
          JSON.stringify(rb.preconditions), rb.expectedOutcome, rb.verificationProcedure,
          rb.rollbackProcedure, rb.requiredApprovalRole, rb.version || 1
        ]
      );

      // Seed initial version 1 snapshot
      const versionId = `${rb.id}-v1`;
      await client.query(
        `INSERT INTO runbook_versions (
          id, runbook_id, version, definition, changelog, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
        ON CONFLICT (runbook_id, version) DO NOTHING;`,
        [
          versionId,
          rb.id,
          rb.version || 1,
          JSON.stringify(rb),
          'Initial catalog baseline version',
          'usr_admin_001'
        ]
      );
    }

    // 9. Seed Production SLOs, Evaluations, and Alert Policies
    const now = new Date();
    const windowStart30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const s of INITIAL_SLOS) {
      await client.query(
        `INSERT INTO slos (
          id, name, description, service_id, sli_type, sli_definition,
          target_percent, latency_threshold_ms, rolling_window_days,
          evaluation_interval_minutes, owner, enabled
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          s.id, s.name, s.description, s.serviceId, s.sliType, s.sliDefinition,
          s.targetPercent, s.latencyThresholdMs, s.rollingWindowDays,
          s.evaluationIntervalMinutes, s.owner
        ]
      );

      // Seed Initial Evaluation
      const evalId = `eval-${s.id}-initial`;
      const ev = s.initialEvaluation;
      await client.query(
        `INSERT INTO slo_evaluations (
          id, slo_id, evaluated_at, window_start, window_end,
          total_events, good_events, bad_events, sli_value, target_percent,
          error_budget_percent, allowed_bad_events, remaining_budget_percent,
          budget_consumed_percent, burn_rate_1h, burn_rate_6h, burn_rate_24h,
          status, data_quality, is_simulated, telemetry_source
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          evalId, s.id, now.toISOString(), windowStart30d.toISOString(), now.toISOString(),
          ev.totalEvents, ev.goodEvents, ev.badEvents, ev.sliValue, ev.targetPercent,
          ev.errorBudgetPercent, ev.allowedBadEvents, ev.remainingBudgetPercent,
          ev.budgetConsumedPercent, ev.burnRate1h, ev.burnRate6h, ev.burnRate24h,
          ev.status, ev.dataQuality, ev.isSimulated, ev.telemetrySource
        ]
      );

      // Seed Alert Policy
      const policyId = `policy-${s.id}`;
      await client.query(
        `INSERT INTO slo_alert_policies (
          id, slo_id, fast_burn_threshold, slow_burn_threshold,
          exhaustion_threshold, min_events_required, cooldown_minutes, enabled
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, true
        )
        ON CONFLICT (id) DO NOTHING;`,
        [policyId, s.id, 14.4, 3.0, 1.0, 50, 30]
      );

      // Seed Error Budget History
      const historyId = `hist-${s.id}-${now.getTime()}`;
      await client.query(
        `INSERT INTO slo_error_budget_history (
          id, slo_id, timestamp, budget_remaining_percent, burn_rate, bad_events_delta
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
        ON CONFLICT (id) DO NOTHING;`,
        [historyId, s.id, now.toISOString(), ev.remainingBudgetPercent, ev.burnRate1h, ev.badEvents]
      );
    }

    // 8. Seed Change Events & Intelligence
    for (const chg of INITIAL_CHANGES) {
      await client.query(
        `INSERT INTO change_events (
          id, service_id, service_name, previous_version, new_version, environment,
          deployment_strategy, commit_sha, commit_message, actor, status, change_type,
          changed_components, idempotency_key, telemetry_source, is_simulated,
          evidence_quality, deployed_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          chg.id, chg.serviceId, chg.serviceName, chg.previousVersion, chg.newVersion,
          chg.environment, chg.deploymentStrategy, chg.commitSha, chg.commitMessage,
          chg.actor, chg.status, chg.changeType, JSON.stringify(chg.changedComponents),
          chg.idempotencyKey, chg.telemetrySource, chg.isSimulated, chg.evidenceQuality,
          chg.deployedAt
        ]
      );

      // Seed Assessment
      if (chg.initialAssessment) {
        const asmt = chg.initialAssessment;
        await client.query(
          `INSERT INTO change_assessments (
            id, change_id, service_id, environment, target_version, risk_score,
            risk_category, recommendation, factor_breakdowns, blast_radius_summary,
            supporting_evidence, missing_evidence, recommended_verifications,
            confidence, assessed_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
          ON CONFLICT (id) DO NOTHING;`,
          [
            asmt.id, chg.id, chg.serviceId, chg.environment, chg.newVersion,
            asmt.riskScore, asmt.riskCategory, asmt.recommendation,
            JSON.stringify(asmt.factorBreakdowns), JSON.stringify(asmt.blastRadiusSummary),
            JSON.stringify(asmt.supportingEvidence), JSON.stringify(asmt.missingEvidence),
            JSON.stringify(asmt.recommendedVerifications), asmt.confidence, 'risk-engine'
          ]
        );
      }

      // Seed Regressions
      if (Array.isArray(chg.initialRegressions)) {
        for (const reg of chg.initialRegressions) {
          await client.query(
            `INSERT INTO deployment_regressions (
              id, change_id, service_id, metric_name, baseline_value, current_value,
              delta_percent, regression_severity, observation_window_minutes,
              temporal_association, causality_status, evidence_quality, related_incidents,
              related_alerts, explanation
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            )
            ON CONFLICT (id) DO NOTHING;`,
            [
              reg.id, chg.id, chg.serviceId, reg.metricName, reg.baselineValue,
              reg.currentValue, reg.deltaPercent, reg.regressionSeverity,
              reg.observationWindowMinutes, reg.temporalAssociation, reg.causalityStatus,
              reg.evidenceQuality, JSON.stringify(reg.relatedIncidents),
              JSON.stringify(reg.relatedAlerts), reg.explanation
            ]
          );
        }
      }

      // Seed Outcome
      if (chg.initialOutcome) {
        const outc = chg.initialOutcome;
        await client.query(
          `INSERT INTO change_outcomes (
            id, change_id, observed_outcome, incident_id, rollback_performed,
            time_to_recovery_minutes, post_deployment_notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING;`,
          [
            outc.id, chg.id, outc.observedOutcome, outc.incidentId,
            outc.rollbackPerformed, outc.timeToRecoveryMinutes, outc.postDeploymentNotes
          ]
        );
      }
    }

    // 9. Seed Normalized Observability Events & Correlations (Phase 17)
    for (const evt of INITIAL_NORMALIZED_EVENTS) {
      await client.query(
        `INSERT INTO normalized_events (
          id, event_type, source_system, source_ref_id, tenant_id, service_id,
          service_name, environment, event_timestamp, ingestion_timestamp, severity,
          title, summary, correlation_ids, related_incident_id, related_deployment_id,
          telemetry_mode, evidence_quality, normalized_attributes, original_source_ref
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        ON CONFLICT (tenant_id, environment, source_system, source_ref_id, event_type) DO NOTHING;`,
        [
          evt.id, evt.eventType, evt.sourceSystem, evt.sourceRefId, 'default_tenant',
          evt.serviceId, evt.serviceName, evt.environment, evt.eventTimestamp,
          new Date().toISOString(), evt.severity, evt.title, evt.summary,
          JSON.stringify(evt.correlationIds), evt.relatedIncidentId, evt.relatedDeploymentId,
          evt.telemetryMode, evt.evidenceQuality, JSON.stringify(evt.normalizedAttributes),
          JSON.stringify(evt.originalSourceRef)
        ]
      );
    }

    for (const corr of INITIAL_EVENT_CORRELATIONS) {
      await client.query(
        `INSERT INTO event_correlations (
          id, source_event_id, target_event_id, relationship_type, correlation_score,
          supporting_reasons, contradictory_evidence, time_difference_ms, confidence, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'default_tenant')
        ON CONFLICT (id) DO NOTHING;`,
        [
          corr.id, corr.sourceEventId, corr.targetEventId, corr.relationshipType,
          corr.correlationScore, JSON.stringify(corr.supportingReasons),
          JSON.stringify(corr.contradictoryEvidence), corr.timeDifferenceMs, corr.confidence
        ]
      );
    }

    // 10. Seed Operational Patterns, Evidence, & Recommendations (Phase 18)
    for (const pat of INITIAL_OPERATIONAL_PATTERNS) {
      await client.query(
        `INSERT INTO operational_patterns (
          id, category, title, description, affected_services, occurrence_count,
          first_observed_at, last_observed_at, trend_direction, common_signals,
          related_incidents, confidence, sample_size, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'default_tenant')
        ON CONFLICT (id) DO NOTHING;`,
        [
          pat.id, pat.category, pat.title, pat.description,
          JSON.stringify(pat.affectedServices), pat.occurrenceCount,
          pat.firstObservedAt, pat.lastObservedAt, pat.trendDirection,
          JSON.stringify(pat.commonSignals), JSON.stringify(pat.relatedIncidents),
          pat.confidence, pat.sampleSize
        ]
      );
    }

    for (const evi of INITIAL_PATTERN_EVIDENCE) {
      await client.query(
        `INSERT INTO pattern_evidence (
          id, pattern_id, evidence_type, source_ref_id, title, description, observed_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING;`,
        [
          evi.id, evi.patternId, evi.evidenceType, evi.sourceRefId,
          evi.title, evi.description, evi.observedAt, JSON.stringify(evi.metadata || {})
        ]
      );
    }

    for (const rec of INITIAL_PREVENTIVE_RECOMMENDATIONS) {
      await client.query(
        `INSERT INTO preventive_recommendations (
          id, title, explanation, service_id, service_name, priority, status,
          owner_role, owner_user_id, expected_benefit, benefit_type,
          supporting_pattern_ids, supporting_evidence_refs, relevant_runbook_ids,
          verification_method, verification_notes, dismissed_reason, linked_issue_ref, tenant_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'default_tenant'
        )
        ON CONFLICT (id) DO NOTHING;`,
        [
          rec.id, rec.title, rec.explanation, rec.serviceId, rec.serviceName,
          rec.priority, rec.status, rec.ownerRole, rec.ownerUserId, rec.expectedBenefit,
          rec.benefitType, JSON.stringify(rec.supportingPatternIds),
          JSON.stringify(rec.supportingEvidenceRefs), JSON.stringify(rec.relevantRunbookIds),
          rec.verificationMethod, rec.verificationNotes, rec.dismissedReason, rec.linkedIssueRef
        ]
      );
    }

    for (const ew of INITIAL_EARLY_WARNINGS) {
      await client.query(
        `INSERT INTO early_warning_events (
          id, category, service_id, service_name, severity, indicators,
          historical_comparison, window_minutes, confidence, recommended_investigation,
          tenant_id, detected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'default_tenant', $11)
        ON CONFLICT (id) DO NOTHING;`,
        [
          ew.id, ew.category, ew.serviceId, ew.serviceName, ew.severity,
          JSON.stringify(ew.indicators), ew.historical_comparison, ew.windowMinutes,
          ew.confidence, ew.recommendedInvestigation, ew.detectedAt
        ]
      );
    }
    // 17. Seed Cloud Resources Inventory (Phase 23C)
    for (const r of INITIAL_CLOUD_RESOURCES) {
      await client.query(
        `INSERT INTO cloud_resources (
          id, name, provider, resource_type, region, environment, current_state,
          estimated_hourly_cost, cost_breakdown, dependencies, persistence_requirements,
          is_critical_dependency, metadata, last_lifecycle_operation, last_health_check_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO NOTHING;`,
        [
          r.id, r.name, r.provider, r.resource_type, r.region, r.environment, r.current_state,
          r.estimated_hourly_cost, JSON.stringify(r.cost_breakdown || {}),
          JSON.stringify(r.dependencies || []), JSON.stringify(r.persistence_requirements || {}),
          r.is_critical_dependency || false, JSON.stringify(r.metadata || {}),
          r.last_lifecycle_operation || null, r.last_health_check_status || 'healthy'
        ]
      );
    }

    // 18. Seed Cloud Schedules (Phase 23C)
    for (const s of INITIAL_CLOUD_SCHEDULES) {
      await client.query(
        `INSERT INTO cloud_schedules (
          id, resource_id, name, action, cron_expression, timezone,
          enabled, is_paused, days_of_week, time_of_day, missed_execution_recovery, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING;`,
        [
          s.id, s.resource_id, s.name, s.action, s.cron_expression, s.timezone,
          s.enabled, s.is_paused, JSON.stringify(s.days_of_week || []), s.time_of_day,
          s.missed_execution_recovery, s.created_by
        ]
      );
    }
  });

  console.log('[Seed] Database seeded successfully.');
  return { success: true };
}

// Direct CLI invocation
if (process.argv[1] === __filename) {
  seedDatabase()
    .then(() => {
      console.log('[Seed Complete]');
      return closePool();
    })
    .catch((err) => {
      console.error('[Seed Error]:', err);
      process.exit(1);
    });
}
