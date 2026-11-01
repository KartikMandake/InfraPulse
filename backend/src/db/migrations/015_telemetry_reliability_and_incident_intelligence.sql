-- Migration 015: Telemetry Reliability & Incident Intelligence
-- Phase 23I: Real-Infrastructure-to-Incident Pipeline, Dead-Letter Tracking,
-- Observed Service Dependencies, and Evidence-Backed RCA.

-- 1. Extend integration_telemetry_stats with reliability & latency metrics
ALTER TABLE integration_telemetry_stats ADD COLUMN IF NOT EXISTS events_rejected_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE integration_telemetry_stats ADD COLUMN IF NOT EXISTS duplicate_events_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE integration_telemetry_stats ADD COLUMN IF NOT EXISTS avg_processing_latency_ms NUMERIC(8,2) NOT NULL DEFAULT 0;
ALTER TABLE integration_telemetry_stats ADD COLUMN IF NOT EXISTS last_successful_ingestion_at TIMESTAMPTZ;
ALTER TABLE integration_telemetry_stats ADD COLUMN IF NOT EXISTS last_failed_ingestion_at TIMESTAMPTZ;

-- 2. Telemetry Dead-Letter Queue / Audit Table
CREATE TABLE IF NOT EXISTS telemetry_dead_letter (
  id VARCHAR(64) PRIMARY KEY,
  integration_id VARCHAR(64) REFERENCES integrations(id) ON DELETE SET NULL,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  provider VARCHAR(50) NOT NULL,
  telemetry_type VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL,
  error_reason TEXT NOT NULL,
  error_code VARCHAR(64) DEFAULT 'INVALID_PAYLOAD',
  retry_count INT NOT NULL DEFAULT 0,
  rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Observed & Inferred Service Dependency Topology
CREATE TABLE IF NOT EXISTS service_observed_dependencies (
  id VARCHAR(128) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  source_service_id VARCHAR(64) NOT NULL,
  target_service_id VARCHAR(64) NOT NULL,
  relationship_type VARCHAR(32) NOT NULL DEFAULT 'calls',
  detection_source VARCHAR(64) NOT NULL, -- 'distributed_trace' | 'compose_link' | 'k8s_service' | 'cloud_resource'
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observation_count INT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 4. Extend incidents with rich RCA evidence and correlation rationale
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS rca_confidence_level VARCHAR(32) DEFAULT 'STRONG_HYPOTHESIS';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS rca_hypotheses JSONB DEFAULT '[]'::jsonb;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS correlated_resource_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS correlation_rationale JSONB DEFAULT '{}'::jsonb;

-- 5. Indexes for fast retrieval and tenant isolation
CREATE INDEX IF NOT EXISTS idx_telemetry_dead_letter_tenant ON telemetry_dead_letter(tenant_id, environment, rejected_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_dead_letter_int ON telemetry_dead_letter(integration_id);
CREATE INDEX IF NOT EXISTS idx_service_obs_dep_tenant ON service_observed_dependencies(tenant_id, environment);
CREATE INDEX IF NOT EXISTS idx_service_obs_dep_src ON service_observed_dependencies(source_service_id, target_service_id);

