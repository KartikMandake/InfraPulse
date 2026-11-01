# InfraPulse — Production Deployment Guide & Container Engineering

> Historical release guidance. Production approval is closed; use the [Phase 24 gated runbook](../PRODUCTION_DEPLOYMENT_RUNBOOK.md) and [current readiness report](../PHASE_24_DEPLOYMENT_PREPARATION_REPORT.md). Earlier container/version/configuration assumptions do not establish current readiness.

**Phase 20 Release Engineering Deliverable**  
**Document Version**: 2.4.0  
**Target Runtimes**: Docker Engine 24+ / Docker Compose v2.20+ / Kubernetes 1.28+  

---

## 1. Container Architecture Overview

InfraPulse utilizes a clean, decoupled container architecture with distinct operational responsibilities:

```
                  ┌───────────────────────────────┐
                  │       Ingress / Reverse Proxy │
                  │  (SSL Termination & Routing)  │
                  └───────────────┬───────────────┘
                                  │
                 ┌────────────────┴────────────────┐
                 │                                 │
                 ▼ (Port 8080)                     ▼ (Port 5000)
    ┌─────────────────────────┐       ┌─────────────────────────┐
    │   infrapulse-frontend   │       │   infrapulse-backend    │
    │  Unprivileged Nginx     │       │  Node.js API & RCA      │
    │  (Static SPA Assets)    │       │  Non-root `USER node`   │
    └─────────────────────────┘       └────────────┬────────────┘
                                                   │
                 ┌─────────────────────────────────┼──────────────────┐
                 │                                 │                  │
                 ▼                                 ▼                  ▼
    ┌─────────────────────────┐       ┌─────────────────────────┐   ┌─────────────────────────┐
    │   infrapulse-worker     │       │       PostgreSQL        │   │     OTel Collector      │
    │  Queue Dispatcher       │       │  Relational Persistence │   │  Metrics, Spans & Logs  │
    │  Atomic Claim Worker    │       │  Port 5432 (Internal)   │   │  Port 4318 (Internal)   │
    └─────────────────────────┘       └─────────────────────────┘   └─────────────────────────┘
```

---

## 2. Hardened Multi-Stage Dockerfile Specifications

### 2.1 Backend Container (`backend/Dockerfile`)
- **Base Image**: `node:20-alpine` (official lightweight Node LTS image).
- **Multi-Stage Build**:
  - Stage 1 (`dependencies`): `npm ci --omit=dev` produces lean runtime `node_modules` without devDependencies.
  - Stage 2 (`runner`): Copies application code and production dependencies with `--chown=node:node`.
- **Security Hardening**:
  - Unprivileged user execution: Explicitly switches to `USER node` (UID 1000).
  - Least privilege: Root access dropped immediately after package installation.
- **Healthcheck**:
  ```dockerfile
  HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health/live || exit 1
  ```

### 2.2 Frontend Container (`frontend/Dockerfile`)
- **Base Image**: `nginxinc/nginx-unprivileged:alpine`.
- **Multi-Stage Build**:
  - Stage 1 (`builder`): Compiles React Vite SPA with tree shaking and minification.
  - Stage 2 (`runner`): Copies `/app/dist` to `/usr/share/nginx/html`.
- **Security Hardening**:
  - Native unprivileged Nginx container running on non-privileged port `8080`.
  - Static file serving only; no write permissions on root filesystem.
- **Healthcheck**:
  ```dockerfile
  HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1
  ```

---

## 3. Production Deployment Commands

### 3.1 Initial Deployment
```bash
# 1. Clone or sync production bundle
git clone https://github.com/infrapulse/infrapulse.git /opt/infrapulse
cd /opt/infrapulse

# 2. Configure production secrets
cp .env.example .env.production
chmod 600 .env.production
# Edit .env.production with strong PostgreSQL and encryption passwords

# 3. Build containers and start stack
docker compose -f deploy/docker-compose.yml up -d --build

# 4. Run database migrations inside container
docker compose -f deploy/docker-compose.yml exec backend npm run db:migrate

# 5. Verify service health
docker compose -f deploy/docker-compose.yml ps
```

### 3.2 Health & Readiness Verification
```bash
# Check Backend Health Endpoint
curl -fsS http://localhost:5000/api/health/ready
# Expected: {"status":"ready","database":"connected","version":"2.4.0"}

# Check Frontend Liveness
curl -fsS http://localhost:8080/healthz
# Expected: HTTP 200 OK
```

---

## 4. Environment Variables Checklist

| Variable | Required | Description / Recommended Value |
|---|:---:|---|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | `5000` (Backend API) |
| `PGHOST` | Yes | PostgreSQL host (e.g., `postgres` in compose or cloud RDS) |
| `PGPORT` | Yes | `5432` |
| `PGDATABASE` | Yes | `infrapulse` |
| `PGUSER` | Yes | Secure database user (not superuser in production) |
| `PGPASSWORD` | Yes | Strong alphanumeric database password (>= 24 chars) |
| `INTEGRATION_ENCRYPTION_KEY` | Yes | 32-byte secret for AES-256-GCM credential encryption |
| `FRONTEND_URL` | Yes | Public URL of web UI (e.g., `https://infrapulse.company.com`) |
| `NOTIFICATION_WORKER_ENABLED` | Yes | `false` on API server; `true` on dedicated worker container |
| `NOTIFICATION_MOCK_MODE` | No | `false` in production (enables live Slack/SMTP dispatch) |
| `SLACK_WEBHOOK_URL` | No | Production incident channel webhook URL |

