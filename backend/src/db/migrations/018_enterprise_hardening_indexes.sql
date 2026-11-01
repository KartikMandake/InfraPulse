-- Migration 018: Enterprise Hardening & Query Performance Indexes
-- Phase 23L: Scalability, Latency Optimization, and Multi-Tenant Query Hardening

-- 1. Incidents & Alerts Composite Indexes
CREATE INDEX IF NOT EXISTS idx_incidents_status_created ON incidents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_service_status ON incidents(service_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_status_created ON alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_service_status ON alerts(service_id, status);

-- 2. Audit & Access Logging Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_ts ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_ts ON audit_logs(action, created_at DESC);

-- 3. Telemetry Reliability & Dead-Letter Indexes
CREATE INDEX IF NOT EXISTS idx_dead_letter_provider_code ON telemetry_dead_letter(provider, error_code);
CREATE INDEX IF NOT EXISTS idx_integ_stats_tenant_updated ON integration_telemetry_stats(tenant_id, updated_at DESC);

-- 4. Governed Remediation Indexes
CREATE INDEX IF NOT EXISTS idx_remediation_plans_rec ON remediation_plans(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_infra_rem_approvals_tenant_status ON infra_remediation_approvals(tenant_id, approval_status, expires_at);
CREATE INDEX IF NOT EXISTS idx_remediation_exec_res_status ON remediation_executions(resource_id, status);
CREATE INDEX IF NOT EXISTS idx_remediation_exec_tenant_status ON remediation_executions(tenant_id, status, started_at DESC);

-- 5. SRE Intelligence Composite Indexes
CREATE INDEX IF NOT EXISTS idx_sre_risk_detected ON sre_risk_predictions(tenant_id, environment, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sre_recs_lifecycle ON sre_operational_recommendations(tenant_id, environment, status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sre_cap_insights ON sre_capacity_insights(tenant_id, environment, status, estimated_monthly_waste_usd DESC);

-- 6. Cloud Lifecycle Workload Indexes
CREATE INDEX IF NOT EXISTS idx_cloud_res_env_provider ON cloud_resources(environment, provider, current_state);
CREATE INDEX IF NOT EXISTS idx_cloud_ops_res_status ON cloud_lifecycle_operations(resource_id, status);
