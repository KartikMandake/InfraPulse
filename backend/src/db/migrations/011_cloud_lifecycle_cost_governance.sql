-- ==============================================================================
-- InfraPulse Migration 011: Cloud Resource Lifecycle & Cost Governance
-- Phase 23C: Multi-Cloud, Docker & Kubernetes Lifecycle Management
-- ==============================================================================

-- 1. Cloud Resources Inventory
CREATE TABLE IF NOT EXISTS cloud_resources (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- 'aws', 'docker', 'kubernetes', 'mock'
  resource_type VARCHAR(100) NOT NULL, -- 'ec2_instance', 'docker_compose_service', 'k8s_deployment', 'k8s_statefulset', 'rds_instance', 'eks_cluster'
  region VARCHAR(50) NOT NULL DEFAULT 'ap-south-1',
  environment VARCHAR(50) NOT NULL DEFAULT 'staging', -- 'staging', 'production', 'local'
  current_state VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'stopped', 'starting', 'stopping', 'error', 'scaled_down'
  estimated_hourly_cost NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  cost_breakdown JSONB NOT NULL DEFAULT '{}',
  dependencies JSONB NOT NULL DEFAULT '[]',
  persistence_requirements JSONB NOT NULL DEFAULT '{}',
  is_critical_dependency BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  last_lifecycle_operation VARCHAR(50),
  last_operation_at TIMESTAMPTZ,
  last_health_check_status VARCHAR(50) DEFAULT 'healthy',
  last_health_check_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_resources_provider ON cloud_resources(provider);
CREATE INDEX IF NOT EXISTS idx_cloud_resources_state ON cloud_resources(current_state);
CREATE INDEX IF NOT EXISTS idx_cloud_resources_env ON cloud_resources(environment);

-- 2. Cloud Lifecycle Operations & Approvals
CREATE TABLE IF NOT EXISTS cloud_lifecycle_operations (
  id VARCHAR(100) PRIMARY KEY,
  resource_id VARCHAR(100) NOT NULL REFERENCES cloud_resources(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'start', 'stop', 'restart', 'scale_up', 'scale_down', 'inspect', 'health_check'
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'dry_run_passed', 'dry_run_failed', 'pending_approval', 'approved', 'executing', 'completed', 'failed', 'cancelled'
  is_dry_run BOOLEAN NOT NULL DEFAULT false,
  safety_checks JSONB NOT NULL DEFAULT '{}',
  requested_by VARCHAR(100) NOT NULL,
  requester_role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  approved_by VARCHAR(100),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  execution_logs JSONB NOT NULL DEFAULT '[]',
  idempotency_key VARCHAR(255) UNIQUE,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_operations_resource ON cloud_lifecycle_operations(resource_id);
CREATE INDEX IF NOT EXISTS idx_cloud_operations_status ON cloud_lifecycle_operations(status);
CREATE INDEX IF NOT EXISTS idx_cloud_operations_idempotency ON cloud_lifecycle_operations(idempotency_key);

-- 3. Automated Weekday & Overnight Schedules
CREATE TABLE IF NOT EXISTS cloud_schedules (
  id VARCHAR(100) PRIMARY KEY,
  resource_id VARCHAR(100) NOT NULL REFERENCES cloud_resources(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'start', 'stop', 'scale_down'
  cron_expression VARCHAR(100) NOT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  days_of_week JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
  time_of_day VARCHAR(10) NOT NULL DEFAULT '20:00',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  missed_execution_recovery BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_schedules_resource ON cloud_schedules(resource_id);
CREATE INDEX IF NOT EXISTS idx_cloud_schedules_enabled ON cloud_schedules(enabled);

-- 4. Cloud Cost Projections & Budget Estimates
CREATE TABLE IF NOT EXISTS cloud_cost_estimates (
  id VARCHAR(100) PRIMARY KEY,
  environment VARCHAR(50) NOT NULL,
  total_hourly_compute NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  total_hourly_storage NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  total_hourly_ipv4 NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  total_hourly_networking NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  total_hourly_managed NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  estimated_daily_total NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  estimated_monthly_total NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  estimated_monthly_savings NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  ongoing_monthly_storage_cost NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  is_simulated BOOLEAN NOT NULL DEFAULT true,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_cost_estimates_env ON cloud_cost_estimates(environment);

