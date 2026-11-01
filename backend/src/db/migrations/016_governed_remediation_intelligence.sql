-- Migration 016: Governed Automated Remediation Intelligence
-- Phase 23J: Evidence-Backed RCA to Safe, Approval-Controlled Infrastructure Remediation

-- 1. Remediation Policy Rules
CREATE TABLE IF NOT EXISTS remediation_policy_rules (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  provider VARCHAR(32) NOT NULL DEFAULT 'all',
  resource_type VARCHAR(64) NOT NULL DEFAULT 'all',
  allowed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  denied_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_risk_level VARCHAR(32) NOT NULL DEFAULT 'HIGH',
  requires_two_person_approval BOOLEAN NOT NULL DEFAULT true,
  execution_window_start VARCHAR(10) DEFAULT '00:00',
  execution_window_end VARCHAR(10) DEFAULT '23:59',
  cooldown_minutes INT NOT NULL DEFAULT 15,
  max_retries INT NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Remediation Recommendations
CREATE TABLE IF NOT EXISTS remediation_recommendations (
  id VARCHAR(64) PRIMARY KEY,
  incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  service_id VARCHAR(64) NOT NULL,
  resource_id VARCHAR(64) NOT NULL,
  detected_problem TEXT NOT NULL,
  proposed_action VARCHAR(64) NOT NULL,
  expected_outcome TEXT NOT NULL,
  supporting_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_level VARCHAR(32) NOT NULL DEFAULT 'LOW',
  risk_score INT NOT NULL DEFAULT 20,
  risk_rationale TEXT NOT NULL,
  confidence_score NUMERIC(4,2) NOT NULL DEFAULT 0.85,
  blast_radius JSONB NOT NULL DEFAULT '{}'::jsonb,
  eligibility_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  blocking_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollback_strategy JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Versioned Remediation Plans
CREATE TABLE IF NOT EXISTS remediation_plans (
  id VARCHAR(64) PRIMARY KEY,
  recommendation_id VARCHAR(64) REFERENCES remediation_recommendations(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  version INT NOT NULL DEFAULT 1,
  action VARCHAR(64) NOT NULL,
  target_resource_id VARCHAR(64) NOT NULL,
  target_resource_name VARCHAR(128),
  provider VARCHAR(32) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  preconditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan_hash VARCHAR(64) NOT NULL,
  is_current_version BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Infrastructure Remediation Approvals & Separation of Duties
CREATE TABLE IF NOT EXISTS infra_remediation_approvals (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) REFERENCES remediation_plans(id) ON DELETE CASCADE,
  plan_version INT NOT NULL DEFAULT 1,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  requester_email VARCHAR(128) NOT NULL,
  requester_role VARCHAR(32) NOT NULL,
  approver_email VARCHAR(128),
  approver_role VARCHAR(32),
  second_approver_email VARCHAR(128),
  second_approver_role VARCHAR(32),
  approval_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT,
  revocation_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Remediation Executions & Verification
CREATE TABLE IF NOT EXISTS remediation_executions (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) REFERENCES remediation_plans(id) ON DELETE CASCADE,
  approval_id VARCHAR(64) REFERENCES infra_remediation_approvals(id) ON DELETE SET NULL,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  environment VARCHAR(32) NOT NULL DEFAULT 'staging',
  resource_id VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'EXECUTING',
  is_dry_run BOOLEAN NOT NULL DEFAULT false,
  executed_by VARCHAR(128) NOT NULL,
  pre_execution_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  post_execution_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_result VARCHAR(32),
  verification_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_executed BOOLEAN NOT NULL DEFAULT false,
  rollback_result JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT
);

-- 6. Remediation Execution Audit Events
CREATE TABLE IF NOT EXISTS remediation_execution_events (
  id VARCHAR(64) PRIMARY KEY,
  execution_id VARCHAR(64) REFERENCES remediation_executions(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  event_type VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Indexes for Query Performance & Isolation
CREATE INDEX IF NOT EXISTS idx_remediation_rec_tenant ON remediation_recommendations(tenant_id, environment, status);
CREATE INDEX IF NOT EXISTS idx_remediation_rec_incident ON remediation_recommendations(incident_id);
CREATE INDEX IF NOT EXISTS idx_remediation_rec_resource ON remediation_recommendations(resource_id);
CREATE INDEX IF NOT EXISTS idx_remediation_plan_rec ON remediation_plans(recommendation_id, version);
CREATE INDEX IF NOT EXISTS idx_infra_rem_approvals_tenant ON infra_remediation_approvals(tenant_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_infra_rem_approvals_plan ON infra_remediation_approvals(plan_id, plan_version);
CREATE INDEX IF NOT EXISTS idx_remediation_exec_tenant ON remediation_executions(tenant_id, environment, status);
CREATE INDEX IF NOT EXISTS idx_remediation_exec_resource ON remediation_executions(resource_id);
CREATE INDEX IF NOT EXISTS idx_remediation_exec_idempotency ON remediation_executions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_remediation_events_exec ON remediation_execution_events(execution_id, timestamp ASC);
