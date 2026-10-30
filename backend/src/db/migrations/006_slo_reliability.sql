-- Migration 006: SLO-Driven Reliability Intelligence
-- Durable tables for Service Level Objectives (SLOs), Service Level Indicators (SLIs),
-- error budget tracking, multi-window burn rate alerts, service reliability scoring, and incident impact.

-- 1. SLOs Table
CREATE TABLE IF NOT EXISTS slos (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  service_id VARCHAR(64) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  sli_type VARCHAR(32) NOT NULL CHECK (sli_type IN ('availability', 'latency', 'error_rate', 'throughput')),
  sli_definition TEXT NOT NULL,
  target_percent NUMERIC(5,2) NOT NULL CHECK (target_percent > 0 AND target_percent < 100),
  latency_threshold_ms NUMERIC(10,2),
  rolling_window_days INT NOT NULL CHECK (rolling_window_days IN (7, 30, 90)),
  evaluation_interval_minutes INT NOT NULL DEFAULT 5,
  owner VARCHAR(100) DEFAULT 'SRE Reliability Team',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SLO Evaluations Table
CREATE TABLE IF NOT EXISTS slo_evaluations (
  id VARCHAR(64) PRIMARY KEY,
  slo_id VARCHAR(64) NOT NULL REFERENCES slos(id) ON DELETE CASCADE,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  total_events BIGINT NOT NULL DEFAULT 0,
  good_events BIGINT NOT NULL DEFAULT 0,
  bad_events BIGINT NOT NULL DEFAULT 0,
  sli_value NUMERIC(6,3),
  target_percent NUMERIC(5,2) NOT NULL,
  error_budget_percent NUMERIC(6,3) NOT NULL,
  allowed_bad_events BIGINT NOT NULL DEFAULT 0,
  remaining_budget_percent NUMERIC(6,2) NOT NULL,
  budget_consumed_percent NUMERIC(6,2) NOT NULL,
  burn_rate_1h NUMERIC(6,2) DEFAULT 0,
  burn_rate_6h NUMERIC(6,2) DEFAULT 0,
  burn_rate_24h NUMERIC(6,2) DEFAULT 0,
  status VARCHAR(30) NOT NULL CHECK (status IN ('nominal', 'burn_warning', 'breached', 'insufficient_data', 'zero_traffic')),
  data_quality VARCHAR(30) NOT NULL DEFAULT 'good' CHECK (data_quality IN ('good', 'incomplete', 'missing_telemetry', 'stale')),
  is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
  telemetry_source VARCHAR(64) NOT NULL DEFAULT 'demo_adapter'
);

-- 3. SLO Error Budget History Table
CREATE TABLE IF NOT EXISTS slo_error_budget_history (
  id VARCHAR(64) PRIMARY KEY,
  slo_id VARCHAR(64) NOT NULL REFERENCES slos(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  budget_remaining_percent NUMERIC(6,2) NOT NULL,
  burn_rate NUMERIC(6,2) NOT NULL,
  bad_events_delta INT NOT NULL DEFAULT 0
);

-- 4. SLO Alert Policies Table
CREATE TABLE IF NOT EXISTS slo_alert_policies (
  id VARCHAR(64) PRIMARY KEY,
  slo_id VARCHAR(64) NOT NULL REFERENCES slos(id) ON DELETE CASCADE,
  fast_burn_threshold NUMERIC(5,2) NOT NULL DEFAULT 14.4,
  slow_burn_threshold NUMERIC(5,2) NOT NULL DEFAULT 3.0,
  exhaustion_threshold NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  min_events_required INT NOT NULL DEFAULT 50,
  cooldown_minutes INT NOT NULL DEFAULT 30,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SLO Alert Events Table
CREATE TABLE IF NOT EXISTS slo_alert_events (
  id VARCHAR(64) PRIMARY KEY,
  slo_id VARCHAR(64) NOT NULL REFERENCES slos(id) ON DELETE CASCADE,
  policy_id VARCHAR(64) REFERENCES slo_alert_policies(id) ON DELETE SET NULL,
  incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE SET NULL,
  alert_type VARCHAR(32) NOT NULL CHECK (alert_type IN ('fast_burn', 'slow_burn', 'budget_exhausted', 'imminent_breach')),
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  burn_rate NUMERIC(6,2) NOT NULL,
  budget_remaining_percent NUMERIC(6,2) NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'firing' CHECK (status IN ('firing', 'acknowledged', 'resolved')),
  message TEXT NOT NULL
);

-- 6. Service Reliability Snapshots Table
CREATE TABLE IF NOT EXISTS service_reliability_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  service_id VARCHAR(64) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reliability_score INT NOT NULL CHECK (reliability_score >= 0 AND reliability_score <= 100),
  status VARCHAR(20) NOT NULL CHECK (status IN ('excellent', 'good', 'degraded', 'critical')),
  trend_direction VARCHAR(16) NOT NULL CHECK (trend_direction IN ('improving', 'stable', 'degrading')),
  contributing_factors JSONB NOT NULL DEFAULT '[]',
  recommendations JSONB NOT NULL DEFAULT '[]',
  data_quality VARCHAR(30) NOT NULL DEFAULT 'good' CHECK (data_quality IN ('good', 'incomplete', 'missing_telemetry', 'stale')),
  slos_evaluated_count INT NOT NULL DEFAULT 0,
  slos_breached_count INT NOT NULL DEFAULT 0,
  total_budget_consumed_percent NUMERIC(6,2) NOT NULL DEFAULT 0
);

-- Performance & Reliability Indexes
CREATE INDEX IF NOT EXISTS idx_slos_service ON slos(service_id);
CREATE INDEX IF NOT EXISTS idx_slos_enabled ON slos(enabled);
CREATE INDEX IF NOT EXISTS idx_slo_evaluations_slo_time ON slo_evaluations(slo_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_slo_evaluations_status ON slo_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_slo_history_slo_time ON slo_error_budget_history(slo_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_slo_alert_events_slo ON slo_alert_events(slo_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_slo_alert_events_incident ON slo_alert_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_slo_alert_events_status ON slo_alert_events(status);
CREATE INDEX IF NOT EXISTS idx_reliability_snapshots_service_time ON service_reliability_snapshots(service_id, calculated_at DESC);

