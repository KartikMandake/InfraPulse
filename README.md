# InfraPulse ⚡

> **Autonomous SRE Observability, AI Root Cause Analysis (RCA) & Incident Response Platform**  
> Built with React (JavaScript/JSX), Node.js, Express, PostgreSQL, and OpenTelemetry.

---

## 🌟 Overview & Architecture

InfraPulse is a production-grade SRE platform delivering causal topology analysis, automated canary evaluation, deterministic root-cause attribution, role-based incident triage, and persistent multi-channel notification dispatching.

### Architecture Highlights
- **Frontend (`frontend/`)**: React 19, Vite, Tailwind CSS, Lucide icons, Recharts, React Flow topology. Pure **JavaScript (`.jsx` / `.js`)**.
- **Backend API (`backend/`)**: Node.js, Express, REST API with JSON responses. Pure **JavaScript (`.js` ES Modules)**.
- **Relational Persistence**: PostgreSQL 16 storing services, incidents, alerts, alert rules, deployments, users, persistent sessions, audit logs, and notification queues.
- **Worker Service (`backend/src/worker.js`)**: Standalone or integrated background processor for reliable notification delivery with exponential backoff and atomic row claiming (`FOR UPDATE SKIP LOCKED`).
- **RCA Engine (`backend/src/engine/`)**: Deterministic heuristic scoring engine factoring anomaly severity (30%), deployment timing (25%), dependency topology (25%), and error log evidence (20%).
- **Observability Stack (`deploy/`)**: Local OpenTelemetry Collector, Prometheus (metrics), Grafana Tempo (traces), and Grafana Loki (logs).
- **Design System**: Midnight Black (`#030407`), Electric Cobalt Blue (`#1558C9`), Acid Lime (`#D4FF24`).

```
InfraPulse/
├── backend/
│   ├── src/
│   │   ├── config/env.js               # Environment parsing & strict validation
│   │   ├── controllers/                # REST endpoints controllers
│   │   ├── data/                       # Initial data models & fallbacks
│   │   ├── db/                         # PostgreSQL connection, migrations & seed
│   │   │   ├── connection.js           # Pool management & transaction utilities
│   │   │   ├── migrate.js              # Versioned SQL migration runner
│   │   │   ├── seed.js                 # Idempotent database seeder
│   │   │   └── migrations/             # 001_initial, 002_auth_rbac, 003_notifications
│   │   ├── engine/                     # RCA & Fault Simulation Engines
│   │   ├── integrations/telemetry/     # OTel, Prometheus, Tempo, Loki Adapters
│   │   ├── middleware/                 # Auth, RBAC, CSRF, Structured Request Logger
│   │   ├── repositories/               # PostgreSQL persistence repositories
│   │   ├── routes/                     # Health, Auth, Incidents, Alerts, Notifications
│   │   ├── services/                   # Timeline, Notifications, Fault Lab, RCA
│   │   ├── utils/                      # Logger, ApiError
│   │   ├── app.js                      # Express application setup
│   │   ├── server.js                   # Web server entrypoint
│   │   └── worker.js                   # Standalone notification queue worker
│   ├── Dockerfile                      # Production multi-stage, non-root Alpine image
│   ├── .dockerignore
│   ├── .env.example
│   └── package.json
├── demo-services/                      # Local OpenTelemetry microservices mesh
│   ├── api-gateway/                    # Port 4001 (entrypoint)
│   ├── orders-service/                 # Port 4002 (middle tier)
│   ├── payments-service/               # Port 4003 (leaf service)
│   ├── shared/                         # OTel tracing SDK & fault middleware
│   └── run-all.js                      # Concurrent runner for demo services
├── deploy/                             # Observability & Container Infrastructure
│   ├── docker-compose.yml              # Complete container stack definition
│   ├── otel-collector-config.yaml
│   ├── prometheus.yml
│   ├── tempo-config.yaml
│   └── loki-config.yaml
├── frontend/
│   ├── src/
│   │   ├── components/                 # Topology, charts, modals, shared layouts
│   │   ├── context/                    # AppContext, AuthContext (RBAC)
│   │   ├── pages/                      # Incidents, Alerts, Telemetry, Settings, Integrations
│   │   ├── services/api.js             # Client API service with credentials support
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── Dockerfile                      # Production multi-stage unprivileged Nginx image
│   ├── nginx.conf                      # Non-root SPA routing & /api/ reverse proxy
│   ├── .dockerignore
│   └── package.json
├── scripts/                            # Operational & deployment automation
│   ├── backup-db.ps1                   # Automated PostgreSQL snapshot backup
│   └── verify-release.ps1              # Production release health probe
├── .github/workflows/
│   └── ci.yml                          # GitHub Actions CI/CD pipeline
├── docker-compose.yml                  # Root bridge to deploy/docker-compose.yml
├── .env.example
└── README.md
```

