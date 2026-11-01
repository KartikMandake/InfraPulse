-- ==============================================================================
-- InfraPulse Migration 012: AWS Read-Only Discovery Governance
-- Phase 23D: Read-only AWS resource discovery, identity verification & audit log
-- ==============================================================================

CREATE TABLE IF NOT EXISTS cloud_aws_discovery_runs (
  id VARCHAR(100) PRIMARY KEY,
  region VARCHAR(50) NOT NULL DEFAULT 'ap-south-1',
  status VARCHAR(50) NOT NULL DEFAULT 'success', -- 'success', 'failed', 'throttled', 'unauthorized'
  account_id_masked VARCHAR(50),
  caller_arn_masked VARCHAR(255),
  ec2_count INTEGER NOT NULL DEFAULT 0,
  ebs_count INTEGER NOT NULL DEFAULT 0,
  elastic_ip_count INTEGER NOT NULL DEFAULT 0,
  rds_count INTEGER NOT NULL DEFAULT 0,
  total_resources INTEGER NOT NULL DEFAULT 0,
  estimated_monthly_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  free_tier_status VARCHAR(100) NOT NULL DEFAULT 'Not verified (Requires billing delegation)',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  triggered_by VARCHAR(100) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_aws_discovery_runs_time ON cloud_aws_discovery_runs(created_at DESC);

