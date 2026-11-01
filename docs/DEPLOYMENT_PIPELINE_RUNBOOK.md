# Deployment pipeline runbook

Phase 25 provides **manual, protected, plan-only** staging/production workflows. No deploy, registry login/push, cloud API mutation, SSH, migration against real data or rollback execution is implemented. A valid plan returns **BLOCKED / deploymentEnabled:false**; that is not a production success. Application release gates remain closed under [Phase 24](PHASE_24_DEPLOYMENT_PREPARATION_REPORT.md).

## Before running anything on GitHub

An owner must separately review the uncommitted workflow/script changes and authorize any future repository update or workflow run. No such Git operation or dispatch was performed here. Verify GitHub hosted-runner/artifact allowances and repository visibility before incurring work; no paid plan/service is required or activated by this local preparation.

Configure `release-review`, `staging` and `production` environments manually through approved repository administration. Require independent reviewers, prevent self-review, restrict to protected main, inspect administrator-bypass settings and use least-privilege repository access. Configure required status checks including **Required CI** after an actual successful remote run establishes the check names. Do not store AWS/SSH/registry credentials for these plan workflows; they have no use for them. Protection feature availability depends on repository visibility/plan. Missing/unreadable protection metadata fails preflight; this task did not create or verify any environment.

Review the remaining N01–N19, P24-01, bootstrap, actual Linux/TLS, recovery, ARM and budget blockers. CI is not the authority to waive them. Publishing a release or implementing deployment requires a separately authorized future phase.

## 1. CI and unpublished candidate

PR and main/master push CI installs all three lockfile trees, validates versions/workflows/security, initializes an empty disposable DB, runs the safe test selection and actual production-configuration/API smoke, tests/builds frontend assets, then builds/scans images. Review failed/cancelled/skipped required jobs; Required CI must fail in any of those cases.

For a candidate, manually select `release.yml` on main, supply the package version and `PREPARE ONLY`. It calls the complete CI with image-tar export enabled. Review the `release-review` gate and image/security reports, then inspect the unpublished `release-candidate-<version>-<commit>` artifact. Version/commit/image manifests and all file checksums must agree. Synthetic fixtures, source-only files or a screenshot of a green job are not real image evidence.

No GitHub tag, Release or registry push is made. Candidate retention is seven days; intermediate exported images expire after one day. Re-run the authorized preparation rather than accepting an expired/unverifiable artifact. All remote execution remains NOT TESTED in this phase.

## 2. Staging or production plan

Use the separate `staging.yml` or `production.yml` manual workflow. Inputs:

| Input | Meaning / validation |
|---|---|
| `version` | Exact semantic version of the candidate |
| `commit` | Full lowercase 40-character source SHA |
| `release_run_id` | Positive numeric successful manual `release.yml` run ID in the same repository/main |
| `current_version` | Operator-supplied current version; no live deployed-state lookup is performed |
| `backup_evidence` | JSON with **only** `archiveSha256`, `restoreVerified:true`, `newTargetOnly:true`; no credentials, paths or dump data |
| `acknowledgement` | Exactly `PLAN ONLY` |

The backup input is an **operator attestation structure**, not proof that this workflow created a backup or independently restored it. A reviewer must inspect the independent recovery evidence. Providing a hash without an actual verified restore must not be accepted operationally.

Preflight verifies a completed successful same-repository/main manual release run, matching source SHA, successful Required CI and an expected unexpired checksummed artifact. It checks existing environment reviewers, self-review prevention and protected-branch policy through the read-only GitHub API. The protected plan job then waits for that environment's review. It downloads the exact artifact ID, flattens that single artifact into its own candidate directory, verifies root/nested image manifests and file hashes, binds requested version/commit, checks the attestation and writes a blocked plan.

No real health request follows the plan: it records future health/readiness/auth/worker verification and failure-response steps only. Actual disposable API verification runs in CI integration; real TLS, schema compatibility, infrastructure identity and deployed-state health remain unverified.

## 3. Rejections and failure notification

Reject wrong/fork/PR/failed runs, mismatched source/version, unverified or expired artifacts, tampered files, invalid paths, missing review protections, invalid backup attestations and unexpected semantic downgrades. Failure emits a GitHub error annotation and workflow summary with rollback guidance. GitHub's ordinary notifications depend on owner preferences; no Slack/email connector or external message was configured/sent.

Do not change a failing security check to `continue-on-error`, override Required CI, remove environment protection, reuse production secrets in PRs or run a legacy test profile that enables AWS lifecycle execution. `--execute` is explicitly rejected. Environment variables cannot enable deployment because there is no execution implementation.

## 4. Future deployment verification and rollback

The owning operational procedures remain [PRODUCTION_DEPLOYMENT_RUNBOOK.md](PRODUCTION_DEPLOYMENT_RUNBOOK.md) and [PRODUCTION_ROLLBACK_PLAN.md](PRODUCTION_ROLLBACK_PLAN.md). Before a future execution feature is accepted, independently test real HTTPS/certificates/proxy headers, live/ready behavior, session/tenant/RBAC/governance, worker recovery, backup restoration/key/global-role bootstrap, schema compatibility and failure rollback on disposable infrastructure. Keep all infrastructure mutation flags false throughout this phase.

Rollback plans use [ROLLBACK_AUTOMATION.md](ROLLBACK_AUTOMATION.md). Do not delete volumes, overwrite the original DB, run automatic down-migrations or clear operation claims to force a rollback. Any future real cutover is a new authorization decision, not a consequence of approving a plan.

## Local validation

`npm run ci:policy`, `npm run release:check`, `npm run test:cicd`, frontend tests/build and the verified actionlint/Trivy tools can be run without a GitHub deployment. Database scripts require the explicit disposable contract; do not point them at an existing development/production DB. Phase-specific local harnesses are under `tests/runtime-validation/phase25*.mjs`; the setup initializes its own cluster and refuses existing state. One-off metadata/workflow/edit generators are historical preparation helpers, not normal release commands and must not be rerun over reviewed work.
