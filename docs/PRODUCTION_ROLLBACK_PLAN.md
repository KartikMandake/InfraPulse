# Production rollback and recovery plan

Prepared 2026-11-01. This is a future operator plan, **not an instruction to deploy or restore now**. Production remains NO-GO under the [Phase 24 report](PHASE_24_DEPLOYMENT_PREPARATION_REPORT.md). Historical Phase 20 database-drop recovery instructions must not be used on an existing source database. Use the existing backup tools only with an explicitly selected target/CLI; the old restore wrappers use `--clean` and are not the preferred production recovery entrypoint.

## Rollback triggers and immediate response

Stop release promotion on failed readiness/authentication/tenant isolation, unknown migration state, approval/kill-switch failure, duplicate operations, sustained 5xx/latency/queue growth, unexpected secret/network exposure, restore mismatch, disk pressure or an unverified cost/budget assumption. A healthy liveness probe alone does not justify continuing.

Keep every infrastructure execution flag false and apply the durable emergency freeze through the reviewed operator procedure if necessary. Freeze prevents new guarded requests; it cannot cancel provider requests already sent. Preserve approvals, resource claims, operation history and evidence; N11 means an executing claim may need explicit reconciliation. Do not clear locks or delete operation rows simply to restore service.

Record image digests, config/key versions, schema migration set, start/stop times, affected requests and the chosen backup checkpoint. Restrict ingress/ingestion and stop/drain the notification worker to prevent duplicate external effects. Preserve database and forensic logs. Do not emit tokens/credentials in incident notes.

## Application rollback with compatible schema

1. Select the previous **tested immutable backend, worker and frontend digests**, with their corresponding reviewed proxy/configuration. Confirm old code supports the current database schema and ciphertext/key version. No compatibility evidence means stop; do not guess.
2. Drain API requests and the active notification batch within the configured deadline. Timeout is an unsuccessful drain; inspect operation/delivery state before restarting. Do not use a forced kill as normal rollback.
3. Retain the current database, external persistent volume and encryption secrets. Restore application image/config references only. Start one API/worker instance at a time; avoid concurrent workers until duplicate-delivery risk is assessed.
4. Verify ready/live endpoints, authenticated tenant read/write, security headers/cookies, error sanitization, worker health, queue state and audit/approval behavior. Confirm all execution flags remain false and no live schedule is activated.
5. Serve the matching frontend with HTML revalidation and hashed-asset caching. Retain prior assets through the rollback window or refresh cached clients; do not assume old browser bundles instantly disappear.

No `down -v`, volume removal, database drop, automatic down-migration, schema reset, destructive restore or infrastructure mutation is part of application rollback. Do not redeploy a prior image if its migration compatibility has not been rehearsed.

## Database recovery into a new target

Logical backup is the exercised recovery mechanism. Production recovery requires an immutable/verified archive, matching PostgreSQL tooling, the source schema/config/key versions, a safe migration/backup identity, sufficient extra disk, and an **empty newly created target**. Never overwrite the original database or an existing target.

1. Quiesce application writes/deliveries and record the recovery checkpoint. Create an independent snapshot/logical archive if the source remains accessible. Record archive SHA-256, source/version/time and restore-tool version. Preserve the original encrypted integration key separately.
2. Provision a disposable/new recovery target using an approved process, not this phase. Verify target hostname/database/volume differ from the source and that its public schema is empty. A cross-account/region or new-host recovery needs its own rehearsal and budget.
3. Bootstrap necessary **global NOLOGIN policy roles** and reviewed administrator/runtime memberships before restoring. `pg_dump` does not back up cluster-wide roles. Preserve application grants: do **not** exclude ACLs and then assume RLS runtime access still works. Do not bootstrap a runtime superuser or BYPASSRLS identity.
4. With credentials supplied through the approved external mechanism, restore using the native CLI; placeholders below are documentation only:

