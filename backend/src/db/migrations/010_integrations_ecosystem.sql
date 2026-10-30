-- Migration 010: Enterprise Integrations & Platform Ecosystem
-- Durable tables for multi-tenant integrations, encrypted credentials at rest (AES-256-GCM),
-- sync states, idempotent webhook deliveries, and health transition events.

-- 1. Integrations Master Table
CREATE TABLE IF NOT EXISTS integrations (
  id VARCHAR(64) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED' CHECK (status IN ('DISCONNECTED', 'CONNECTED', 'DEGRADED', 'ERROR')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  error_message TEXT,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Integration Credentials Table (Encrypted at Rest with AES-256-GCM)
CREATE TABLE IF NOT EXISTS integration_credentials (
  id VARCHAR(64) PRIMARY KEY,
  integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  key_version INT NOT NULL DEFAULT 1,
  encrypted_data TEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  auth_tag VARCHAR(64) NOT NULL,
  redacted_preview JSONB NOT NULL DEFAULT '{}',
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Integration Sync State Table
CREATE TABLE IF NOT EXISTS integration_sync_state (
  id VARCHAR(64) PRIMARY KEY,
  integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  cursor VARCHAR(255),
  last_event_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}',
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Integration Webhook Deliveries Table (Idempotent Webhook Processing)
CREATE TABLE IF NOT EXISTS integration_webhook_deliveries (
  id VARCHAR(64) PRIMARY KEY,
  integration_id VARCHAR(64) REFERENCES integrations(id) ON DELETE SET NULL,
  provider VARCHAR(50) NOT NULL,
  delivery_id VARCHAR(128),
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'REJECTED')),
  retry_count INT NOT NULL DEFAULT 0,
  payload_preview JSONB NOT NULL DEFAULT '{}',
  error_details TEXT,
  processed_at TIMESTAMPTZ,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Integration Health Events Table
CREATE TABLE IF NOT EXISTS integration_health_events (
  id VARCHAR(64) PRIMARY KEY,
  integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  previous_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  latency_ms INT,
  metadata JSONB NOT NULL DEFAULT '{}',
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default_tenant',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Analytical & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status, enabled);
CREATE INDEX IF NOT EXISTS idx_integration_credentials_int ON integration_credentials(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_sync_int ON integration_sync_state(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_deliv ON integration_webhook_deliveries(integration_id, delivery_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_status ON integration_webhook_deliveries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_health_int ON integration_health_events(integration_id, recorded_at DESC);

