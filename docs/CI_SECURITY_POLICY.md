# CI security policy

Phase 25. Scope: GitHub Actions and local release tooling. Production application security remains governed by the open findings in [Phase 24](PHASE_24_DEPLOYMENT_PREPARATION_REPORT.md), not by a green CI badge.

## Trust and permissions

- PR workflows use ordinary `pull_request`, never `pull_request_target` or privileged `workflow_run`. No PR job references a deployment environment or production secret. Environment wrappers are manual and use trusted main workflow code; metadata intake rejects PR/fork/wrong-workflow/failed/wrong-commit release runs.
- All workflow tokens remain read-only: `contents: read`, plus `actions: read` only for cross-run artifact/protection verification. No OIDC, cloud credential action, registry login, secret inheritance or write permission is supplied. Checkouts set `persist-credentials:false`.
- Actions are pinned to full 40-character upstream commits, tools to published archive SHA-256, and container/service bases to manifest digests. `scripts/ci/tools.lock.json` records versions, sources and retrieval time. Pins are not a full source-code trust audit; review upstream changes before updating. Dependabot configuration proposes reviewed action/npm updates; no auto-merge, runtime pin-refresh or publishing is enabled.
- Untrusted inputs enter shell steps through environment variables, never expression interpolation in `run`. Node validates versions, commits, numeric run IDs, allowed environment/operation names and the exact plan acknowledgement. Artifact IDs come from verified API metadata. Workflows never accept an infrastructure URL, shell command or host credential.
- Hosted ephemeral runners are the intended model. Do not use these untrusted-PR jobs on a production/shared/self-hosted runner with reachable credentials or privileged persistent state. Cache only package downloads with lockfile-bound keys; never cache secrets, environments, DBs or release outputs. [GitHub secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).

## Required automated checks

| Control | Implementation / limit |
|---|---|
| Lockfile installation | `npm ci` per project, frozen manifest declarations/integrity; backend/root install hooks disabled; frontend keeps hooks required for its build toolchain |
| Dependency vulnerabilities | All three installed project trees audited; HIGH/CRITICAL gate remains failing when found, without audit suppression or automatic fixes |
| Secret patterns | Existing `scripts/securityAudit.js`; a separate clean-checkout rule rejects real `.env*` files while permitting `.example` templates. Local real environment files are preserved, not assumed tracked. |
| Workflow policy | Strict YAML/duplicate-key parse, immutable actions, read-only token/no OIDC, no unsafe event/expression/remote-operation shell pattern, credential-free checkout; actionlint checks all workflow files |
| Static source checks | Node syntax over backend and scripts; Vite compiles JSX; existing frontend tests enforce artifacts/budgets. No ESLint config was found; syntax is not falsely labeled ESLint. |
| Container configuration | Trivy Dockerfile checks, HIGH/CRITICAL failing threshold; local actual Dockerfile scans passed |
| Image vulnerabilities | Trivy local-image vulnerability scan, HIGH/CRITICAL including unfixed findings; configured but locally **BLOCKED** by missing Docker daemon |
| Release/rollback | 22 meaningful regression cases for version/manifest/tamper/path/run/approval/isolation/execution policy, plus actual CLI simulations |

Tools are downloaded from official public release assets and verified before extracting only the intended executable. Checksums were verified; detached release signatures were not independently validated. Trivy uses its current public check/vulnerability databases; database downloads can require Internet access and fail the job if unavailable. No paid scanner account is used. Full application SAST, CodeQL/private-repository licensing, signed build attestations and registry signature verification are **not implemented/verified**; do not substitute these checks for them. No paid scanner/service was activated.

## Mandatory safe test profile

All execution flags stay false, live tests are opted out, and standard AWS identity/metadata/container/profile credentials are cleared. CI DB writes require the explicit disposable loopback contract. The original AWS EC2 and Docker/Kubernetes mutation-oriented test files and governed-remediation cases 11/12 are retained but excluded because their fixtures enable execution flags. Five live-provider cases skip. Existing assertions are untouched; `npm test` remains available as the legacy broader entrypoint but is **not** the safe CI command. Required automation runs `npm run ci:test` or its exact Node script instead.

Do not add exceptions that enable AWS lifecycle mutations or connect to live infrastructure to improve coverage. Dedicated future mock-only refactoring can bring excluded cases under this invariant, with independent review. A passing test profile does not resolve N01–N19 or P24-01.

## Artifacts and environment protection

Allowlist TAP/JSON summaries, frontend assets and image scan/manifests; only release preparation exports image tars. Do not upload complete workspaces, `.env`, private keys, dump archives, process environments, cookies or request bodies. Native integration saves no session token. Evidence uses synthetic/disposable data only. Existing pattern scanning is heuristic; inspect real remote logs before granting a release exception.

Before the plan environment job can run, read-only API preflight requires reviewers, self-review prevention and protected-branch deployment policy. The actual job then references that GitHub Environment. Missing settings/API access or expired/untrusted artifacts fail closed. **GitHub settings were not created or inspected in this phase.** Administrator bypass and repository-owner policy require manual verification; the documented REST response is not treated as exposing an invented bypass field. Required-reviewer availability depends on repository visibility/plan; do not buy/enable a paid plan automatically. [Environment documentation](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [read-only API](https://docs.github.com/en/rest/deployments/environments).

All deployment/rollback execution remains absent, irrespective of approval or repository variables. No shell script, environment variable or plan result can authorize live actions in the current code.
