-- Schema Version 001: Initial Relational Persistence Schema for InfraPulse

-- 1. Services Table
CREATE TABLE IF NOT EXISTS services (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  tier INT NOT NULL DEFAULT 0,
  protocol VARCHAR(20) NOT NULL DEFAULT 'HTTP',
  status VARCHAR(50) NOT NULL DEFAULT 'nominal',
  latency_p99 NUMERIC NOT NULL DEFAULT 0,
  latency_baseline NUMERIC NOT NULL DEFAULT 0,
  error_rate NUMERIC NOT NULL DEFAULT 0,
  rps INT NOT NULL DEFAULT 0,
  pod_count INT NOT NULL DEFAULT 1,
  region VARCHAR(50) NOT NULL DEFAULT 'us-east-1',
  namespace VARCHAR(50) NOT NULL DEFAULT 'default',
  cpu_percent NUMERIC NOT NULL DEFAULT 0,
  memory_percent NUMERIC NOT NULL DEFAULT 0,
  dependencies TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  endpoints JSONB NOT NULL DEFAULT '[]',
  pods JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
  id VARCHAR(50) PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'SEV-2',
  status VARCHAR(50) NOT NULL DEFAULT 'investigating',
  service_id VARCHAR(100) REFERENCES services(id) ON DELETE SET NULL,
  service_name VARCHAR(100) NOT NULL,
  lead VARCHAR(100) DEFAULT 'On-Call SRE',
  lead_role VARCHAR(100) DEFAULT 'Incident Commander',
  channel VARCHAR(100),
  started_at VARCHAR(50),
  duration_minutes INT DEFAULT 0,
  drop_rate_percent NUMERIC DEFAULT 0,
  estimated_cost_per_min NUMERIC DEFAULT 0,
  slo_breached BOOLEAN DEFAULT FALSE,
  slo_current NUMERIC DEFAULT 100.0,
  slo_target NUMERIC DEFAULT 99.9,
  ai_confidence_percent INT DEFAULT 75,
  ai_hypothesis TEXT,
  ai_remediation_recommendation TEXT,
  canary_version VARCHAR(50),
  stable_version VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Incident Events (Timeline Milestones) Table
CREATE TABLE IF NOT EXISTS incident_events (
  id VARCHAR(100) PRIMARY KEY,
  incident_id VARCHAR(50) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'incident_milestone',
  time VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source VARCHAR(50) DEFAULT 'ai_engine',
  is_key_milestone BOOLEAN DEFAULT FALSE,
  evidence_ref JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Alert Rules Table
CREATE TABLE IF NOT EXISTS alert_rules (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  target_service_id VARCHAR(100) NOT NULL DEFAULT '*',
  metric VARCHAR(100) NOT NULL,
  operator VARCHAR(10) NOT NULL,
  threshold VARCHAR(100) NOT NULL,
  window_minutes INT NOT NULL DEFAULT 5,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cooldown_minutes INT NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(50) PRIMARY KEY,
  rule_id VARCHAR(50) REFERENCES alert_rules(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  state VARCHAR(30) NOT NULL DEFAULT 'firing',
  service_id VARCHAR(100) REFERENCES services(id) ON DELETE CASCADE,
  service_name VARCHAR(100) NOT NULL,
  region VARCHAR(50) DEFAULT 'us-east-1',
  metric VARCHAR(100) NOT NULL,
  operator VARCHAR(10) NOT NULL DEFAULT '>',
  threshold VARCHAR(100) NOT NULL,
  current_value VARCHAR(100) NOT NULL,
  observed_value VARCHAR(100),
  fired_at VARCHAR(50) NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  silence_duration VARCHAR(50),
  incident_id VARCHAR(50) REFERENCES incidents(id) ON DELETE SET NULL,
  occurrence_count INT NOT NULL DEFAULT 1,
  source VARCHAR(50) DEFAULT 'rule_evaluator',
  evidence_refs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Deployments Table
CREATE TABLE IF NOT EXISTS deployments (
  id VARCHAR(50) PRIMARY KEY,
  service_name VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  environment VARCHAR(50) NOT NULL DEFAULT 'production',
  author VARCHAR(100),
  commit_sha VARCHAR(40) NOT NULL,
  commit_message TEXT NOT NULL,
  timestamp VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'healthy',
  aca_score INT DEFAULT 100,
  canary_traffic_percent INT DEFAULT 0,
  p99_canary_vs_stable JSONB DEFAULT '{}',
  error_rate_canary_vs_stable JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Investigation Runs Table
CREATE TABLE IF NOT EXISTS investigation_runs (
  id VARCHAR(100) PRIMARY KEY,
  incident_id VARCHAR(50) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  candidate_count INT NOT NULL DEFAULT 0,
  top_candidate_service_id VARCHAR(100),
  top_candidate_score NUMERIC DEFAULT 0,
  hypotheses JSONB NOT NULL DEFAULT '[]',
  correlated_traces JSONB NOT NULL DEFAULT '[]',
  weights JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Fault Simulations Table
CREATE TABLE IF NOT EXISTS fault_simulations (
  id VARCHAR(100) PRIMARY KEY,
  scenario_id VARCHAR(100) NOT NULL,
  target_service_id VARCHAR(100) NOT NULL,
  target_service_name VARCHAR(100) NOT NULL,
  fault_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  expected_root_cause_service_id VARCHAR(100) NOT NULL,
  expected_downstream_affected TEXT[] DEFAULT '{}',
  propagated_services TEXT[] DEFAULT '{}',
  simulated_incident JSONB NOT NULL DEFAULT '{}',
  evaluation JSONB DEFAULT '{}',
  baseline_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Correlation Indexes
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_service_id ON incidents(service_id);
CREATE INDEX IF NOT EXISTS idx_incident_events_incident_id ON incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status_service ON alerts(status, service_id);
CREATE INDEX IF NOT EXISTS idx_alerts_incident_id ON alerts(incident_id);
CREATE INDEX IF NOT EXISTS idx_investigation_runs_incident_id ON investigation_runs(incident_id);
CREATE INDEX IF NOT EXISTS idx_fault_simulations_scenario_id ON fault_simulations(scenario_id);
