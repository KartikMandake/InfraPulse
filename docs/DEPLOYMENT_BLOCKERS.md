# InfraPulse Operational Deployment Blockers & Constraints

**Audit Date**: 2026-11-01T14:57:00+05:30  
**Status**: `NO ACTIVE BLOCKERS FOR SELF-HOSTED RUNTIME`  

---

## 1. Resolved Items

1. **Database Schema Setup for Production**:
   - Resolved via `scripts/init-deployment-db.cjs` and `scripts/apply-deployment-migrations.cjs`.
   - Dedicated `infrapulse_ops_prod` database created on PostgreSQL port 5434 without altering development tables.
2. **Backend & Worker Activation**:
   - Resolved via environment configuration. Server and integrated notification queue worker successfully active on port 5001.
3. **Frontend Application Serving**:
   - Active on `http://localhost:5173`. Verified HTTP 200 and DOM mount availability.

---

## 2. Operational Boundaries & Accepted Constraints

1. **Docker Daemon Boundary (`DOCKER-01`)**:
   - *Observation*: Host Docker Desktop CLI plugins are present, but Docker Desktop daemon service was inactive in Windows (`The system cannot find the file specified`).
   - *Resolution*: InfraPulse successfully deployed natively as a production-like self-hosted service architecture (Node.js runtime + PostgreSQL 16 relational tier).
2. **Host Drive C: Storage Constraint (`STORAGE-01`)**:
   - *Observation*: Drive `C:` has `0.23 GB` free space remaining, while Drive `D:` (project drive) has `58.27 GB` free space.
   - *Mitigation*: Heavy container image pulls on Drive C must be avoided to prevent disk exhaustion. All runtime data, databases, and logs are housed on Drive `D:` and PostgreSQL cluster `5434`.
3. **AWS FinOps Budget Constraint (`FINOPS-01`)**:
   - *Observation*: Out-of-pocket budget is strictly ₹0.
   - *Resolution*: Public AWS resource mutations and provisioning remain gated behind explicit user approval.
