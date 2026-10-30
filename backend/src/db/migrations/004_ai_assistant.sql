-- Migration 004: AI-Powered Incident Investigation Assistant Conversations
-- Stores conversation sessions, user questions, assistant responses, and grounded evidence references.

-- 1. Assistant Conversations Table
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id VARCHAR(64) PRIMARY KEY,
  incident_id VARCHAR(64) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'Investigation Inquiry',
  provider VARCHAR(32) NOT NULL DEFAULT 'mock',
  model VARCHAR(64) NOT NULL DEFAULT 'mock-grounded-model',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Assistant Messages Table
CREATE TABLE IF NOT EXISTS assistant_messages (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  sender_role VARCHAR(16) NOT NULL CHECK (sender_role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  structured_response JSONB DEFAULT NULL,
  referenced_evidence JSONB DEFAULT '[]',
  supporting_signals JSONB DEFAULT '[]',
  contradictory_signals JSONB DEFAULT '[]',
  uncertainties JSONB DEFAULT '[]',
  suggested_diagnostics JSONB DEFAULT '[]',
  requires_human_verification BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Isolation Indexes
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_incident ON assistant_conversations(incident_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user ON assistant_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_updated_at ON assistant_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation ON assistant_messages(conversation_id, created_at ASC);

