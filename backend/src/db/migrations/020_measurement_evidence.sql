ALTER TABLE slo_evaluations ADD COLUMN window_evidence jsonb NOT NULL DEFAULT '{}';
ALTER TABLE normalized_events DROP CONSTRAINT uq_normalized_event_tenant;
ALTER TABLE normalized_events ADD CONSTRAINT uq_normalized_event_scope UNIQUE(tenant_id,environment,source_system,source_ref_id,event_type);
