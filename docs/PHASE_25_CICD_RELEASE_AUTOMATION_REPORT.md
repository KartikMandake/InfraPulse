# Phase 25 — CI/CD and release automation report

Date: **2026-11-01**. Project: `D:\Projects\InfraPulse`. **Implementation and local validation delivered; GitHub execution NOT TESTED. Production deployment remains disabled and NO-GO.** No image, tag, GitHub Release, branch or deployment was published/created during this phase.

## Executive summary

The existing CI/benchmark workflows were reused and strengthened, with reusable manual candidate and protected plan-only staging/production/rollback foundations. Automated checks now cover lockfile installs, backend/frontend tests, isolated migrations and production-config/API smoke, versions, workflow permissions/pins, secret policies, dependency audits, builds, Dockerfile/image scanners and candidate integrity. The normal image behavior is build/validate only; no registry login/push path exists.

Actual local results: **336 backend/Phase 24 regression tests + 22 new CI/release security tests + 7 frontend tests = 365 passed; five live-provider tests skipped**. All 22 migrations applied and replayed idempotently on a new owned CI database. Frontend production build/asset checks, production startup configuration, actual loopback API/PostgreSQL integration, seven-workflow actionlint/security validation, three fresh lockfile installs, dependency audits and two Dockerfile Trivy scans passed. Candidate packaging/checksums and blocked deploy/rollback plans were exercised with explicitly simulated image/CI/approval/backup evidence.

**BLOCKED / NOT TESTED:** Docker image builds and actual image vulnerability scans (daemon unavailable); real GitHub job execution, action/runtime behavior, environment approval/denial/settings and artifact downloads; actual deployment/rollback, TLS edge and production recovery. The nineteen Phase 23N defects, including five P0 issues, and P24-01 remain unresolved. Passing local CI checks does not override them. See [Phase 24](PHASE_24_DEPLOYMENT_PREPARATION_REPORT.md).

No Git command/operation, remote workflow dispatch, real AWS account API call, AWS resource mutation, deployment, paid scanner activation or image/release publication occurred. All infrastructure execution flags remained false in executed tests. All seven protected environment files/templates match the starting snapshot. The original database and prior validation clusters were not accessed/modified; the owned Phase 25 cluster is stopped at completion and retained.

## Initial audit findings

The filesystem baseline captured 533 file hashes, including the new bootstrap harness, without Git commands. Existing workflows, all package scripts/lockfiles, test groups, Dockerfiles/Compose, security scanner, historical release conventions and the Phase 24 report were reviewed. Local HEAD metadata points to `main`; remote branch/tag/protection state was not queried or changed.

| Finding | Before | Phase 25 result |
|---|---|---|
| CI mutation fixtures | Root `npm test` invokes suites that enable AWS/Docker/Kubernetes/remediation flags | Explicit safe profile, immutable false flags/cleared identity sources, recorded exclusions; original tests/legacy command retained |
| Dependency audits | Backend/frontend `npm audit` ran without installing those dependency trees in the security job | All three lockfile trees installed and audited |
| Versions | Root/frontend 2.4.0, backend package/lock 1.0.0 | Application package/lock metadata unified at 2.4.0; validation and dry-run/write version tooling added; no release created |
| Supply-chain references | Floating action major tags and container base tags | Full upstream action SHA allowlist, published tool checksums and base/service manifest digests |
| Evidence | Limited upload coverage; no release manifests | Allowlisted TAP/build/policy/scan artifacts; nested candidate/image hashes and same-run exports |
| Production startup/integration | Configuration tests existed but CI did not launch the actual guarded production entrypoint | Disposable DB + allocated loopback port, production validation, health/HTTPS/auth/cookie/tenant requests, clean owned-child shutdown |
| Release/deployment/rollback | No workflow foundations | Manual candidate and separate staging/production/rollback wrappers using one protected plan implementation; execution absent |
| Benchmark | Weekly/manual with an arbitrary-looking target input and loose readiness wait | Fixed disposable local target, explicit DB identity, bounded ready polling; scheduled work opt-in to avoid unreviewed runner usage |
| Historical readiness | Earlier release documents claimed promotion readiness | Current README points to Phase 24/25 NO-GO evidence; old historical reports were preserved |

There is no ESLint configuration; Node syntax checks, Vite JSX compilation, workflow policy/actionlint and Dockerfile checks are named accurately rather than inventing a lint pass. No full application SAST or signed provenance service was activated.

## Workflow architecture and reuse

