# InfraPulse — Production Release Checklist

**Phase 20 Release Engineering Deliverable**  
**Target Release**: InfraPulse v2.4.0  

---

## Pre-Release Verification (Must be 100% complete before Staging)

- [x] **Repository Integrity**: Node.js ES modules (`.js`) and React JSX (`.jsx`) maintained. No TypeScript or Python introduced.
- [x] **Dependency Security**: `npm audit` across root, backend, and frontend yields **0 vulnerabilities**.
- [x] **Database Migration & Disaster Recovery**: All 10 migrations (`001`–`010`) apply cleanly on cold database; idempotency verified.
- [x] **Complete Test Suite**: All unit, integration, and platform test suites pass (`npm test`).
- [x] **End-to-End Operational Lifecycle**: Complete 15-step operational lifecycle passes (`npm run test:e2e`).
- [x] **Failure & Recovery Suite**: All 20 failure, edge-case, and chaos scenarios pass (`npm run test:failure`).
- [x] **Performance & Load Benchmark**: Error rate is 0.00%; RCA accuracy is 85.7% (Top-1) and 100% (Top-3); investigation p99 is 37ms.
- [x] **Frontend Production Build**: Vite React bundle builds cleanly with zero errors (`npm run build:frontend`).
- [x] **UI & Route Validation**: All 17 pages verified with Stitch UI styling (`#030407`, `#1558C9`, `#D4FF24`).
- [x] **Docker Container Security**: Multi-stage builds, non-root users (`USER node`, `nginx-unprivileged`), healthchecks verified.
- [x] **CI/CD Pipeline Hardened**: GitHub Actions `.github/workflows/ci.yml` runs full suite, migrations, DR test, and security audit.

---

## Production Cutover Steps

1. **Pre-flight Communication**: Announce maintenance window to on-call engineers.
2. **Database Snapshot**: Take online `pg_dump` of current production database.
3. **Database Migration**: Run `npm run db:migrate` against target PostgreSQL cluster.
4. **Deploy Containers**: Launch `infrapulse-backend`, `infrapulse-worker`, and `infrapulse-frontend`.
5. **Verify Health Endpoints**:
   - `curl -fsS http://localhost:5000/api/health/ready`
   - `curl -fsS http://localhost:8080/healthz`
6. **Smoke Test Responders**: Validate login, active incident overview, and investigation views.
7. **Sign-off**: Release Commander marks deployment completed.

