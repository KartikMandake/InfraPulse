-- Migration 008: Unified Observability Intelligence & Event Correlation
-- Durable tables for normalized cross-source events, explainable event correlations,
-- investigation graph snapshots, and structured normalization error records.

-- 1. Normalized Events Table
CREATE TABLE IF NOT EXISTS normalized_events (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  source_system VARCHAR(100) NOT NULL,
  source_ref_id VARCHAR(100) NOT NULL,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  service_id VARCHAR(100),
  service_name VARCHAR(100),
  environment VARCHAR(50) NOT NULL DEFAULT 'production',
  event_timestamp TIMESTAMPTZ NOT NULL,
  ingestion_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'high', 'warning', 'info')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  correlation_ids JSONB NOT NULL DEFAULT '[]',
  related_incident_id VARCHAR(64),
  related_deployment_id VARCHAR(64),
  telemetry_mode VARCHAR(20) NOT NULL DEFAULT 'simulated' CHECK (telemetry_mode IN ('live', 'simulated')),
  evidence_quality VARCHAR(30) NOT NULL DEFAULT 'good' CHECK (evidence_quality IN ('good', 'incomplete', 'stale', 'missing')),
  normalized_attributes JSONB NOT NULL DEFAULT '{}',
  original_source_ref JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_normalized_event UNIQUE (source_system, source_ref_id, event_type)
);

-- 2. Event Correlations Table
CREATE TABLE IF NOT EXISTS event_correlations (
  id VARCHAR(64) PRIMARY KEY,
  source_event_id VARCHAR(64) NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
  target_event_id VARCHAR(64) NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,
  correlation_score INT NOT NULL CHECK (correlation_score >= 0 AND correlation_score <= 100),
  supporting_reasons JSONB NOT NULL DEFAULT '[]',
  contradictory_evidence JSONB NOT NULL DEFAULT '[]',
  time_difference_ms BIGINT NOT NULL DEFAULT 0,
  dependency_path JSONB NOT NULL DEFAULT '[]',
  confidence VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Investigation Graph Snapshots Table
CREATE TABLE IF NOT EXISTS investigation_graph_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  incident_id VARCHAR(64) NOT NULL,
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  correlation_summary JSONB NOT NULL DEFAULT '{}',
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Event Normalization Failures Table
CREATE TABLE IF NOT EXISTS event_normalization_failures (
  id VARCHAR(64) PRIMARY KEY,
  source_system VARCHAR(100) NOT NULL,
  raw_payload JSONB NOT NULL,
  error_reason TEXT NOT NULL,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance and lookup
CREATE INDEX IF NOT EXISTS idx_normalized_events_time ON normalized_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_events_service ON normalized_events(service_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_events_incident ON normalized_events(related_incident_id);
CREATE INDEX IF NOT EXISTS idx_normalized_events_type ON normalized_events(event_type);
CREATE INDEX IF NOT EXISTS idx_normalized_events_tenant ON normalized_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_correlations_source ON event_correlations(source_event_id);
CREATE INDEX IF NOT EXISTS idx_event_correlations_target ON event_correlations(target_event_id);
CREATE INDEX IF NOT EXISTS idx_investigation_graph_incident ON investigation_graph_snapshots(incident_id);

