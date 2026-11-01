# InfraPulse Local Production Deployment Guide

**Target**: Operational Self-Hosted Deployment  
**Audience**: DevOps, SRE, Platform Engineers  
**Prerequisites**: Node.js v20+ / v26+, PostgreSQL 16 (on port 5434 or 5432)  

---

## 1. Environment Preparation

InfraPulse protects development data by running production workloads against an isolated database: `infrapulse_ops_prod`.

### Step 1: Create Isolated Deployment Database
Run the administrative initialization script:
```bash
node scripts/init-deployment-db.cjs
```
This connects to PostgreSQL on `127.0.0.1:5434` and creates `infrapulse_ops_prod` idempotently.

### Step 2: Apply Database Schema Migrations
Apply all 22 sequential migration scripts:
```bash
node scripts/apply-deployment-migrations.cjs
```
This ensures all 74 tables and 67 foreign keys are created without data loss.

### Step 3: Seed Baseline Entities (Services, Alerts, Users)
Seed standard infrastructure topologies and seeded responder credentials:
```bash
$env:NODE_ENV="test"
$env:PGPORT="5434"
$env:PGDATABASE="infrapulse_ops_prod"
$env:PGDATABASE_TEST="infrapulse_ops_prod"
$env:PGSSLMODE="disable"
node backend/src/db/seed.js
```

---

## 2. Launching Services

### 2.1 Backend API Server
Launch the backend server listening on `http://localhost:5001`:
```powershell
$env:PORT="5001"
$env:HOST="127.0.0.1"
$env:PGHOST="127.0.0.1"
$env:PGPORT="5434"
$env:PGDATABASE="infrapulse_ops_prod"
$env:PGUSER="postgres"
$env:PGPASSWORD="postgres"
$env:PGSSLMODE="disable"
$env:JWT_SECRET="dGhpcy1pcy1hLXByb2R1Y3Rpb24tc2VjcmV0LWZvci1pbmZyYXB1bHNl"
$env:SESSION_SECRET="YW5vdGhlci1zZWN1cmUtc2Vzc2lvbi1zZWNyZXQta2V5LTIwMjY="
$env:INTEGRATION_ENCRYPTION_KEY="MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="
$env:CORS_ORIGIN="http://localhost:5173,http://127.0.0.1:5173"
$env:FRONTEND_URL="http://127.0.0.1:5173"
$env:NOTIFICATION_MOCK_MODE="true"
$env:NOTIFICATION_WORKER_ENABLED="true"
$env:AWS_LIFECYCLE_MUTATIONS_ENABLED="false"
$env:DOCKER_LIFECYCLE_ENABLED="false"
$env:KUBERNETES_LIFECYCLE_ENABLED="false"
$env:REMEDIATION_EXECUTION_ENABLED="false"
node backend/src/server.js
```

### 2.2 Frontend UI Server
Launch the React frontend UI:
```bash
$env:PORT="5173"
npm run dev --prefix frontend
```
Navigate to: `http://localhost:5173`

---

## 3. Standard Login Credentials

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Admin** | `sarah.chen@infrapulse.io` | `Password123!` | Full governance, policy creation, runbook dry-runs |
| **Responder** | `marcus.v@infrapulse.io` | `Password123!` | Incident triage, RCA triggering, alert acknowledgement |
| **Viewer** | `alex.ross@infrapulse.io` | `Password123!` | Read-only access to dashboards, service topologies |

---

## 4. Operational Health & Smoke Verification

Execute the end-to-end automated smoke test to verify all 10 operational tiers:
```bash
node scripts/operational-smoke-test.cjs
```
Expected output: `✓ INFRAPULSE OPERATIONAL SMOKE TEST PASSED FULLY!`
