-- Apply with a privileged migration identity. HTTP queries SET LOCAL ROLE to a
-- NOLOGIN/NOBYPASSRLS identity, including when the connection owner is postgres.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='infrapulse_tenant_runtime') THEN
    CREATE ROLE infrapulse_tenant_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT infrapulse_tenant_runtime TO %I',current_user);
END $$;
GRANT USAGE ON SCHEMA public TO infrapulse_tenant_runtime;
ALTER ROLE infrapulse_tenant_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE TABLE cloud_emergency_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  active boolean NOT NULL DEFAULT false,
  enabled_at timestamptz, enabled_by text, reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cloud_emergency_state(singleton,active) VALUES(true,false);
GRANT SELECT,UPDATE ON cloud_emergency_state TO infrapulse_tenant_runtime;

CREATE TABLE telemetry_deduplication (
  tenant_id varchar(64) NOT NULL,
  environment varchar(50) NOT NULL,
  provider varchar(100) NOT NULL,
  telemetry_type varchar(30) NOT NULL,
  event_key text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,environment,provider,telemetry_type,event_key)
);

-- Every application table carries ownership, including legacy core/auth tables.
-- Existing rows retain their historical default-tenant ownership.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename NOT IN ('schema_migrations','cloud_emergency_state') LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id varchar(64) NOT NULL DEFAULT ''default_tenant''',t.tablename);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT COALESCE(NULLIF(current_setting(''infrapulse.tenant_id'',true),''''),''default_tenant'')',t.tablename);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t.tablename);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t.tablename);
    EXECUTE format('CREATE POLICY tenant_membership ON %I TO infrapulse_tenant_runtime USING (tenant_id=current_setting(''infrapulse.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''infrapulse.tenant_id'',true))',t.tablename);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO infrapulse_tenant_runtime',t.tablename);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(tenant_id)', 'ix_tenant_'||t.tablename,t.tablename);
  END LOOP;
END $$;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO infrapulse_tenant_runtime;

-- Child rows cannot reference an entity belonging to a different tenant, even
-- when a globally unique foreign ID is known to the caller.
CREATE FUNCTION enforce_tenant_foreign_keys() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f record; child_key text; parent_tenant text; BEGIN
  FOR f IN SELECT a.attname child_column,b.attname parent_column,c.confrelid::regclass parent_table
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=c.confkey[1]
    WHERE c.contype='f' AND c.conrelid=TG_RELID AND array_length(c.conkey,1)=1
      AND EXISTS(SELECT 1 FROM pg_attribute p WHERE p.attrelid=c.confrelid AND p.attname='tenant_id') LOOP
    child_key=to_jsonb(NEW)->>f.child_column;
    IF child_key IS NOT NULL THEN
      EXECUTE format('SELECT tenant_id FROM %s WHERE %I::text=$1',f.parent_table,f.parent_column) INTO parent_tenant USING child_key;
      IF parent_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Cross-tenant relation prohibited' USING ERRCODE='42501'; END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('schema_migrations','cloud_emergency_state') LOOP
    EXECUTE format('CREATE TRIGGER tenant_relations BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_tenant_foreign_keys()',t.tablename);
  END LOOP;
END $$;

ALTER TABLE normalized_events DROP CONSTRAINT uq_normalized_event;
ALTER TABLE normalized_events ADD CONSTRAINT uq_normalized_event_tenant UNIQUE(tenant_id,source_system,source_ref_id,event_type);

-- Do not silently rewrite historical conflicting executions. A migration must
-- stop for operator reconciliation if more than one is still marked active.
CREATE UNIQUE INDEX uq_active_remediation_resource ON remediation_executions(tenant_id,resource_id) WHERE status='EXECUTING';
ALTER TABLE remediation_executions DROP CONSTRAINT remediation_executions_idempotency_key_key;
ALTER TABLE remediation_executions ADD CONSTRAINT uq_remediation_tenant_idempotency UNIQUE(tenant_id,idempotency_key);
ALTER TABLE infra_remediation_approvals ADD COLUMN approved_plan_hash text;
-- Legacy approvals have not reviewed the new canonical content hash.
UPDATE infra_remediation_approvals SET approval_status='REVOKED',revocation_reason='Canonical plan integrity upgrade: a new version and approval are required.' WHERE approval_status IN ('APPROVED','PENDING_SECOND_APPROVAL');
CREATE FUNCTION reject_plan_payload_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (to_jsonb(OLD)-'is_current_version') IS DISTINCT FROM (to_jsonb(NEW)-'is_current_version') THEN
    RAISE EXCEPTION 'Immutable plan payload: create a new version' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_plan BEFORE UPDATE ON remediation_plans FOR EACH ROW EXECUTE FUNCTION reject_plan_payload_update();
