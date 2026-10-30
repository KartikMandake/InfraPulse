-- Migration 005: Safe Automated Remediation & Runbook Orchestration
-- Durable tables for runbook catalog, versions, executions, step tracking, approvals, and immutable action logs.

-- 1. Runbooks Catalog Table
CREATE TABLE IF NOT EXISTS runbooks (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  execution_mode VARCHAR(20) NOT NULL CHECK (execution_mode IN ('diagnostic', 'remediation')),
  supported_incident_types JSONB NOT NULL DEFAULT '[]',
  applicable_services JSONB NOT NULL DEFAULT '["*"]',
  preconditions JSONB NOT NULL DEFAULT '[]',
  expected_outcome TEXT NOT NULL,
  verification_procedure TEXT NOT NULL,
  rollback_procedure TEXT,
  required_approval_role VARCHAR(20) NOT NULL DEFAULT 'responder' CHECK (required_approval_role IN ('admin', 'responder')),
  version INT NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Runbook Versions Table (Immutable definition history)
CREATE TABLE IF NOT EXISTS runbook_versions (
  id VARCHAR(64) PRIMARY KEY,
  runbook_id VARCHAR(64) NOT NULL REFERENCES runbooks(id) ON DELETE CASCADE,
  version INT NOT NULL,
  definition JSONB NOT NULL,
  changelog TEXT,
  created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_runbook_version UNIQUE (runbook_id, version)
);

-- 3. Runbook Executions Table
CREATE TABLE IF NOT EXISTS runbook_executions (
  id VARCHAR(64) PRIMARY KEY,
  runbook_id VARCHAR(64) NOT NULL REFERENCES runbooks(id) ON DELETE RESTRICT,
  runbook_version INT NOT NULL,
  incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE SET NULL,
  target_service_id VARCHAR(64) NOT NULL,
  execution_mode VARCHAR(20) NOT NULL CHECK (execution_mode IN ('diagnostic', 'remediation')),
  risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  plan_hash VARCHAR(64) NOT NULL,
  dry_run_plan JSONB NOT NULL,
  preconditions_met BOOLEAN NOT NULL DEFAULT FALSE,
  precondition_details JSONB DEFAULT '[]',
  requested_by VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  compensation_status VARCHAR(30) DEFAULT 'NOT_NEEDED' CHECK (compensation_status IN ('NOT_NEEDED', 'EXECUTED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Runbook Execution Steps Table
CREATE TABLE IF NOT EXISTS runbook_execution_steps (
  id VARCHAR(64) PRIMARY KEY,
  execution_id VARCHAR(64) NOT NULL REFERENCES runbook_executions(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  adapter_action VARCHAR(64) NOT NULL,
  is_remediation BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'COMPENSATED')),
  parameters JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  CONSTRAINT uq_execution_step UNIQUE (execution_id, step_number)
);

-- 5. Remediation Approvals Table
CREATE TABLE IF NOT EXISTS remediation_approvals (
  id VARCHAR(64) PRIMARY KEY,
  execution_id VARCHAR(64) NOT NULL REFERENCES runbook_executions(id) ON DELETE CASCADE,
  runbook_id VARCHAR(64) NOT NULL REFERENCES runbooks(id) ON DELETE RESTRICT,
  runbook_version INT NOT NULL,
  plan_hash VARCHAR(64) NOT NULL,
  risk_level VARCHAR(20) NOT NULL,
  required_role VARCHAR(20) NOT NULL CHECK (required_role IN ('admin', 'responder')),
  requested_by VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approver_id VARCHAR(64) REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  approval_notes TEXT,
  two_factor_confirmed BOOLEAN DEFAULT FALSE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

-- 6. Remediation Action Logs Table (Immutable audit trail)
CREATE TABLE IF NOT EXISTS remediation_action_logs (
  id VARCHAR(64) PRIMARY KEY,
  execution_id VARCHAR(64) NOT NULL REFERENCES runbook_executions(id) ON DELETE CASCADE,
  step_id VARCHAR(64) REFERENCES runbook_execution_steps(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  adapter_type VARCHAR(32) NOT NULL DEFAULT 'simulation',
  target_service_id VARCHAR(64) NOT NULL,
  parameters JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('success', 'failure', 'compensation_success', 'compensation_failure')),
  executed_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Isolation Indexes
CREATE INDEX IF NOT EXISTS idx_runbooks_risk ON runbooks(risk_level, execution_mode);
CREATE INDEX IF NOT EXISTS idx_runbooks_enabled ON runbooks(enabled);
CREATE INDEX IF NOT EXISTS idx_runbook_executions_incident ON runbook_executions(incident_id);
CREATE INDEX IF NOT EXISTS idx_runbook_executions_status ON runbook_executions(status);
CREATE INDEX IF NOT EXISTS idx_runbook_executions_requested_by ON runbook_executions(requested_by);
CREATE INDEX IF NOT EXISTS idx_runbook_executions_idempotency ON runbook_executions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_runbook_execution_steps_exec ON runbook_execution_steps(execution_id, step_number);
CREATE INDEX IF NOT EXISTS idx_remediation_approvals_exec ON remediation_approvals(execution_id);
CREATE INDEX IF NOT EXISTS idx_remediation_approvals_status ON remediation_approvals(status);
CREATE INDEX IF NOT EXISTS idx_remediation_action_logs_exec ON remediation_action_logs(execution_id, created_at ASC);

