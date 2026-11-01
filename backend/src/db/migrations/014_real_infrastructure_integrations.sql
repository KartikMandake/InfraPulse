-- Migration 014: Real Infrastructure Integrations & Live Telemetry Pipeline
-- Phase 23H: Extends integration management with environment scoping, organization isolation,
-- and live telemetry ingestion tracking across AWS, Docker, Kubernetes, Prometheus, and OTLP.

-- 1. Extend integrations table with environment and organization scoping
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS environment VARCHAR(32) NOT NULL DEFAULT 'staging';
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS organization_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant';

-- 2. Relax status check constraint to support all enterprise lifecycle states
DO $$
BEGIN
  ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_status_check;
  ALTER TABLE integrations ADD CONSTRAINT integrations_status_check
    CHECK (status IN ('DISCONNECTED', 'CONNECTED', 'CONNECTING', 'DEGRADED', 'ERROR', 'FAILED'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. Telemetry Ingestion Statistics Table
CREATE TABLE IF NOT EXISTS integration_telemetry_stats (
  id VARCHAR(64) PRIMARY KEY,
  integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  organization_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  metrics_ingested_count BIGINT NOT NULL DEFAULT 0,
  logs_ingested_count BIGINT NOT NULL DEFAULT 0,
  traces_ingested_count BIGINT NOT NULL DEFAULT 0,
  events_ingested_count BIGINT NOT NULL DEFAULT 0,
  bytes_ingested BIGINT NOT NULL DEFAULT 0,
  last_ingested_at TIMESTAMPTZ,
  error_count INT NOT NULL DEFAULT 0,
  last_error_message TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Analytical & Performance Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_env_org ON integrations(tenant_id, organization_id, environment);
CREATE INDEX IF NOT EXISTS idx_integration_telemetry_stats_int ON integration_telemetry_stats(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_telemetry_stats_tenant ON integration_telemetry_stats(tenant_id, environment);