```text
pg_restore --single-transaction --exit-on-error --no-owner \
  --host <NEW_TARGET_HOST> --port <NEW_TARGET_PORT> \
  --username <RESTORE_ADMIN> --dbname <NEW_EMPTY_DATABASE> <VERIFIED_ARCHIVE>
```

There is deliberately no `--clean`, `--create` or database-drop step. Do not rerun against a partially populated target: investigate and choose another fresh target. A failed transactional restore must be verified empty before reuse; preserve failed-target evidence.

5. Compare every application table's row count and deterministic data fingerprint at the selected checkpoint, migration names, constraints, indexes, triggers, RLS policies, runtime grants and encrypted-record usability with the preserved key. Verify intended-tenant access succeeds and another tenant cannot read it. Test authentication with the future least-privilege role after P24-01 is resolved.
6. Run the normal migration runner against the **new target only**, with a reviewed migration identity. It should report zero applied migrations for a current-schema archive. Older archives require an isolated forward-migration rehearsal; do not downgrade current schema or edit migration tracking to force success.
7. Point a private API/worker rehearsal at the recovered target, keeping mutation flags false. Validate business/auth/governance/queue behavior before a deliberate cutover. Prevent the old and recovered workers from dispatching the same notification. Preserve the source and reconcile writes made after the checkpoint before reopening traffic.
8. Keep the original database and recovery evidence intact during the approved retention window. A data-loss/cutover decision belongs to the incident owner with a recorded RPO; it must never be a silent side effect of an application rollback.

The Phase 24 native drill restored **74 tables / 158 rows**, matching all fingerprints and preserving tenant runtime SELECT grants and RLS. Source rows remained unchanged. The target was a fresh separate database on the owned local cluster. This proves neither clean-host/global-role bootstrap, RDS-role compatibility, production-sized throughput nor actual production recovery. [Recovery evidence](../reports/phase24/database-security-recovery.json).

## Migrations and partial failure

Current migrations 001–022 run in lexical order, each in its own transaction with its tracking insert. Earlier successful migrations remain if a later migration fails. An actual injected failing migration rolled back its DDL and tracking record on the disposable restore target; clean retry applied zero existing migrations. [Failure/retry evidence](../reports/phase24/migration-failure.json).

Do not run migration jobs concurrently: the current runner has no migration-wide advisory lock/checksum ledger. Serialize externally under one release owner. Do not edit an applied migration; review a corrective forward migration. Migration 019 needs role/policy administration and revokes legacy approvals; migration 022 may refuse conflicting active claims. Reconcile conflicts without deleting forensic history. An archive restore is not a schema down-migration.

## Backup policy and PITR boundary

Proposed policy, **not deployed**: nightly custom-format logical archive plus a pre-release checkpoint, encrypted off-host copies, 7 daily / 4 weekly retained checkpoints initially, daily freshness alerts and regular isolated restore drills. Adjust retention to data growth, legal/business requirements and storage budget. A nightly successful backup alone implies up to roughly 24 hours of data exposure; it is not a validated 24-hour RPO. A production RTO target of 60 minutes is a proposal requiring a full-sized timed drill.

For self-hosted archival PITR, a tested physical base backup plus an uninterrupted archived WAL chain, encryption/retention/monitoring and a separate recovery target are required. The local cluster has archival mode disabled; this phase configured no base-backup/WAL pipeline. A custom `pg_dump` archive cannot be replayed with WAL and must not be called archival PITR. [PostgreSQL continuous archiving](https://www.postgresql.org/docs/16/continuous-archiving.html).

RDS automated-backup/PITR is a candidate capability, not verified here. Recovery creates a new instance and must preserve private networking, parameters, keys, roles and cutover controls; costs apply. No RDS restore, snapshot, retention change or resource creation was attempted. [RDS recovery documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html).

**BLOCKED / NOT TESTED:** archival PITR, loss of the entire host/cluster/key store, off-host restore, actual RDS recovery, schema rollback compatibility between released image versions, production-scale RPO/RTO, real in-flight provider-operation recovery and external notification replay. These remain release gates; local logical restoration does not waive them.
