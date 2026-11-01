-- Migration 017: Autonomous SRE Intelligence
-- Phase 23K: Unified Infrastructure Health Intelligence, Predictive Risk Forecasting,
-- SLO & Error Budget Management, Capacity & Cost Optimization, and Governed SRE Recommendations.

-- 1. SRE Health Snapshots Table
CREATE TABLE IF NOT EXISTS sre_health_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  overall_score INT NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  health_status VARCHAR(32) NOT NULL CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'CRITICAL', 'UNKNOWN')),
  telemetry_status VARCHAR(32) NOT NULL CHECK (telemetry_status IN ('FRESH', 'STALE', 'UNAVAILABLE')),
  confidence_level VARCHAR(32) NOT NULL CHECK (confidence_level IN ('HIGH', 'MEDIUM', 'LOW')),
  services_health JSONB NOT NULL DEFAULT '[]'::jsonb,
  resources_health JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
  supporting_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SRE Predictive Risks Table
CREATE TABLE IF NOT EXISTS sre_risk_predictions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  risk_type VARCHAR(64) NOT NULL, -- 'MEMORY_GROWTH', 'DISK_EXHAUSTION', 'CPU_SATURATION', 'CONTAINER_RESTARTS', 'LATENCY_DETERIORATION', 'ERROR_RATE_INCREASE'
  target_resource_id VARCHAR(128),
  target_service_id VARCHAR(128),
  trend_direction VARCHAR(32) NOT NULL CHECK (trend_direction IN ('INCREASING', 'DECREASING', 'STABLE', 'VOLATILE')),
  current_value NUMERIC(10,2) NOT NULL,
  projected_value NUMERIC(10,2) NOT NULL,
  rate_of_change_per_hour NUMERIC(10,4) NOT NULL DEFAULT 0,
  observed_window_hours NUMERIC(6,2) NOT NULL,
  forecast_horizon_hours NUMERIC(6,2) NOT NULL,
  time_to_exhaustion_hours NUMERIC(10,2),
  risk_level VARCHAR(32) NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  confidence VARCHAR(32) NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  methodology VARCHAR(64) NOT NULL DEFAULT 'OLS_LINEAR_REGRESSION',
  supporting_observations JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_investigation TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MITIGATED', 'INVALIDATED'))
);

-- 3. SRE Capacity & Cost Optimization Table
CREATE TABLE IF NOT EXISTS sre_capacity_insights (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  resource_id VARCHAR(128) NOT NULL,
  service_id VARCHAR(128),
  provider VARCHAR(32) NOT NULL, -- 'aws', 'docker', 'kubernetes', 'simulated'
  resource_type VARCHAR(64) NOT NULL, -- 'compute_instance', 'container', 'volume', 'public_ip'
  current_allocation JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_utilization JSONB NOT NULL DEFAULT '{}'::jsonb,
  underutilization_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  estimated_monthly_waste_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  optimization_category VARCHAR(64) NOT NULL, -- 'IDLE_RESOURCE', 'OVER_PROVISIONED_COMPUTE', 'EXCESSIVE_K8S_LIMITS', 'UNATTACHED_STORAGE'
  recommended_governed_action VARCHAR(64) NOT NULL,
  confidence VARCHAR(32) NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED', 'ACTIONED', 'DISMISSED'))
);

-- 4. SRE Operational Recommendations Table
CREATE TABLE IF NOT EXISTS sre_operational_recommendations (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  recommendation_code VARCHAR(64) NOT NULL UNIQUE, -- e.g. 'SRE-REC-2026-001'
  title TEXT NOT NULL,
  affected_resource VARCHAR(128) NOT NULL,
  affected_service VARCHAR(128) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority VARCHAR(16) NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  risk VARCHAR(32) NOT NULL CHECK (risk IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  confidence VARCHAR(32) NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  expected_benefit TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  potential_operational_impact TEXT NOT NULL,
  required_approval VARCHAR(64) NOT NULL DEFAULT 'SRE Reliability Lead',
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  assigned_to VARCHAR(64),
  actioned_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Indexes for fast retrieval and tenant isolation
CREATE INDEX IF NOT EXISTS idx_sre_health_tenant ON sre_health_snapshots(tenant_id, environment, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sre_risk_tenant ON sre_risk_predictions(tenant_id, environment, status, risk_level);
CREATE INDEX IF NOT EXISTS idx_sre_capacity_tenant ON sre_capacity_insights(tenant_id, environment, status);
CREATE INDEX IF NOT EXISTS idx_sre_rec_tenant ON sre_operational_recommendations(tenant_id, environment, status, priority);
CREATE INDEX IF NOT EXISTS idx_sre_rec_code ON sre_operational_recommendations(recommendation_code);

