# InfraPulse Git Branching & Repository Governance Strategy

**Effective Date**: 2026-11-01  
**Target Repository**: `https://github.com/KartikMandake/InfraPulse`  
**Governing Standard**: Enterprise Single-Maintainer Trunk & Controlled Branching Model  

---

## 1. Core Philosophy & Branch Architecture

InfraPulse maintains strict separation between **production releases** and **active platform engineering**. 

```
[origin/main]  <=== (Protected, releases only, strict CI, fast-forward/PR merges only)
       ▲
       │ Pull Request (All required CI checks pass, fast-forward merge)
       │
[origin/kartik] <=== Primary development stream (all daily commits, feature branches merge here)
```

### Branch Definitions:
- **`main`**: The immutable, stable release branch. Reflects the latest production release (currently tagged `v1.0.0`). Direct pushes to `main` are blocked. All additions must arrive via reviewed pull requests passing required CI quality gates.
- **`kartik`**: The primary development branch. All ongoing architectural enhancements, feature development, bug fixes, and dependency upgrades are committed and pushed directly to `kartik`.

---

## 2. GitHub Branch Protection Policy for `main`

The `main` branch is protected by GitHub API branch protection with the following rules:

1. **Pull Requests Required**: Direct pushes by non-administrators or routine sessions are blocked. Merging requires creating a PR against `main`.
2. **Required CI Quality Gates (Strict Mode)**:
   - `backend-quality-gate`: Full test suite against PostgreSQL, API route verification, and migration replay.
   - `frontend-quality-gate`: Vite production bundle compilation and chunk integrity.
   - Strict mode enforces that the PR branch must be completely up to date with the latest `main` commit before merge.
3. **Single-Maintainer Optimization**:
   - `required_approving_review_count`: Set to `0` to allow the repository owner to merge approved pull requests without requiring an external peer sign-off.
   - `dismiss_stale_reviews`: Enabled (`true`).
4. **Destructive Operation Prevention**:
   - `allow_force_pushes`: Disabled (`false`). Force pushes to `main` are strictly rejected.
   - `allow_deletions`: Disabled (`false`). Accidental branch deletion is prevented.
5. **Administrative Safeguards**:
   - `enforce_admins`: Disabled (`false`) to ensure emergency hotfixes can be administered by the repository administrator if required.

---

## 3. Standard Development Workflow

### Step 1: Work on `kartik`
All everyday coding, testing, and documentation must happen on `kartik`:
```bash
# Switch to kartik and sync
git checkout kartik
git pull origin kartik

# Develop and commit
git add <selected_files>
git commit -m "feat(scope): descriptive message"
git push origin kartik
```

### Step 2: Pre-PR Local Quality Verification
Before submitting a pull request to `main`, run the local verification suite:
```bash
# 1. Backend tests
npm run test:backend

# 2. Frontend production build
npm run build:frontend

# 3. Security and secrets scan
node scripts/securityAudit.js

# 4. CI policy validation
node scripts/ci/policy.mjs
```

### Step 3: Promote to `main` via Pull Request
When features or release milestones are complete:
1. Open a pull request: `kartik` -> `main`.
2. Wait for GitHub Actions (`backend-quality-gate` and `frontend-quality-gate`) to report success.
3. Merge the pull request using "Rebase and merge" or "Squash and merge" (maintaining a clean linear history).
4. Pull the updated `main` locally:
   ```bash
   git checkout main
   git pull origin main
   ```

### Step 4: Tagging Official Releases
When publishing a new minor or major release:
1. Ensure `main` contains all release preparation commits and updated changelogs.
2. Create an annotated tag:
   ```bash
   git tag -a v1.x.y -m "InfraPulse v1.x.y Release Title"
   git push origin v1.x.y
   ```
3. Publish GitHub Release with assets and SHA-256 signatures.

---

## 4. Handling Dependency Updates (Dependabot)

- Dependabot PRs target `main` by default, but because `main` is protected, they cannot be merged directly without passing CI.
- For major version bumps (such as `express 5.x` or `@opentelemetry 3.x`), evaluate backwards compatibility on `kartik` first.
- Pull updates into `kartik`, adapt codebase dependencies, verify test suites, and merge into `main` cleanly as part of planned releases.
