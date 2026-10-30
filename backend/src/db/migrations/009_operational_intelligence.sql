-- Migration 009: Operational Intelligence & Predictive Incident Prevention
-- Durable tables for recurring failure patterns, pattern evidence, service risk profiles,
-- preventive recommendations lifecycle, trend snapshots, and early-warning signals.

-- 1. Operational Patterns Table
CREATE TABLE IF NOT EXISTS operational_patterns (
  id VARCHAR(64) PRIMARY KEY,
  category VARCHAR(64) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_services JSONB NOT NULL DEFAULT '[]',
  occurrence_count INT NOT NULL DEFAULT 1,
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  trend_direction VARCHAR(20) NOT NULL DEFAULT 'stable' CHECK (trend_direction IN ('increasing', 'decreasing', 'stable')),
  common_signals JSONB NOT NULL DEFAULT '[]',
  related_incidents JSONB NOT NULL DEFAULT '[]',
  confidence VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  sample_size INT NOT NULL DEFAULT 1,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Pattern Evidence Table
CREATE TABLE IF NOT EXISTS pattern_evidence (
  id VARCHAR(64) PRIMARY KEY,
  pattern_id VARCHAR(64) NOT NULL REFERENCES operational_patterns(id) ON DELETE CASCADE,
  evidence_type VARCHAR(50) NOT NULL,
  source_ref_id VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Service Risk Profiles Table
CREATE TABLE IF NOT EXISTS service_risk_profiles (
  id VARCHAR(64) PRIMARY KEY,
  service_id VARCHAR(100) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  service_name VARCHAR(100) NOT NULL,
  risk_score INT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_category VARCHAR(30) NOT NULL CHECK (risk_category IN ('low', 'moderate', 'high', 'critical')),
  contributing_factors JSONB NOT NULL DEFAULT '{}',
  mttr_minutes NUMERIC(8,2) DEFAULT 0,
  incident_count INT NOT NULL DEFAULT 0,
  change_failure_rate_percent NUMERIC(6,2) DEFAULT 0,
  slo_attainment_percent NUMERIC(6,2) DEFAULT 100,
  remaining_error_budget_percent NUMERIC(6,2) DEFAULT 100,
  trend_direction VARCHAR(20) NOT NULL DEFAULT 'stable' CHECK (trend_direction IN ('improving', 'deteriorating', 'stable')),
  sample_size INT NOT NULL DEFAULT 0,
  confidence VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Preventive Recommendations Table
CREATE TABLE IF NOT EXISTS preventive_recommendations (
  id VARCHAR(64) PRIMARY KEY,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  service_id VARCHAR(100) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  service_name VARCHAR(100) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'P2' CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'VERIFIED', 'CLOSED', 'DISMISSED')),
  owner_role VARCHAR(50) DEFAULT 'SRE Reliability Team',
  owner_user_id VARCHAR(50),
  expected_benefit TEXT NOT NULL,
  benefit_type VARCHAR(30) NOT NULL DEFAULT 'qualitative' CHECK (benefit_type IN ('qualitative', 'measured')),
  supporting_pattern_ids JSONB NOT NULL DEFAULT '[]',
  supporting_evidence_refs JSONB NOT NULL DEFAULT '[]',
  relevant_runbook_ids JSONB NOT NULL DEFAULT '[]',
  verification_method TEXT NOT NULL,
  verification_notes TEXT,
  dismissed_reason TEXT,
  linked_issue_ref VARCHAR(100),
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Operational Trend Snapshots Table
CREATE TABLE IF NOT EXISTS operational_trend_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  sample_size INT NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}',
  category_breakdown JSONB NOT NULL DEFAULT '{}',
  service_risk_rankings JSONB NOT NULL DEFAULT '[]',
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Early Warning Events Table
CREATE TABLE IF NOT EXISTS early_warning_events (
  id VARCHAR(64) PRIMARY KEY,
  category VARCHAR(64) NOT NULL,
  service_id VARCHAR(100) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  service_name VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'high', 'warning', 'info')),
  indicators JSONB NOT NULL DEFAULT '[]',
  historical_comparison TEXT NOT NULL,
  window_minutes INT NOT NULL DEFAULT 60,
  confidence VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  recommended_investigation TEXT NOT NULL,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance & analytical lookups
CREATE INDEX IF NOT EXISTS idx_operational_patterns_category ON operational_patterns(category);
CREATE INDEX IF NOT EXISTS idx_operational_patterns_tenant ON operational_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_risk_profiles_service ON service_risk_profiles(service_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_preventive_recommendations_status ON preventive_recommendations(status, priority);
CREATE INDEX IF NOT EXISTS idx_preventive_recommendations_service ON preventive_recommendations(service_id);
CREATE INDEX IF NOT EXISTS idx_early_warning_service ON early_warning_events(service_id, detected_at DESC);

