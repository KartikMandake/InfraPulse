# InfraPulse — Production Rollback Plan

> Historical plan. Use [current Phase 24 rollback/recovery](../PRODUCTION_ROLLBACK_PLAN.md). Preserve the original database and volumes; restore only into a newly verified empty target. No automatic schema downgrade or destructive restore is authorized.

**Phase 20 Release Engineering Deliverable**  
**Document Version**: 2.4.0  
**Target Release**: InfraPulse v2.4.0  

---

## 1. Rollback Trigger Criteria

A production rollback to the previous stable release must be initiated if any of the following critical conditions persist for more than 5 minutes following deployment:

1. **Health Check Failure**: Backend `/api/health/ready` or `/api/health/live` returns HTTP 5xx or fails health checks continuously across >50% of container instances.
2. **Database Incompatibility / Corruption**: Fatal relational migration error preventing normal database read/write queries.
3. **Elevated Error Rate**: Unhandled HTTP 500 error rate exceeds 1.0% across all API requests.
4. **Authentication / RBAC Lockout**: Responders or Admins cannot authenticate or access incident command consoles.
5. **Investigation Latency Degradation**: Investigation API endpoint p95 latency exceeds 1,500 ms under normal operational traffic.
6. **Notification Worker Starvation**: Notification dispatch queue latency exceeds 120 seconds or deliveries stall completely.

---

## 2. Fast Rollback Procedure (Containerized / Docker Compose)

```bash
# =========================================================================
# STEP 1: Notify On-Call Incident Commander & Halt Deployment Pipeline
# =========================================================================
echo "[ROLLBACK] Alerting SRE On-Call and locking deployment pipeline..."
# Notify in war room: #incidents-war-room

# =========================================================================
# STEP 2: Revert Container Images to Previous Stable Tag (e.g., v2.3.0)
# =========================================================================
cd /opt/infrapulse

# Export target rollback version
export INFRAPULSE_VERSION="v2.3.0"

# Revert images in docker-compose environment
sed -i 's/infrapulse-backend:v2.4.0/infrapulse-backend:v2.3.0/g' deploy/docker-compose.yml
sed -i 's/infrapulse-frontend:v2.4.0/infrapulse-frontend:v2.3.0/g' deploy/docker-compose.yml

# Re-deploy containers with previous stable image
docker compose -f deploy/docker-compose.yml up -d --no-build

# =========================================================================
# STEP 3: Verify Container Health
# =========================================================================
sleep 10
docker compose -f deploy/docker-compose.yml ps
curl -fsS http://localhost:5000/api/health/ready
curl -fsS http://localhost:8080/healthz

# =========================================================================
# STEP 4: Database Downward Schema Rollback (If Required)
# =========================================================================
# Migrations 001 through 010 are designed to be forward-compatible.
# If database schema changes must be rolled back:
export PGPASSWORD="<PROD_DB_PASSWORD>"
psql -h <DB_HOST> -p 5434 -U <DB_USER> -d infrapulse -c "
  BEGIN;
  -- Remove Migration 010 tables if rolled back prior to Phase 19:
  -- DROP TABLE IF EXISTS integration_webhook_deliveries, integration_health_events, integration_credentials, integration_configs;
  -- DELETE FROM schema_migrations WHERE migration_name = '010_integrations_ecosystem.sql';
  COMMIT;
"
```

---

## 3. Post-Rollback Verification Checklist

- [ ] Backend health checks return HTTP 200 (`/api/health/ready`).
- [ ] Active incidents and alerts load correctly on dashboard.
- [ ] Incident investigation and RCA engine return diagnostic scores without error.
- [ ] Responders can log in and view telemetry graphs.
- [ ] Notification deliveries resume normal dispatch.
- [ ] SRE Incident Commander marks incident resolved and begins postmortem.

