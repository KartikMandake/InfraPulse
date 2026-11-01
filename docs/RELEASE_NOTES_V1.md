# InfraPulse v1.0.0 — Official Release Notes

**Release Version**: v1.0.0  
**Release Target**: Production Ready (Self-Hosted, On-Premise, Container Orchestration)  
**Release Date**: November 1, 2026  
**Repository**: `https://github.com/KartikMandake/InfraPulse`  
**License**: MIT  

---

## 🌟 Welcome to InfraPulse v1.0.0

InfraPulse v1.0.0 marks the first stable general availability release of the **Autonomous SRE Observability, Deterministic Root Cause Analysis & Governed Incident Remediation Platform**.

Built from the ground up to eliminate alert fatigue, break down telemetry silos, stop hallucinated AI diagnostics, and govern infrastructure remediations, InfraPulse unites:
- Time-aligned canonical telemetry correlation.
- A mathematically grounded, deterministic Root Cause Analysis (RCA) engine.
- An evidence-constrained, hallucination-resistant AI Investigation Assistant.
- Multi-party governed runbooks and infrastructure lifecycle management.
- Multi-window SLO tracking and autonomous SRE intelligence.

---

## 🚀 Key Highlights & New Capabilities in v1.0.0

### 1. Deterministic Root Cause Analysis (RCA) Engine
- **Mathematical Confidence Scoring**: Evaluates candidate root causes using weighted statistical factors:
  - Anomaly severity and baseline deviation (30%).
  - Temporal deployment correlation (25%).
  - Causal graph topology position (callee cause vs caller symptom) (25%).
  - Log, trace, and metric error evidence (20%).
- **Benchmark Evaluation**: Achieves **85.7% Top-1 accuracy**, **100% Top-3 accuracy**, and **0.929 Mean Reciprocal Rank (MRR)** across standardized outage scenarios with an average execution duration of **2.85 ms** (9,143 evaluations/second direct throughput).
- **Anti-Double-Counting**: Prevents cascaded downstream alerts or redundant trace errors from artificially inflating candidate scores.

### 2. Evidence-Constrained AI Investigation Assistant
- **Strict Grounding**: The AI assistant references only verified runtime signals, active alerts, topology graphs, and timeline events provided in the execution context.
- **Decoupled Architecture**: If the external AI provider is offline (HTTP 503) or times out, the core platform seamlessly falls back to deterministic RCA results without failure.
- **Safety Defenses**: Enforces prompt injection defense, 8,192-character input bounding, and recursive scrubbing of sensitive API keys, bearer tokens, and credentials.

### 3. Multi-Party Governed Runbook & Remediation Intelligence
- **Separation of Duties**: Requester cannot approve their own remediation requests. High-risk operations mandate independent administrator sign-off.
- **Plan Immutability**: All remediation and reconciliation plans are cryptographically sealed with a canonical SHA-256 `planHash`. Any tampering between approval and execution triggers immediate rejection.
- **Emergency Kill Switch**: A persistent global kill switch instantly halts all mutating operations platform-wide.
- **Database & System Workload Guardrails**: Rejects any restart, stop, or scaling-to-zero of production databases or system namespaces (`kube-system`).

### 4. Enterprise Observability & Self-Monitoring
- **Unified Telemetry Ingestion**: Normalizes OpenTelemetry metrics and traces, Prometheus vectors, Loki logs, Docker container stats, and Kubernetes events into canonical time-aligned events.
- **Internal Self-Monitoring Subsystem**: Exposes Prometheus metrics at `/metrics` and continuously monitors 10 internal subsystems (API, DB, Worker, RCA Engine, SRE Intelligence, etc.).
- **Production Grafana Dashboards**: Includes 7 production-ready Grafana dashboards for platform overview, API performance, database health, RCA latency, worker queues, and resource utilization.

### 5. Multi-Tenant Security & PostgreSQL Row-Level Security
- **PostgreSQL Row-Level Security (RLS)**: Public tables enforce RLS via the `infrapulse_tenant_runtime` role (`NOBYPASSRLS`), guaranteeing strict cross-tenant data isolation at the database engine level.
- **Worker Tenant Enclosure**: Asynchronous background jobs and notification dispatches execute wrapped in strict tenant execution contexts (`withTenant`).
- **Timing Attack Mitigation**: Login verification employs dummy bcrypt hash comparisons on missing users to eliminate username enumeration timing discrepancies.

---

## 📦 Compatibility & Supported Environments

| Component | Supported Version / Specification |
| :--- | :--- |
| **Node.js Runtime** | Node.js v20.x, v22.x, v24.x, and v26.x (Pure ESM) |
| **PostgreSQL** | PostgreSQL 15, 16, and 17 (SCRAM-SHA-256 authenticated) |
| **Docker Engine** | Docker 24.x, 26.x, 27.x, and Docker Compose v2.20+ |
| **Kubernetes** | Kubernetes 1.28, 1.29, 1.30, 1.31 (K3s, EKS, GKE, KinD) |
| **Web Browsers** | Chrome 110+, Firefox 115+, Safari 16+, Edge 110+ |
| **AWS Region** | Scoped to `ap-south-1` (Mumbai) for cloud discovery |

---

## 🛠️ Verification & Quality Gate Metrics

- **Backend Unit & Integration Suite**: 60 / 60 passed (100%).
- **Security Regression Suite**: 10 / 10 passed (100%).
- **Self-Observability Suite**: 9 / 9 passed (100%).
- **Cloud Governance & Remediation Suite**: 75 / 75 passed (5 opt-in skipped).
- **Disaster Recovery Migration Verification**: 22 / 22 migrations passed into disposable database (2.55s).
- **Static Secret Audit**: 0 unredacted secrets found across 100% of trackable files.
- **Frontend Production Build**: 82 modules compiled cleanly (Vite v6.4.5, 0 errors).

---

## ⚠️ Important Deployment Notice

- **Self-Hosted & Staging**: Ready for immediate local workstation, bare metal, or Docker container deployment (`deploy/production/compose.yml`).
- **AWS Cloud Target (`ap-south-1`)**: Gated behind explicit budget approval. In strict compliance with the user's out-of-pocket budget limit of ₹0, automated cloud provisioning was halted at the Phase 28 approval gate. To deploy to AWS, follow the operational runbook in [`docs/AWS_DEPLOYMENT_RUNBOOK.md`](AWS_DEPLOYMENT_RUNBOOK.md).