---

## 🚀 Quick Start (Windows PowerShell / Cross-Platform)

### 1. Prerequisites
- **Node.js**: v18.0.0+ (v20 LTS recommended)
- **npm**: v9.0.0+
- **PostgreSQL**: v14+ (Local on port `5434` or `5432`, or via Docker)
- **Docker & Docker Compose** *(Optional for local development, recommended for production)*

---

### 2. Local Development (Without Docker)

You can run InfraPulse fully locally without Docker:

#### Step 1: Install Dependencies
```powershell
npm run install:all
```

#### Step 2: Configure Environment
Copy `.env.example` in `backend/`:
```powershell
Copy-Item backend\.env.example backend\.env
```
Ensure your local PostgreSQL instance is running and accessible (default credentials: `postgres:postgres` on port `5434` or `5432`).

#### Step 3: Run Database Migrations & Seed Initial Data
```powershell
npm run db:migrate
npm run db:seed
```

#### Step 4: Start Frontend and Backend Concurrently
```powershell
npm run dev
```
- **Frontend**: [http://localhost:5173](http://localhost:5173) (Proxies `/api` to port 5000)
- **Backend API**: [http://localhost:5000](http://localhost:5000)

---

### 3. Running with Docker Compose (Production Stack)

To run the full stack with isolated containers, persistent volumes, and the complete observability suite:

```powershell
# From project root:
docker compose -f deploy/docker-compose.yml up -d --build
```

#### Running Services & Port Mappings:
| Service | Internal Port | Host Binding | Healthcheck Endpoint | Description |
|---|---|---|---|---|
| **Frontend** | `8080` | `http://localhost:8080` | `/healthz` | Unprivileged Nginx + Vite React SPA |
| **Backend API** | `5000` | `http://127.0.0.1:5000` | `/api/health/ready` | Node.js Express API & RCA Engine |
| **Queue Worker** | N/A | Background | Process alive | Standalone notification queue dispatcher |
| **PostgreSQL** | `5432` | `127.0.0.1:5432` | `pg_isready` | Relational database (named volume `pgdata`) |
| **OTel Collector** | `4317`/`4318` | `127.0.0.1:4318` | Collector status | Ingests OTLP traces, metrics, logs |
| **Prometheus** | `9090` | `127.0.0.1:9090` | `/debug/health` | Scrapes telemetry metrics |
| **Grafana Tempo** | `3200` | `127.0.0.1:3200` | `ready` | Distributed trace storage |
| **Grafana Loki** | `3100` | `127.0.0.1:3100` | `/ready` | Structured log storage |
| **Grafana** | `3000` | `127.0.0.1:3000` | `/api/health` | Visualization dashboards |

To stop the containers:
```powershell
docker compose -f deploy/docker-compose.yml down
```

To stop and remove data volumes:
```powershell
docker compose -f deploy/docker-compose.yml down -v
```

---

## 🔒 Security & RBAC Configuration

InfraPulse features Role-Based Access Control (RBAC) backed by persistent PostgreSQL sessions (`sessions` table) and HTTP-only cookies (`infrapulse_session`).

### Pre-seeded Demo Personas (Default Password: `Password123!`)
| User | Email | Role | Permitted Actions |
|---|---|---|---|
| **Sarah Chen** | `sarah.chen@infrapulse.io` | **`admin`** | Full access: user management, alert rules, rollbacks, fault injections, security audit trail, notification settings, test pings. |
| **Marcus Vance** | `marcus.v@infrapulse.io` | **`responder`** | Operational access: triage/acknowledge alerts, resolve incidents, run investigations, retry notifications. Cannot edit alert rules or view audit trail. |
| **Alex Ross** | `alex.ross@infrapulse.io` | **`viewer`** | Read-only access: view topology, dashboards, alerts, metrics, incidents. Cannot mutate state. |

### First-Admin Bootstrap Principle
When registering a user on an empty database, the very first user automatically receives the `admin` role. All subsequent registrations default to `viewer`. Users cannot self-elevate roles.

---

## 📡 Operational Health Probes

InfraPulse implements dedicated operational health endpoints designed for container orchestrators:

- **Liveness Probe**: `GET /api/health/live`
  - Verifies that the Node.js event loop and Express process are responsive.
  - Returns HTTP `200` with uptime and PID. Does not depend on external databases, preventing cascading restarts.
- **Readiness Probe**: `GET /api/health/ready`
  - Verifies database connectivity and schema readiness.
  - Returns HTTP `200` when ready to serve traffic; returns HTTP `503 Service Unavailable` if PostgreSQL is unreachable.
  - Credentials, SQL queries, and internal stack traces are strictly omitted.

Verify health via PowerShell:
```powershell
.\scripts\verify-release.ps1 -BaseUrl "http://localhost:5000"
```

---

## 📜 Logging & Observability

### Structured JSON Logging
All HTTP traffic and operational events are logged as structured JSON objects:
```json
{
  "timestamp": "2026-10-30T04:30:00.000Z",
  "severity": "INFO",
  "service": "infrapulse-backend",
  "message": "HTTP Request",
  "correlationId": "corr_7e3b8a1c92",
  "method": "POST",
  "route": "/api/incidents",
  "statusCode": 201,
  "durationMs": 14,
  "ip": "127.0.0.1"
}
```

### Sensitive Data Redaction
The logger automatically redacts sensitive parameters from request headers, cookies, and audit payloads:
- Authorization tokens & bearer credentials
- Passwords and password hashes
- Slack webhook tokens & query parameters
- SMTP credentials & session IDs

---

## 📦 Database Backup & Release Sequence

### Safe Release Workflow
1. **Pre-Deployment Test**: Run unit and integration tests (`npm test`).
2. **Pre-Migration Snapshot**: Back up production database prior to schema changes:
   ```powershell
   .\scripts\backup-db.ps1
   ```
3. **Apply Forward-Compatible Migrations**:
   ```powershell
   npm run db:migrate
   ```
4. **Deploy Application Containers**: Deploy backend and frontend containers.
5. **Verify Health**: Execute release probe to verify live traffic readiness:
   ```powershell
   .\scripts\verify-release.ps1
   ```

### Restoring Database from Backup
```powershell
# Using pg_restore:
& "pg_restore" -h localhost -p 5434 -U postgres -d infrapulse -c "backups\infrapulse_backup_YYYYMMDD_HHMMSS.sql"
```

---

## 🔌 Enterprise Integrations & Platform Ecosystem (Phase 19)

InfraPulse features an extensible, multi-tenant integration architecture connecting external CI/CD, container orchestration, metrics, alerting, messaging, and distributed tracing systems:

| Provider | Category | Direction | Capabilities |
|---|---|---|---|
| **GitHub** | Source Control & CI/CD | Inbound Webhooks | Ingests `push`, `pull_request`, `release`, and `workflow_run` events with constant-time HMAC-SHA256 signature verification and replay prevention. |
| **Kubernetes** | Container Orchestration | Read-Only Ingestion | Collects pods, deployments, readiness, and warning events (`CrashLoopBackOff`, `ImagePullBackOff`, `OOMKilled`). **Architectural Guarantee**: Strictly read-only; zero mutation capabilities. |
| **Prometheus** | Metric Observability | Query Engine | Executes PromQL instant & range queries with bounded timeouts. Distinguishes unavailable telemetry from healthy 0 metrics. Feeds SLO evaluations and RCA. |
| **Grafana** | Dashboards & Alerting | Inbound Webhooks & Deep Links | Ingests Grafana alert webhooks, associates dashboard URLs directly into incident investigations, and normalizes into canonical alert events. |
| **Slack** | Incident Messaging | Outbound Webhooks | Dispatches Block Kit notifications for incidents, alerts, SLO breaches, runbook approvals, and operational recommendations via persistent PostgreSQL queue. |
| **OpenTelemetry (OTLP)** | Telemetry Pipeline | Inbound HTTP OTLP | Ingests OTLP JSON traces (`/api/integrations/otlp/v1/traces`), metrics (`/metrics`), and logs (`/logs`) with 2MB payload limits, token auth, and canonical normalization. |

### Credential Security Architecture
- **Encryption at Rest**: All integration secrets (tokens, API keys, webhook secrets) are encrypted using authenticated **AES-256-GCM** with 96-bit random IVs and 128-bit authentication tags.
- **Envelope Key Rotation**: Credentials support versioned re-encryption and secret rotation without breaking running adapters.
- **Zero Plaintext Leakage**: Secret values are deeply redacted from API responses, audit logs, and frontend application state (`redactedPreview`).

---

## 🧪 Automated Testing

InfraPulse includes a native ESM test suite covering PostgreSQL persistence, transactions, idempotency, RCA scoring, fault injection, unified timelines, RBAC authorization, notification delivery queues, and enterprise ecosystem integrations:

```powershell
npm test
```
- **Backend Core**: 59 passing tests.
- **Reliability & Chaos**: 8 passing tests.
- **RCA Engine Enhancement**: 11 passing tests.
- **Runbook Remediation**: 15 passing tests.
- **SLO & Error Budgets**: 15 passing tests.
- **Deployment & Change Intelligence**: 15 passing tests.
- **Unified Observability Correlation**: 15 passing tests.
- **Operational Intelligence**: 15 passing tests.
- **Enterprise Integrations Ecosystem**: 15 passing tests.
- **Total Test Suite**: **168 passing tests** across 9 comprehensive suites with 0 failures.
- **Frontend Build**: `npm run build` (Vite production bundle compiled with 0 errors).

---

## ⚙️ Environment Variables Reference

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Runtime mode (`development`, `production`, `test`). |
| `PORT` | `5000` | Backend HTTP listening port. |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin for web client. |
| `APP_BASE_URL` | `http://localhost:5173` | Base URL used in Slack & Email deep links. |
| `PGHOST` | `localhost` | PostgreSQL host. |
| `PGPORT` | `5434` / `5432` | PostgreSQL port. |
| `PGDATABASE` | `infrapulse` | Production database name. |
| `PGDATABASE_TEST`| `infrapulse_test` | Isolated test database name. |
| `PGUSER` | `postgres` | Database username. |
| `PGPASSWORD` | `postgres` | Database password. |
| `NOTIFICATION_WORKER_ENABLED` | `true` | Runs queue processor inside server (set `false` for standalone worker). |
| `NOTIFICATION_MOCK_MODE` | `true` | Simulates delivery in-memory without outbound network calls. |
| `INTEGRATION_ENCRYPTION_KEY` | Development key | 32-byte secret key for AES-256-GCM integration credential encryption. |
| `SLACK_WEBHOOK_URL` | None | Slack incoming webhook endpoint (`https://hooks.slack.com/...`). |
| `SMTP_HOST` | None | SMTP relay host (e.g. `smtp.mailgun.org`). |
| `SMTP_PORT` | `587` | SMTP relay port. |
| `SMTP_USER` | None | SMTP username. |
| `SMTP_PASS` | None | SMTP password. |
| `SMTP_FROM` | `alerts@infrapulse.io` | Sender address on outbound email dispatches. |

---

## ⚠️ Known Limitations
1. **Container Runtime Verification**: Docker Engine was verified as installed on the local system (`Docker v29.8.2`, `Compose v5.6.0`), but the local daemon was inactive during testing. All Dockerfiles and configurations were statically verified.
2. **Cloud Remediation**: Real cloud infrastructure mutations (AWS, GCP, Azure) are guarded by simulation safety policies. Fault injection operates on simulated data models only.
