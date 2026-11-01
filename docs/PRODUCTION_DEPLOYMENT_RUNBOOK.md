# Gated production deployment runbook

Prepared 2026-11-01. **DO NOT DEPLOY NOW.** This phase prepared and tested local foundations only. Five P0 and fourteen other Phase 23N findings remain open, production DB-role authentication fails, Docker/Kubernetes runtime and archival recovery remain unverified, and the ₹0 budget is not established. No command below authorizes AWS resource creation, cloud lifecycle mutations or changes to an existing database.

Use [architecture](PRODUCTION_DEPLOYMENT_ARCHITECTURE.md), [configuration](PRODUCTION_ENVIRONMENT_CONFIGURATION.md), [costs](PRODUCTION_COST_ESTIMATES.md) and [rollback/recovery](PRODUCTION_ROLLBACK_PLAN.md) as the owning references. This runbook avoids duplicating the old staging/demo instructions, which are not a production procedure.

## 1. Release evidence before any deployment

The release owner must close and independently retest N01–N19, especially approval bypass, mutable approved lifecycle requests, concurrent duplicate dispatch, live-resource classification and interrupted-operation recovery. Validate tenant isolation/RBAC/plan binding/audit integrity, controlled first-admin onboarding, actual tag restrictions, disabled-by-default lifecycle paths and explicit approvals/kill switch without any security bypass. Do not use a disabled flag or green unit tests to waive these findings.

Required evidence also includes:

- A working least-privilege auth/runtime DB identity (P24-01), separate migration/backup admin, and a rehearsal of all 22 migrations under the intended PostgreSQL/RDS privileges. Do not give the runtime identity superuser/BYPASSRLS or relax tenant policies to make login work.
- Verified container builds, image vulnerability/SBOM review, pinned reviewed digests, non-root filesystem/socket/secret access, health checks and actual Linux SIGTERM/drain/restart behavior on disposable resources. This machine cannot run those Docker tests.
- A production-sized isolated restore, global-role/grant bootstrap, off-host backup/key recovery, measured RPO/RTO, failure/retry and archival PITR evidence where required. Local logical restore is insufficient for a critical recovery gate.
- Budget/credits/account eligibility and complete recurring-charge review; saved ap-south-1 cost estimate and monitoring plan. No free/₹0 assumption is permitted.
- Approved account identity/region and existing infrastructure inventory, DNS/domain/TLS/renewal, SG/private routing, outbound connectivity, alert delivery, retention, backup destinations and operational ownership. No production or shared cluster may be repurposed for rehearsal.
- Supported image/runtime versions and dependency audits; CI execution evidence from the actual release. Local editing of a workflow is not a green remote CI run. There is no automatic deployment/push step in the prepared workflow.

**If any gate is failing, unverified or unbudgeted: stop promotion.** Record FAIL/BLOCKED/NOT TESTED and continue preparation in an isolated environment. Do not activate cloud schedules or infrastructure execution.

## 2. Prepare immutable artifacts and external configuration

Build and test backend/frontend artifacts in CI using Node 24 and existing lockfiles. Image builds must exclude all `.env*` files and secrets; inspect the resulting layers and effective user. Publish/store artifacts only through a separately authorized release process. Keep the previous tested image/config set available for rollback; no Git operation is required by this runbook.

Select the approved PostgreSQL 16 digest and confirm storage compatibility. Pre-create and verify the **explicit external** PG data volume on encrypted persistent storage through the approved infrastructure process. Verify expected dataset identity, available space and permissions; do not let a typo create a fresh dataset. A never-initialized first deployment and an upgrade of existing data require different reviewed initialization plans.

Prepare external non-secret Compose variables, separate app/admin password files and the existing/new approved integration key, following the [environment guide](PRODUCTION_ENVIRONMENT_CONFIGURATION.md). Do not overwrite repository environment files or an existing encryption key. Configure an owned HTTPS origin and host certificate separately; replace `.invalid` template names.

Run preflights without printing secret values or full resolved configuration:

```text
node scripts/validate-production-config.mjs
node scripts/validate-production-compose.mjs --env-file /etc/infrapulse/runtime.conf
docker compose --env-file /etc/infrapulse/runtime.conf -f deploy/production/compose.yml config --quiet
```

The application validator must run with the reviewed target application's supplied environment; a Compose variable file is **not automatically exported** into a native shell. In a future container rehearsal, run it inside the selected application image with the same reviewed secret mounts and environment. Confirm UID 1000 can read only its mounted app secrets and connect to the Unix socket; regular API/worker must not mount the admin secret. Preflight PASS covers configuration only, not the release gates or actual image availability.

## 3. Backup and migration checkpoint

For an upgrade, restrict ingress/ingestion, drain the API and notification worker, and reconcile current operations/approvals/claims before the backup checkpoint. Do not delete records or reset claims to allow migration 022 to proceed. For a new installation, prepare controlled private administrator bootstrap; do not expose an empty database's public registration endpoint.

Use a native PostgreSQL 16 backup client with an explicitly selected source, approved external credentials and restricted output permissions. The existing `scripts/backup-db.*` wrappers default to development/staging targets and may fall back to named Docker containers; use them only with verified explicit arguments and native tooling. Never permit an automatic fallback to an existing user container.

