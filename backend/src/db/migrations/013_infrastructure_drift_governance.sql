-- ==============================================================================
-- InfraPulse Migration 013: Infrastructure Drift Detection & Reconciliation Intelligence
-- Phase 23G: State Snapshots, Desired-State Baselines, Drift Detection & Governed Reconciliation
-- ==============================================================================

-- 1. Desired-State Baseline Configurations
CREATE TABLE IF NOT EXISTS cloud_desired_state_baselines (
  id VARCHAR(100) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  organization_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(50) NOT NULL DEFAULT 'staging',
  name VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  resource_configurations JSONB NOT NULL DEFAULT '{}',
  configuration_hash VARCHAR(64) NOT NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_baselines_tenant_env ON cloud_desired_state_baselines(tenant_id, environment);
CREATE INDEX IF NOT EXISTS idx_cloud_baselines_org ON cloud_desired_state_baselines(organization_id);
CREATE INDEX IF NOT EXISTS idx_cloud_baselines_active ON cloud_desired_state_baselines(is_active);

-- 2. Infrastructure State Snapshots
CREATE TABLE IF NOT EXISTS cloud_state_snapshots (
  id VARCHAR(100) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  organization_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(50) NOT NULL DEFAULT 'staging',
  provider VARCHAR(50) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100) NOT NULL,
  resource_configuration JSONB NOT NULL DEFAULT '{}',
  configuration_hash VARCHAR(64) NOT NULL,
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  collection_status VARCHAR(50) NOT NULL DEFAULT 'success',
  source_provider VARCHAR(50) NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_snapshots_tenant_env ON cloud_state_snapshots(tenant_id, environment);
CREATE INDEX IF NOT EXISTS idx_cloud_snapshots_resource ON cloud_state_snapshots(resource_id);
CREATE INDEX IF NOT EXISTS idx_cloud_snapshots_time ON cloud_state_snapshots(observed_at DESC);

-- 3. Infrastructure Drift Events
CREATE TABLE IF NOT EXISTS cloud_drift_events (
  id VARCHAR(100) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  organization_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(50) NOT NULL DEFAULT 'staging',
  resource_id VARCHAR(100) NOT NULL,
  resource_name VARCHAR(255),
  provider VARCHAR(50) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  drift_type VARCHAR(50) NOT NULL, -- 'configuration_drift', 'unexpected_addition', 'missing_resource', 'replica_mismatch', 'workload_state_drift', 'unauthorized_modification'
  status VARCHAR(50) NOT NULL DEFAULT 'detected', -- 'detected', 'acknowledged', 'reconciling', 'reconciled', 'ignored'
  severity VARCHAR(50) NOT NULL DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'
  severity_reason TEXT,
  severity_evidence JSONB NOT NULL DEFAULT '{}',
  expected_configuration JSONB NOT NULL DEFAULT '{}',
  actual_configuration JSONB NOT NULL DEFAULT '{}',
  changed_fields JSONB NOT NULL DEFAULT '[]',
  dependency_impact JSONB NOT NULL DEFAULT '{}',
  baseline_id VARCHAR(100),
  baseline_version INTEGER,
  snapshot_id VARCHAR(100),
  observation_count INTEGER NOT NULL DEFAULT 1,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_cloud_drifts_tenant_env ON cloud_drift_events(tenant_id, environment);
CREATE INDEX IF NOT EXISTS idx_cloud_drifts_resource ON cloud_drift_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_cloud_drifts_status ON cloud_drift_events(status);
CREATE INDEX IF NOT EXISTS idx_cloud_drifts_severity ON cloud_drift_events(severity);
CREATE INDEX IF NOT EXISTS idx_cloud_drifts_detected ON cloud_drift_events(first_detected_at DESC);

-- 4. Drift Reconciliation Plans
CREATE TABLE IF NOT EXISTS cloud_reconciliation_plans (
  id VARCHAR(100) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  organization_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(50) NOT NULL DEFAULT 'staging',
  drift_id VARCHAR(100) NOT NULL REFERENCES cloud_drift_events(id) ON DELETE CASCADE,
  resource_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'preview', -- 'preview', 'requested', 'approved', 'executing', 'completed', 'failed', 'rejected', 'manual_recommended'
  proposed_actions JSONB NOT NULL DEFAULT '[]',
  field_diffs JSONB NOT NULL DEFAULT '[]',
  affected_dependencies JSONB NOT NULL DEFAULT '[]',
  risk_assessment JSONB NOT NULL DEFAULT '{}',
  eligibility_result JSONB NOT NULL DEFAULT '{}',
  operation_id VARCHAR(100),
  requested_by VARCHAR(100),
  approved_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  execution_result JSONB
);

CREATE INDEX IF NOT EXISTS idx_cloud_reconciliations_drift ON cloud_reconciliation_plans(drift_id);
CREATE INDEX IF NOT EXISTS idx_cloud_reconciliations_resource ON cloud_reconciliation_plans(resource_id);
CREATE INDEX IF NOT EXISTS idx_cloud_reconciliations_status ON cloud_reconciliation_plans(status);