| File | Action | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | Modified | PR/main/master and reusable CI: backend, frontend, security/policy, build/scan, aggregate Required CI |
| `.github/workflows/benchmark.yml` | Modified | Preserve isolated performance purpose; optional weekly runner work and fixed local target |
| `.github/workflows/release.yml` | Created | Manual unpublished candidate after reusable CI and release-review environment |
| `.github/workflows/deployment-plan.yml` | Created | Shared trusted-run/artifact/protection preflight and protected blocked-plan job |
| `.github/workflows/staging.yml` | Created | Explicit staging manual wrapper |
| `.github/workflows/production.yml` | Created | Separate production wrapper; no execution toggle or implementation |
| `.github/workflows/rollback.yml` | Created | Older validated candidate/version planning, defaults staging |
| `.github/dependabot.yml` | Created | Reviewed action/npm update proposals; no auto-merge or service activation performed |

The workflows use read-only permissions, credential-free checkouts, lockfile caches, per-job timeouts, distinct caller/reusable concurrency groups and explicit failure aggregation. Candidate preparation calls existing CI rather than duplicating quality jobs. The stage/production/rollback entrypoints call one tested plan engine. [Full architecture](CICD_ARCHITECTURE.md).

## Security automation and trust boundaries

All external actions match full commit SHAs in `scripts/ci/tools.lock.json`; tool archives are SHA-256 verified before binary extraction. Docker/service bases are pinned. The existing secret-pattern scanner remains, augmented by a clean-checkout environment-file policy. `.env` files are preserved locally and are never copied into candidate/image contexts; this is not a claim that local Git tracking was inspected.

Untrusted PRs receive no environment/production secret, cloud/registry credential or OIDC permission. No privileged PR event or secret inheritance is used. Inputs enter fixed shell commands through environment variables and are validated by Node. Candidate paths, byte lengths/hashes, duplicates, traversal, symlinks and extra/missing files are checked. Exact artifact IDs, successful main manual release runs and Required CI are required before a plan consumes a cross-run artifact. Checksums establish integrity, not authorship; trusted run provenance and reviewed main source provide the intended origin boundary.

GitHub environment settings are external prerequisites: reviewers, self-review prevention and protected-branch policy are read-only API checks, followed by the actual environment gate. Administrator-bypass restrictions require manual owner inspection; an undocumented API field is not treated as an enforceable control. Missing settings/API access fail closed. Feature/plan availability, real enforcement and admin settings are **NOT VERIFIED**. No environment was created/configured here. [Security policy](CI_SECURITY_POLICY.md).

No audit threshold was lowered, no unfixed HIGH/CRITICAL image findings are ignored, and no original test assertion/security control was removed. The safe profile excludes the two mutation-oriented AWS EC2/Docker-Kubernetes files and governed-remediation cases 11/12 because their fixtures enable execution flags; five live tests opt out. This is documented scope, **not a claim that the entire legacy root `npm test` passed**. Phase-specific older runtime harnesses are not invoked against their retained databases.

## Docker automation and release artifacts

Existing multistage Dockerfiles remain, with digest-pinned Node 24 and unprivileged Nginx bases. `scripts/ci/images.mjs` builds linux/amd64 backend/frontend local images with full commit-SHA and version tags, records content image IDs and runs Trivy Dockerfile/image gates. Worker shares the backend image and worker command. No multi-platform claim is made: the proposed Phase 24 Graviton/t4g target needs separate ARM builds/runtime tests.

No `docker login`, registry push, cloud authentication or resource operation exists in the workflows. Content IDs/archives are checked; local IDs are not registry digests, and tag names alone are mutable. Image tar export occurs only for reusable candidate preparation. Ordinary CI uploads JSON diagnostics; exported intermediate images retain one day and candidate/test evidence seven days. Hosted minutes/artifact storage can cost money outside account allowances; no quota/free-cost claim was verified and no remote job was triggered.

Version tooling validates root/backend/frontend manifests and locks. Default version changes are dry-run; only explicit `--write` changes metadata, without Git commands. Curated `release/changes.json` generates candidate release notes/changelog without Git history. Actual publication requires independent manual approval and a future reviewed publication implementation; none exists here. [Release management](RELEASE_MANAGEMENT.md).

Actual filesystem packaging was tested with synthetic image archives clearly propagated as `simulated:true`. Ordinary plan intake rejects them; only explicit local `--simulation` accepts a **BLOCKED** plan. No synthetic image is presented as an actual build/scan or published candidate.

