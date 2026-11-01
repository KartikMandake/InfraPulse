# Release management

Phase 25 establishes an **unpublished candidate process**, not an actual release. No tags, GitHub Releases, branches, image pushes or publication were created. Production remains NO-GO; [Phase 25 results](PHASE_25_CICD_RELEASE_AUTOMATION_REPORT.md) distinguish local validation from GitHub execution.

## Version convention

The application version is shared by root, backend and frontend `package.json`, each lockfile header and each lockfile's root package. Backend package metadata was aligned from 1.0.0 to the existing application version **2.4.0**; dependency resolutions were preserved. The backend health route's historical engine identifier is separate from candidate/package version and is not used to approve a release.

Use MAJOR for incompatible changes, MINOR for compatible features, PATCH for compatible fixes. Supported tags are `vMAJOR.MINOR.PATCH` with optional SemVer prerelease identifiers such as `-rc.1`. Automation takes the version **without** `v`; normalized numeric fields and safe integer bounds are enforced. Build metadata (`+...`) is intentionally excluded from the supported image-tag convention. Prerelease numeric ordering uses exact integers.

```text
npm run release:check
node scripts/release/version.mjs --set 2.4.1
```

The second command prints a dry-run file plan. Only an explicitly requested `--write` updates all six package/lock metadata files; it performs no Git operation. Do not run version changes on behalf of a publication without review. Curate `release/changes.json` for the same version before candidate preparation. Historical Phase 20 `v2.4.0-rc1` documents are not evidence of a currently published tag/release. Remote tags were not queried in this task; only local HEAD metadata identified `main`.

## Notes and candidate artifacts

Curated change descriptions and unresolved blockers in `release/changes.json` generate both `RELEASE_NOTES.md` and `CHANGELOG.md` inside the candidate. This is reviewed release-note generation, **not Git-history extraction**. Do not claim a complete commit changelog without separately reviewing the actual change set.

Manual `release.yml` requires the exact package version and `PREPARE ONLY`, runs the reusable CI, and prepares on main after its `release-review` environment gate. It consumes same-run built/scanned image archives. Missing images, failed scans, mismatched versions/commits or existing output folders reject preparation. The artifact contains compiled frontend assets, backend source/manifests, deployment templates, image tar files and nested/root integrity manifests. It is a candidate with `productionReady:false` and `deploymentEnabled:false`.

Actual candidate packaging/checksum rejection was exercised locally with **synthetic image tar fixtures**. Those fixtures are labeled simulated and cannot enter an ordinary plan; explicit `--simulation` is required. No successful Docker image build, actual image scan, upload or GitHub candidate run is claimed locally.

Images use `infrapulse-<component>:sha-<full-commit>` plus version tags; content image IDs and archive checksums carry integrity. Tags alone are mutable names, and local image IDs are **not registry pull digests**. Nothing has been pushed. The worker is the backend image with a different command; do not duplicate it as an independently versioned package without a reason.

## Manual publication approval

Before any future publication, an authorized owner must review all of the following:

1. All Phase 23N/24 critical lifecycle/security/recovery blockers resolved and independently retested; real container/TLS/restore and intended DB-role evidence available.
2. Main protected, required CI/security checks successful for the exact commit, version/changelog reviewed, and immutable artifacts/scans verified. Confirm GitHub retention limits have not expired the candidate.
3. `release-review`, staging and production environment protections configured by an owner, independent reviewers required, self-review prevented, administrator-bypass policy manually inspected, and budget/permissions reviewed. These settings were **not configured or verified** here.
4. Explicit authorization for the destination registry, private/public visibility, package names, GitHub tag/release and any associated charges. No publication secret is required or configured by the present workflows.
5. A deliberate publishing procedure for the already validated bytes, followed by authenticity/provenance verification and final release approval. Adding publishing code/credentials requires a separately reviewed future change; there is no hidden enable flag in this phase.

Do not infer permission to publish from a successful candidate artifact or from this document. Production promotion is separately governed by [DEPLOYMENT_PIPELINE_RUNBOOK.md](DEPLOYMENT_PIPELINE_RUNBOOK.md).
