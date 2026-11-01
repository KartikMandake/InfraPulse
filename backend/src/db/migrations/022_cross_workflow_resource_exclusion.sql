-- Serialize resource claims across both lifecycle and remediation engines.
CREATE UNIQUE INDEX uq_active_cloud_resource ON cloud_lifecycle_operations(tenant_id,resource_id)
  WHERE status IN ('requested','approved','executing');
CREATE FUNCTION enforce_cross_workflow_resource_claim() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE collision boolean; BEGIN
  IF lower(NEW.status)<>'executing' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id||':'||NEW.resource_id,0));
  IF TG_TABLE_NAME='remediation_executions' THEN
    SELECT EXISTS(SELECT 1 FROM cloud_lifecycle_operations WHERE tenant_id=NEW.tenant_id AND resource_id=NEW.resource_id AND status='executing') INTO collision;
  ELSE
    SELECT EXISTS(SELECT 1 FROM remediation_executions WHERE tenant_id=NEW.tenant_id AND resource_id=NEW.resource_id AND status='EXECUTING') INTO collision;
  END IF;
  IF collision THEN RAISE EXCEPTION 'Resource is executing in another governed workflow' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cross_workflow_claim BEFORE INSERT OR UPDATE OF status ON remediation_executions FOR EACH ROW EXECUTE FUNCTION enforce_cross_workflow_resource_claim();
CREATE TRIGGER cross_workflow_claim BEFORE INSERT OR UPDATE OF status ON cloud_lifecycle_operations FOR EACH ROW EXECUTE FUNCTION enforce_cross_workflow_resource_claim();