## Staging/production and rollback behavior

Manual plans require target version/commit, successful trusted release run ID, current-version declaration, exact `PLAN ONLY` and a minimal backup/restore attestation. The attestation is structurally checked, not independently authenticated recovery proof. Candidate/source/image identities must agree; rollback must select an older version and deploy cannot silently downgrade. Requested version/commit bind the verified candidate.

After provenance preflight, the selected environment job requires its configured approval, verifies downloaded bytes and emits a plan with `status: BLOCKED`, `deploymentEnabled:false`, empty cloud-operation and health-request arrays. `--execute` is rejected. No repository variable can enable execution because no execution path was implemented. Failure annotations/summary provide investigation and rollback guidance; no Slack/email message was sent. [Pipeline runbook](DEPLOYMENT_PIPELINE_RUNBOOK.md), [rollback foundation](ROLLBACK_AUTOMATION.md).

Actual deployed state/schema compatibility, production backup/restore and post-deployment/rollback health remain unverified. The plan lists required future checks; it does not run them against a real service. It never deletes volumes, restores over the source, runs down-migrations or clears operation evidence.

## Actual local validation results

The supported test runtime was the retained official Node **24.22.2**. A fresh PostgreSQL 16.14 cluster under `D:/Projects/.infrapulse-phase25`, loopback **5546**, used SCRAM and a new `infrapulse_ci_phase25_*` database. Production-mode API smoke used a dynamically allocated owned loopback port and the disposable admin fixture; **P24-01 remains unresolved**. HTTPS forwarding was simulated, not real TLS.

| Check | Result | Evidence / limitation |
|---|---|---|
| Existing safe backend selection + Phase 24 preparation tests | **PASS: 336; SKIPPED: 5 / 341 selected** | Includes all 60 default backend cases; [TAP summary](../reports/phase25/ci/test-results.json) |
| New release/pipeline security regressions | **PASS: 22/22** | [TAP](../reports/phase25/release-tests.tap): versions, manifest tamper/path/extra/missing/duplicate files, source pins, unsafe inputs, approval/provenance/backup, simulation/execution, DB isolation |
| Frontend tests | **PASS: 7/7** | [log](../reports/phase25/frontend.log); Vite pretest production build exit 0 |
| Frontend artifact validation | **PASS** | Built HTML/hashed JS+CSS/no source maps or environment files; [hash manifest](../reports/phase25/ci/frontend-build.json); browser E2E **NOT TESTED** |
| Fresh lockfile installs | **PASS: 3/3** | Actual isolated `npm ci --ignore-scripts` root/backend/frontend installs; source locks unchanged by the check; [results](../reports/phase25/lock-installs.json). Frontend build used its installed toolchain; integrity-only fresh copies did not run hooks. |
| Migrations and replay | **PASS: 22 applied, zero replayed** | New empty owned CI DB + test-only seed; [results](../reports/phase25/ci/migrations.json). No original/user DB modified. |
| Guarded production configuration + actual API/PG smoke | **PASS** | [results](../reports/phase25/ci/integration.json): ready/live 200, plaintext auth 400, registration 201, authenticated me/services 200, Secure/HttpOnly cookie, graceful handler exit 0; real TLS/Linux signals/least-privilege auth **NOT TESTED** |
| Workflow YAML, permissions, approved pins and script/backend syntax | **PASS** | [policy](../reports/phase25/ci/policy.json), strict YAML and actual Node checks; no ESLint pass claimed |
| actionlint 1.7.12 | **PASS: 7 workflows** | [actual result](../reports/phase25/actionlint.json). Local optional ShellCheck/pyflakes unavailable/disabled; Linux workflow enables ShellCheck auto-detection. Remote Actions execution remains separate. |
| Dependency audits | **PASS: all three, zero vulnerabilities at every severity** | [JSON reports](../reports/phase25/dependency-audits.json); no automatic vulnerability suppression/fix |
| Existing secret-pattern scan | **PASS** | [result](../reports/phase25/secret-scan.json). Clean-checkout env policy tested with disposable fixtures; not run as a false local tracking check over preserved real `.env` files. |
| Trivy 0.76.1 Dockerfile configuration scans | **PASS: backend/frontend; zero HIGH/CRITICAL** | [scan commands/results](../reports/phase25/dockerfile-scans.json), raw Dockerfile reports. This is not an image vulnerability result. |
| Docker builds / image vulnerability scans | **BLOCKED** | [daemon evidence](../reports/phase25/docker-environment.json): missing desktop-linux pipe; Docker Desktop not started and no user container auto-started |
| Versions / curated notes / candidate manifest packaging | **PASS locally** | All application manifests/locks 2.4.0; packaging/tamper checked with simulated image archives; no actual image artifact or release uploaded |
| Stage/production deploy+rollback plan simulation | **PASS, simulated; plans BLOCKED** | Four cases and actual CLI simulation: [packaging/plans](../reports/phase25/release-simulation.json), [CLI](../reports/phase25/cli-dry-run.json) |
| GitHub jobs, approval/denial, artifact API/download and actual publication | **NOT TESTED** | No Git operation, workflow dispatch, release creation, upload or registry push; actual repository protection/quotas unknown |
| Actual deployment/rollback/post-operation health | **NOT TESTED / disabled** | No real infrastructure contact or operation; local API smoke does not waive this boundary |
| Application operational readiness | **FAIL / NO-GO carried forward** | 19 Phase 23N findings, five P0 defects and P24-01 plus recovery/TLS/container/budget gaps remain open |

