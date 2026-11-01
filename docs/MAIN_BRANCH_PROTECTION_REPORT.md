# InfraPulse — Main Branch Protection & Governance Report

**Date**: 2026-11-01T14:35:00+05:30  
**Evaluator**: Senior Release Manager & GitHub Repository Administrator  
**Repository**: `https://github.com/KartikMandake/InfraPulse`  
**Protected Branch**: `main`  
**Development Branch**: `kartik`  
**Status**: `ENFORCED`  

---

## 1. Executive Summary

Branch governance has been established for the InfraPulse repository following the successful v1.0.0 General Availability release.

- **`main`**: Formally protected via GitHub Branch Protection API. Direct pushes by routine workflows are restricted, force pushes are forbidden, deletions are blocked, and strict CI status checks are required prior to merge.
- **`kartik`**: Created from `c18be92` (the published v1.0.0 release history + publication report), pushed to `origin/kartik`, and set up with upstream tracking.

---

## 2. Main Branch Protection Configuration Evidence

GitHub API `PUT /repos/KartikMandake/InfraPulse/branches/main/protection` succeeded with HTTP 200:

| Rule / Setting | Value | Rationale |
| :--- | :---: | :--- |
| **`required_pull_request_reviews`** | Enabled (`approvals: 0`) | Enforces PR requirement for changes while preventing single-maintainer lockouts |
| **`dismiss_stale_reviews`** | `true` | Any new push invalidates stale PR reviews |
| **`required_status_checks.strict`** | `true` | Branch must be strictly up to date with `main` before merging |
| **`required_status_checks.contexts`**| `['backend-quality-gate', 'frontend-quality-gate']` | Core regression tests and frontend build must pass in CI |
| **`allow_force_pushes`** | `false` | Permanent history protection; force push cannot overwrite main |
| **`allow_deletions`** | `false` | Accidental or malicious deletion of main is blocked |
| **`enforce_admins`** | `false` | Repository administrator retains emergency recovery authorization |

Verification Query:
```json
{
  "status": "PROTECTED",
  "branch": "main",
  "enforce_admins": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "backend-quality-gate",
      "frontend-quality-gate"
    ]
  }
}
```

---

## 3. Kartik Development Branch Creation & Tracking

1. **Origin Commit**: `c18be92` (`docs(release): record Phase 32 GitHub publication report`, descendant of release commit `5711785`).
2. **Branch Creation**: `git checkout -b kartik`
3. **Upstream Remote Push**:
   ```bash
   $ git push -u origin kartik
   branch 'kartik' set up to track 'origin/kartik'.
   To https://github.com/KartikMandake/InfraPulse.git
    * [new branch]      kartik -> kartik
   ```
4. **Current Working Branch**: `kartik` (active and clean).

---

## 4. Dependabot PR Review & Technical Assessment

Five Dependabot pull requests currently exist in the repository. All five currently fail the internal composite CI check due to the repository's strict lockfile tree agreement policy (`tests/cicd/releaseAutomation.test.mjs`), which expects identical version locks across root, backend, and frontend workspaces.

### Detailed PR Matrix:

#### PR #1: `chore(deps-dev): bump concurrently from 9.2.5 to 10.0.6`
- **Scope**: Root development tooling (`devDependencies`).
- **Security Impact**: None. `npm audit` reports 0 vulnerabilities.
- **Breaking Changes**: Minor CLI argument parsing updates in `concurrently` v10; `npm run dev` and test runner scripts should be verified.
- **CI Status**: `backend-quality-gate` PASSED, `frontend-quality-gate` PASSED, `security-and-policy` FAILED (multi-lockfile sync mismatch).
- **Recommendation**: **`DEFER`**. Merge not recommended on `main`. Should be integrated and tested on `kartik` during regular tooling maintenance.

#### PR #2: `chore(deps-dev): bump yaml from 2.8.3 to 2.9.1`
- **Scope**: Root development tooling (`devDependencies`).
- **Security Impact**: None. Maintenance patch/minor release for parser optimization.
- **Breaking Changes**: None. Backwards-compatible within the 2.x stream.
- **CI Status**: `backend-quality-gate` PASSED, `frontend-quality-gate` PASSED, `security-and-policy` FAILED (lockfile sync mismatch).
- **Recommendation**: **`DEFER`**. Safe to adopt during the next planned maintenance cycle on `kartik`.

#### PR #3: `chore(deps): bump express from 4.22.3 to 5.3.0 in /backend`
- **Scope**: Backend core runtime (`backend/package.json`).
- **Security Impact**: None.
- **Breaking Changes**: **HIGH RISK (Major Version Bump)**:
  - Express 5 changes error handling behavior (rejected promises in async handlers automatically route to `next(err)`).
  - Changes path routing syntax (e.g., path-to-regexp v6/v7 updates, removal of wildcard string patterns).
  - Deprecates several legacy methods (`res.send(status, body)`, `req.param()`).
- **CI Status**: `backend-quality-gate` PASSED, `frontend-quality-gate` PASSED, `security-and-policy` FAILED.
- **Recommendation**: **`DEFER` / `FIX FIRST` on `kartik`**. Must not be merged directly to `main`. Requires comprehensive regression testing on `kartik` to guarantee custom middleware and route matchers behave identically.

#### PR #4: `chore(deps): bump @opentelemetry/context-async-hooks from 2.12.0 to 3.0.0 in /backend`
- **Scope**: Backend OpenTelemetry context provider.
- **Security Impact**: None.
- **Breaking Changes**: **HIGH RISK (Breaking SDK Migration)**:
  - OpenTelemetry 3.0.0 drops Node 18/20 compatibility guarantees and updates async scope propagation APIs.
  - Requires paired update with `@opentelemetry/sdk-trace` and `@opentelemetry/api`.
- **CI Status**: `backend-quality-gate` PASSED, `frontend-quality-gate` PASSED.
- **Recommendation**: **`DEFER`**. Must be coordinated simultaneously with PR #5 on `kartik`.

#### PR #5: `chore(deps): bump @opentelemetry/sdk-trace from 2.12.0 to 3.0.0 in /backend`
- **Scope**: Backend OpenTelemetry tracer SDK.
- **Security Impact**: None.
- **Breaking Changes**: **HIGH RISK**:
  - OpenTelemetry SDK 3.0.0 contains breaking changes in tracer registration and span processor interfaces.
- **CI Status**: `backend-quality-gate` FAILED (`test:backend` threw compatibility error).
- **Recommendation**: **`CLOSE` / `SUPERSEDE ON KARTIK`**. PR #5 fails the backend test suite in isolation because PR #4 must be applied together with it. Both should be bundled and tested together on `kartik`.

---

## 5. Manual GitHub Settings Verification Checklist

Branch protection is already active via API. For visual verification in GitHub UI:
1. Navigate to: `https://github.com/KartikMandake/InfraPulse/settings/branches`.
2. Confirm `main` appears under **Branch protection rules**.
3. Verify checked boxes:
   - [x] **Require a pull request before merging**
   - [x] **Require status checks to pass before merging** (`backend-quality-gate`, `frontend-quality-gate`)
   - [x] **Require branches to be up to date before merging**
   - [ ] Do not require review approvals (0 count)
   - [x] Block force pushes
   - [x] Block deletions
