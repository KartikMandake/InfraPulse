-- Migration 007: Deployment Risk & Change Intelligence
-- Durable tables for change events, pre-deployment risk assessments,
-- dependency blast radius impacts, post-deployment regressions, risk evidence, and deployment outcomes.

-- 1. Change Events Master Table
CREATE TABLE IF NOT EXISTS change_events (
  id VARCHAR(64) PRIMARY KEY,
  service_id VARCHAR(100) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  service_name VARCHAR(100) NOT NULL,
  previous_version VARCHAR(50),
  new_version VARCHAR(50) NOT NULL,
  environment VARCHAR(50) NOT NULL DEFAULT 'production',
  deployment_strategy VARCHAR(50) NOT NULL DEFAULT 'rolling' CHECK (deployment_strategy IN ('rolling', 'canary', 'blue-green', 'recreate')),
  commit_sha VARCHAR(40),
  commit_message TEXT,
  actor VARCHAR(100) DEFAULT 'CI/CD Pipeline',
  status VARCHAR(30) NOT NULL DEFAULT 'successful' CHECK (status IN ('pending', 'in_progress', 'successful', 'failed', 'rolled_back')),
  change_type VARCHAR(50) NOT NULL DEFAULT 'code_deployment' CHECK (change_type IN ('code_deployment', 'config_change', 'schema_migration', 'infrastructure')),
  changed_components JSONB NOT NULL DEFAULT '[]',
  idempotency_key VARCHAR(128) UNIQUE,
  telemetry_source VARCHAR(64) NOT NULL DEFAULT 'demo_adapter',
  is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_quality VARCHAR(30) NOT NULL DEFAULT 'good' CHECK (evidence_quality IN ('good', 'incomplete', 'missing_telemetry', 'stale')),
  metadata JSONB NOT NULL DEFAULT '{}',
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Change Risk Assessments Table (Pre- and Post-Deployment)
CREATE TABLE IF NOT EXISTS change_assessments (
  id VARCHAR(64) PRIMARY KEY,
  change_id VARCHAR(64) REFERENCES change_events(id) ON DELETE CASCADE,
  service_id VARCHAR(100) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  environment VARCHAR(50) NOT NULL DEFAULT 'production',
  target_version VARCHAR(50) NOT NULL,
  risk_score INT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_category VARCHAR(30) NOT NULL CHECK (risk_category IN ('low', 'moderate', 'high', 'critical')),
  recommendation VARCHAR(50) NOT NULL CHECK (recommendation IN ('LOW_RISK', 'REVIEW_RECOMMENDED', 'HIGH_RISK', 'INSUFFICIENT_EVIDENCE')),
  factor_breakdowns JSONB NOT NULL DEFAULT '{}',
  blast_radius_summary JSONB NOT NULL DEFAULT '{}',
  supporting_evidence JSONB NOT NULL DEFAULT '[]',
  missing_evidence JSONB NOT NULL DEFAULT '[]',
  recommended_verifications JSONB NOT NULL DEFAULT '[]',
  confidence VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  assessed_by VARCHAR(100) DEFAULT 'risk-engine',
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Change Impacted Services Table (Blast Radius)
CREATE TABLE IF NOT EXISTS change_impact_services (
  id VARCHAR(64) PRIMARY KEY,
  change_id VARCHAR(64) REFERENCES change_events(id) ON DELETE CASCADE,
  assessment_id VARCHAR(64) REFERENCES change_assessments(id) ON DELETE CASCADE,
  service_id VARCHAR(100) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  service_name VARCHAR(100) NOT NULL,
  relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('direct_downstream', 'transitive_downstream', 'upstream_dependency', 'shared_dependency', 'target_service')),
  dependency_path JSONB NOT NULL DEFAULT '[]',
  criticality INT NOT NULL DEFAULT 1,
  has_active_incident BOOLEAN NOT NULL DEFAULT FALSE,
  has_slo BOOLEAN NOT NULL DEFAULT FALSE,
  confidence NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Deployment Regressions Table (Post-Deployment Anomaly Detection)
CREATE TABLE IF NOT EXISTS deployment_regressions (
  id VARCHAR(64) PRIMARY KEY,
  change_id VARCHAR(64) NOT NULL REFERENCES change_events(id) ON DELETE CASCADE,
  service_id VARCHAR(100) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  metric_name VARCHAR(50) NOT NULL,
  baseline_value NUMERIC(10,2) NOT NULL,
  current_value NUMERIC(10,2) NOT NULL,
  delta_percent NUMERIC(8,2) NOT NULL,
  regression_severity VARCHAR(20) NOT NULL CHECK (regression_severity IN ('info', 'warning', 'critical')),
  observation_window_minutes INT NOT NULL DEFAULT 30,
  temporal_association BOOLEAN NOT NULL DEFAULT TRUE,
  causality_status VARCHAR(30) NOT NULL DEFAULT 'correlated_temporal' CHECK (causality_status IN ('correlated_temporal', 'suspected_causal', 'unrelated', 'inconclusive')),
  evidence_quality VARCHAR(30) NOT NULL DEFAULT 'good' CHECK (evidence_quality IN ('good', 'incomplete', 'missing_telemetry', 'stale')),
  related_incidents JSONB NOT NULL DEFAULT '[]',
  related_alerts JSONB NOT NULL DEFAULT '[]',
  explanation TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Change Risk Evidence Table
CREATE TABLE IF NOT EXISTS change_risk_evidence (
  id VARCHAR(64) PRIMARY KEY,
  change_id VARCHAR(64) REFERENCES change_events(id) ON DELETE CASCADE,
  assessment_id VARCHAR(64) REFERENCES change_assessments(id) ON DELETE CASCADE,
  evidence_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  metric_ref VARCHAR(100),
  impact_points NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_contradictory BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Change Outcomes Table (Post-Mortem & Historical Tracking)
CREATE TABLE IF NOT EXISTS change_outcomes (
  id VARCHAR(64) PRIMARY KEY,
  change_id VARCHAR(64) NOT NULL REFERENCES change_events(id) ON DELETE CASCADE,
  observed_outcome VARCHAR(30) NOT NULL CHECK (observed_outcome IN ('healthy', 'degraded', 'failed_rolled_back', 'incident_caused')),
  incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE SET NULL,
  rollback_performed BOOLEAN NOT NULL DEFAULT FALSE,
  time_to_recovery_minutes INT,
  post_deployment_notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_change_events_service ON change_events(service_id, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_events_env ON change_events(environment);
CREATE INDEX IF NOT EXISTS idx_change_events_tenant ON change_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_change_events_idempotency ON change_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_change_assessments_change ON change_assessments(change_id);
CREATE INDEX IF NOT EXISTS idx_change_assessments_service ON change_assessments(service_id);
CREATE INDEX IF NOT EXISTS idx_change_impact_services_change ON change_impact_services(change_id);
CREATE INDEX IF NOT EXISTS idx_deployment_regressions_change ON deployment_regressions(change_id);
CREATE INDEX IF NOT EXISTS idx_deployment_regressions_service ON deployment_regressions(service_id);
CREATE INDEX IF NOT EXISTS idx_change_risk_evidence_assessment ON change_risk_evidence(assessment_id);
CREATE INDEX IF NOT EXISTS idx_change_outcomes_change ON change_outcomes(change_id);

