-- Migration 003: Notification Channels, Preferences, and Delivery Queue

-- 1. Notification Channels Table
CREATE TABLE IF NOT EXISTS notification_channels (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('slack', 'email', 'webhook')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Notification Preferences Table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id VARCHAR(64) PRIMARY KEY,
  channel_id VARCHAR(64) NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  min_severity VARCHAR(16) DEFAULT 'SEV-2',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Notification Deliveries Table
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id VARCHAR(64) PRIMARY KEY,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  channel_id VARCHAR(64) REFERENCES notification_channels(id) ON DELETE SET NULL,
  channel_type VARCHAR(32) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  incident_id VARCHAR(64),
  recipient VARCHAR(255),
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_channels_type ON notification_channels(type);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_channel ON notification_preferences(channel_id, event_type);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_retry ON notification_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_incident ON notification_deliveries(incident_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at ON notification_deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_idempotency ON notification_deliveries(idempotency_key);
