# Rollback automation foundation

Phase 25 implements **validation and planning only**. No live rollback, image load/start, volume operation, database restore or infrastructure request is performed. The owning data-preservation procedure remains [PRODUCTION_ROLLBACK_PLAN.md](PRODUCTION_ROLLBACK_PLAN.md); this document describes the automation boundary rather than duplicating it.

## Previous version and evidence

`rollback.yml` is manual, defaults to staging and reuses `deployment-plan.yml`. Select a previous **validated candidate**, its exact source SHA and successful main manual release run ID. Supply the current version, `PLAN ONLY` and independently reviewed backup/restore attestation. Current deployed state is operator supplied, **not discovered from a real service**.

The previous target version must compare strictly older than current using semantic/prerelease ordering. The artifact must originate from the trusted release workflow and pass byte-size/hash/path/extra-file checks. Nested image metadata must match candidate version/commit, contain the backend/frontend pair, valid content IDs, scanned status, exact commit/version tags and nonempty image archive files. Worker uses the same backend image. Mutable `latest` names or an arbitrary uploaded file do not identify a validated prior version.

Local image IDs are not registry pull digests, and archive checksum verification does not prove that an image was loaded or ran successfully. Actual previous-image runtime, registry provenance/signatures and schema compatibility remain required before a future live rollback feature. Current automation contains no registry/cloud credentials or execution command.

## Approval and failure detection

The same read-only GitHub provenance checks and protected-environment reviewer/self-review/branch gates apply to rollback plans. The operator attestation requires a 64-hex archive hash, a verified restore and new-target-only recovery. It does not automatically back up a DB or authenticate a human assertion; reviewers must inspect the underlying evidence. Administrator-bypass restrictions require separate owner review, not an invented REST field.

Plan rejection is immediate for version-order, CI/provenance, approval, artifact integrity or attestation failures. The plan lists future triggers: failed readiness/authentication, authorization or plan/approval errors, duplicate/partial operations, sustained 5xx, queue/worker degradation, missing backup proof or unexpected cost/security exposure. These are **verification requirements**, not a live monitoring integration. Failures create workflow annotations; no external alert was sent in this phase.

## Execution remains blocked

Even a valid rollback plan returns `status: BLOCKED`, `deploymentEnabled: false`, with empty cloud-operation and health-request arrays. `--execute` fails. Synthetic candidate artifacts require explicit `--simulation`; GitHub plan workflows do not pass that flag. No repository variable or approval can turn this implementation into a deployment engine.

Before adding real execution, resolve N01–N19/P24-01, verify the actual current and previous images, rehearse schema backward compatibility or a new-target restore/cutover, test HTTP/batch drain and interrupted-provider recovery, and establish independent authorization/health verification. Never automatically downgrade schema, delete persistent volumes, restore over the source DB or erase forensic operation state. A backup checkpoint may lose later writes; an owner must explicitly reconcile them.

## Executed validation

Twenty-two release/security regression cases include version ordering, huge numeric prerelease comparison, tampered/unlisted/missing/duplicate/traversing files, untrusted GitHub runs, missing protections/approval/backup, unsafe test DBs and disabled execution. Actual source/frontend packaging and checksums were exercised with **synthetic image archives**. Four simulated staging/production deploy/rollback plans remained blocked, and a real CLI run accepted only explicit simulation and rejected execution. [Simulation evidence](../reports/phase25/release-simulation.json), [CLI evidence](../reports/phase25/cli-dry-run.json).

**BLOCKED / NOT TESTED:** real GitHub approval/denial, expired artifact download, previously built image runtime, actual rollback/failure detection, real post-rollback HTTPS/auth/worker health and production data/schema recovery. Synthetic tests do not establish operational rollback readiness.