```text
pg_dump --format=custom --no-owner --file <NEW_RESTRICTED_ARCHIVE> \
  --host <EXPLICIT_SOURCE_HOST> --port <EXPLICIT_SOURCE_PORT> \
  --username <BACKUP_ADMIN> --dbname <EXPLICIT_SOURCE_DATABASE>
pg_restore --list <NEW_RESTRICTED_ARCHIVE>
```

Do not omit ACLs; preserve runtime grants as well as RLS policies/triggers. `pg_restore --list` only checks archive readability. Record checksum, schema/version/key identifiers and an isolated restore result before continuing. Backups contain confidential data even when credentials are encrypted; store independently and encrypt at rest. Retain global-role bootstrap definitions separately without plaintext passwords.

Review ordered migrations 001–022 and their effects. Migration 019 creates/hardens the tenant role/policies and revokes old approvals; 022 enforces durable resource exclusion. Use **one separately reviewed migration process**, with admin credentials and access to the selected DB socket/private TLS endpoint. It must not be a permanent API/worker with admin permissions. A tested one-shot migration job and its mount/network placement are prerequisites; the runtime Compose draft intentionally contains no privileged migration service.

With that process's explicit migration environment, invoke the existing runner:

```text
node backend/src/db/migrate.js
```

Never run `db:seed` in production. Serialize migration execution externally: the runner has per-file transactions, but no global migration-job lock or applied-file checksum ledger. On failure, leave traffic closed; determine which files committed, retain the error/evidence and follow the [rollback plan](PRODUCTION_ROLLBACK_PLAN.md). Do not edit tracking rows or applied SQL. Rehearse corrections forward on a clone.

## 4. Future application startup

**Only after every preceding gate is met and a separate deployment is authorized**, start the selected four-service stack using the already prepared data volume and configuration. This command was **not executed** in Phase 24:

```text
docker compose --env-file /etc/infrapulse/runtime.conf -f deploy/production/compose.yml up -d --no-build
```

For staging, use a separate project name/data volume/domain and consistent `APP_ENV=staging`; never point a rehearsal at production data. Avoid concurrent old/new workers or API versions during migrations. Confirm PG has TCP disabled and SCRAM effective on the existing volume; init flags do not retrofit old HBA entries. The container health dependencies do not establish migration completion or correct runtime auth permissions.

Install/test the reviewed host TLS proxy configuration through the authorized host process. Only 443/approved 80 and restricted administrative ingress should be public. Never expose API/PG/8080/telemetry ports. Verify the exact proxy chain, IP forwarding, certificates and renewal before opening public traffic. The supplied host/frontend Nginx templates have not been executed locally.

## 5. Health and smoke verification

1. Verify frontend `/healthz`, API `/api/health/live` and DB-backed `/api/health/ready`. Readiness 200 only proves its dependency probe, not business authorization or recoverability. A 503 should remove API traffic while liveness stays 200 during a temporary DB outage. Monitor the worker health file/probe and first successful queue poll.
2. Over the real HTTPS edge, inspect chain/name/expiry, fixed-domain HTTP redirect, HSTS/security headers/CSP, exact CORS and absence of untrusted forwarded-header bypass. Verify HTML revalidation, hashed assets, SPA navigation and existing fonts/charts/topology with a browser. These real-edge/browser checks remain untested here.
3. In a controlled approved account, verify login, Secure/HttpOnly/SameSite cookie handling, correlation IDs, role restrictions and authenticated tenant reads. Verify unauthenticated/cross-tenant requests fail, invalid CORS/CSRF writes fail, and authentication bursts are limited. Never copy bearer/session tokens into evidence.
4. Verify plan hashes, requester/approver separation, approved-action/resource binding, expiry, durable emergency freeze, audit actor/immutability/redaction and duplicate/concurrent-operation safety using mocks/disposable local resources. **No AWS mutation** is part of the smoke test. Keep all five infrastructure execution flags false; no live schedule activation.
5. Inspect queue backlog, oldest pending notification, delivery retries and duplicate protection with a disposable test destination. Confirm actual operational alerting separately; no provider is configured by the core Compose draft. The standalone worker does not implement lifecycle scheduling/recovery.
6. Confirm backup freshness, independent storage/key access, disk/WAL headroom, pool reservations and monitoring. Compare observed resource use with the planning estimates; local idle measurements are not load-test evidence.

A release owner records actual evidence and PASS/FAIL/BLOCKED/NOT TESTED for each gate. Any critical security/governance/recovery failure returns to NO-GO.

## 6. Rollback and post-deployment checks

Use [PRODUCTION_ROLLBACK_PLAN.md](PRODUCTION_ROLLBACK_PLAN.md). Application rollback retains current data; database recovery restores into a new target and requires a deliberate cutover. Never remove volumes or downgrade user data automatically. For 24 hours after a future rollout, monitor errors, latency, worker/queue health, tenant/audit correctness, disk/WAL growth, backup freshness and cost. Verify the previous image/config set remains usable and document any unresolved operation state.

## Executed preparation scope

This phase ran native isolated PostgreSQL migrations/restore/failure injection, application tests and production-mode local processes, plus static Compose/Kustomize validation. No production deployment, image publish, cloud resource mutation, real container lifecycle or Kubernetes application occurred. See [recorded results](PHASE_24_DEPLOYMENT_PREPARATION_REPORT.md).