One scanner-harness attempt initially used the test-overridden TEMP path instead of the actual verified-tool location; it returned missing-executable status. Later, extracted executables became absent from the temporary directory between runs; the cached official archives were checksum-verified and re-extracted into the owned retained directory, then both scanners were rerun successfully. No security rejection was returned and no cause is inferred for that external file removal. [Availability evidence](../reports/phase25/tool-availability.json). The first native actionlint wildcard also needed explicit PowerShell expansion; the Linux workflow uses ordinary shell expansion. No failing security finding was suppressed to fix these harness/environment issues.

## Remaining blockers and Phase 26 priorities

1. Resolve/retest N01/N02/N03/N09/N11 and the remaining Phase 23N defects; resolve P24-01 and controlled administrator bootstrap. These were not application-remediation work in Phase 25.
2. Obtain approved actual GitHub execution, confirm action/runner compatibility and required status names, inspect all remote logs/artifacts, configure/verify independent environment reviewers, self-review prevention, protected main and administrator-bypass policy. Approval availability may depend on repository visibility/plan; do not activate a paid service automatically.
3. Run actual Linux image builds/scans/non-root/secret/socket/volume/shutdown checks; rehearse ARM separately if choosing the proposed Graviton infrastructure. Review scan failures rather than ignoring unfixed vulnerabilities.
4. Complete off-host/key/global-role/archival recovery, production-size RPO/RTO and schema/version rollback compatibility. Operator JSON attestations do not replace those drills.
5. Review signed artifact/image provenance, full application SAST, pin-update procedure and hosted minutes/storage quotas. Keep publishing and infrastructure execution absent until separately authorized and independently validated.

## Exact files and preservation

The complete path-by-path source/config/test/document and generated-evidence lists are [CHANGED_FILES.md](../reports/phase25/CHANGED_FILES.md) and [changed-files.json](../reports/phase25/changed-files.json). They are derived from filesystem hashes, not Git status/diff. The required six documents are this report, `CICD_ARCHITECTURE.md`, `RELEASE_MANAGEMENT.md`, `DEPLOYMENT_PIPELINE_RUNBOOK.md`, `CI_SECURITY_POLICY.md` and `ROLLBACK_AUTOMATION.md`.

Changes comprise the seven workflows, Dependabot configuration, the two existing Dockerfile base pins, application package/lock metadata and root scripts, new generic `scripts/ci` and `scripts/release` tooling, curated release changes, new `tests/cicd`/owned `phase25*` harnesses and README links. Existing application/UI source, original test assertions, migrations, Phase 23/24 reports and all environment files/templates were preserved. Frontend `dist` was regenerated by the requested production build. No original source file was removed.

Owned API children exited and only the owned 5546 cluster is stopped. Its data, synthetic candidate fixtures and fresh-install directories remain under `D:/Projects/.infrapulse-phase25`; verified scanner binaries/caches are outside the repository. No original DB, prior cluster, user container or persistent volume was stopped/deleted. [Preservation/summary](../reports/phase25/preservation.json), [cleanup](../reports/phase25/cleanup.json), [commands](../reports/phase25/commands.jsonl).

**Final safety verdict: build/test/candidate/plan foundations implemented; actual GitHub and container release validation remain unverified. Production deployment and publication are disabled. No production-readiness success is declared. All changes remain uncommitted.**
