# InfraPulse Runtime Architecture

**System**: InfraPulse Observability & Incident Intelligence Platform  
**Target Environment**: Self-Hosted Operational Deployment  
**Status**: `ACTIVE & OPERATIONAL`  

---

## 1. System Topology Overview

InfraPulse operates across decoupled tiers separating the presentation layer, the API and RCA correlation intelligence engine, asynchronous task and notification dispatchers, and durable relational persistence:

```
                      ┌────────────────────────────────────────┐
                      │             OPERATOR UI                │
                      │  React + Vite Frontend (Port 5173)     │
                      │  Theme: Midnight / Electric / Lime     │
                      └──────────────────┬─────────────────────┘
                                         │ HTTP / JSON API
                                         ▼
                      ┌────────────────────────────────────────┐
                      │           INFRAPULSE BACKEND           │
                      │     Node.js + Express (Port 5001)      │
                      ├────────────────────────────────────────┤
                      │ • Incident Management & Correlation    │
                      │ • Deterministic RCA Intelligence Engine│
                      │ • Governed Remediation Guardrails      │
                      │ • SRE Multi-Window SLO & Burn Engine   │
                      │ • Integrated Notification Worker       │
                      │ • Prometheus OpenMetrics /metrics      │
                      └──────────────────┬─────────────────────┘
                                         │ TCP (Connection Pool)
                                         ▼
                      ┌────────────────────────────────────────┐
                      │         RELATIONAL DATA TIER           │
                      │       PostgreSQL 16 (Port 5434)        │
                      │       Database: infrapulse_ops_prod    │
                      ├────────────────────────────────────────┤
                      │ • 74 Production Tables                 │
                      │ • 67 Foreign Key Constraints           │
                      │ • 22 Applied Durable Schema Migrations │
                      │ • Append-only Audit Trail & Checkpoints│
                      └────────────────────────────────────────┘
```

---

## 2. Core Operational Components

### 2.1 Frontend Tier (`infrapulse-frontend`)
- **Framework**: React 18 + Vite v6.4.5.
- **Port**: `5173` (served locally at `http://localhost:5173`).
- **Design Tokens**: `#030407` (Midnight Black), `#1558C9` (Electric Cobalt Blue), `#D4FF24` (Acid Lime).
- **Security**: Cookie-based server session tokens, CSRF validation, origin enforcement.
- **Subsystems Active**: Overview Incident Board, Investigation Canvas, Service Topology, Fault Lab, Governed Remediation, SRE Intelligence, and Self-Monitoring Dashboard.

### 2.2 Backend & Engine Tier (`infrapulse-backend`)
- **Runtime**: Node.js v26.4.0 with Express 4.x.
- **Port**: `5001` (listening at `http://localhost:5001`).
- **Telemetry Ingestion**: Event-normalizer pipeline accepting traces, logs, metric anomalies, and deployment regressions.
- **RCA Engine**: Multi-factor candidate scoring evaluating dependency graph distance, telemetry anomaly density, and deployment window alignment.
- **Integrated Worker**: Asynchronous background queue executing retryable notification dispatches with bounded exponential backoff.

### 2.3 Persistence Tier (`PostgreSQL 16`)
- **Host**: `127.0.0.1:5434`.
- **Database**: `infrapulse_ops_prod` (isolated deployment database protecting baseline dev databases).
- **Migration Engine**: 22 sequential migration scripts applied cleanly in sequence.
- **State Guarantees**: ACID transactions, foreign-key relational integrity, immutable plan hashing for remediation approvals.

### 2.4 Self-Monitoring & Observability
- **Metrics Endpoint**: `/metrics` exposing native Prometheus / OpenMetrics format counters and histograms (`infrapulse_http_requests_total`, `infrapulse_rca_duration_seconds`, `infrapulse_worker_queue_depth`).
- **Health Probes**: `/api/health/live` and `/api/health/ready` reporting sub-millisecond database heartbeat latencies.
- **10 Core Monitored Subsystems**: `frontend`, `backend`, `database`, `worker`, `notifications`, `rcaEngine`, `aiAssistant`, `cloudLifecycle`, `scheduler`, and `telemetryPipeline`.
