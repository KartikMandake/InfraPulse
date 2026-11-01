# Changelog

All notable changes to the **InfraPulse** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-01

### Added
- **Deterministic RCA Engine**:
  - Implemented multi-factor causal graph ranking combining anomaly severity (30%), deployment regression (25%), causal topology position (25%), and error signals (20%).
  - Added statistical baseline deviation calculation and anti-double-counting signal adjustments.
  - Achieved 85.7% Top-1 accuracy and 100% Top-3 accuracy on standard evaluation benchmark dataset.
- **Evidence-Grounded AI Investigation Assistant**:
  - Multi-provider support (OpenAI, Google Gemini, Anthropic, and local deterministic mock).
  - Grounded context retrieval strictly constrained by active runtime telemetry.
  - Prompt injection defense, 8,192-character message bounds, and graceful offline fallback to deterministic RCA.
- **Governed Automated Remediation & Runbooks**:
  - Multi-party approval workflows enforcing Separation of Duties (requester cannot self-approve).
  - Cryptographic plan sealing via canonical SHA-256 `planHash` verification.
  - Global emergency kill switch instantly blocking all mutating cloud/container operations.
  - Workload protection guardrails prohibiting database stopping, restarting, or scaling to zero.
- **Autonomous SRE Intelligence**:
  - Predictive statistical forecasting using Ordinary Least Squares (OLS) regression for memory growth and disk exhaustion.
  - Capacity optimization detecting low-utilization compute workloads (< 15% CPU) and orphaned storage charges.
  - Evidence-backed SRE operational improvement recommendations.
- **Multi-Cloud Lifecycle Governance**:
  - Docker container and Compose service lifecycle management with graceful shutdown timeouts.
  - Kubernetes deployment discovery, replica scaling (1..N), and PodDisruptionBudget availability checks.
  - Read-only AWS discovery in `ap-south-1` for EC2, EBS, RDS, and Elastic IPs.
  - Infrastructure drift detection with deterministic SHA-256 baseline hashing.
- **Observability & Telemetry Pipeline**:
  - Canonical event normalization across 8 event types (deployments, alerts, metrics, traces, logs, changes, lifecycle, drift).
  - OpenTelemetry OTLP trace and metric ingestion; Prometheus vector query execution; Loki log parsing.
  - Sliding window event deduplication and chronological out-of-order reassembly.
  - Telemetry dead-letter queue isolating malformed or expired payloads.
- **Multi-Window SLO & Reliability Tracking**:
  - SLI computation for availability, latency, and error rate.
  - Multi-window fast burn (1h, 6h) and slow burn (24h, 30d) error-budget alerting.
  - Service reliability score (0–100) with explainable factor point impact.
  - Zero-traffic integrity reporting NULL compliance rather than false 100%.
- **Platform Self-Monitoring**:
  - Prometheus `/metrics` scrape endpoint with Bearer token authentication.
  - Multi-subsystem health overview API (`/api/self-monitoring/overview`).
  - 7 production-grade Grafana dashboard configurations.
- **Disaster Recovery**:
  - Automated database backup and restore scripts for PowerShell (`backup-db.ps1`, `restore-db.ps1`) and Bash (`backup-db.sh`, `restore-db.sh`).
  - 22 idempotent database migrations verified on PostgreSQL 16.

### Security
- **PostgreSQL Row-Level Security (RLS)**: Enforced RLS across all public tables using `infrapulse_tenant_runtime` with `NOBYPASSRLS`.
- **Tenant Context Enclosure**: Background notification dispatcher wrapped inside `withTenant` context.
- **Password Hardening**: Minimum 8 characters, maximum 128 characters, and whitespace rejection enforced.
- **Timing Attack Mitigation**: Dummy bcrypt hash comparison on non-existent users to eliminate timing disparities.
- **Session Revocation**: Automatic session invalidation upon user role update or demotion.
- **SSRF Protection**: Strict blocking of cloud metadata IP (`169.254.169.254`), loopback addresses, and private subnets.
- **Security Headers**: Production headers enforced (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`).
- **Secret Scrubbing**: Deep recursive redaction of tokens, passwords, and private keys from logs, traces, and metrics.
- **Container Hardening**: Non-root execution (`USER node` / `USER 101:101`), `read_only: true`, `cap_drop: [ALL]`, and memory/CPU limits.

### Fixed
- **DEF-29-01**: Resolved missing `approved_plan_hash` column handling in `remediationRepository.createApproval`.
- **Timing Enumeration**: Fixed user enumeration disparity in `auth.service.js` via constant-time dummy bcrypt hashing.
- **Route RBAC**: Added explicit `requireRole('admin', 'responder')` to unshielded mutating endpoints.
- **Background Worker Tenant Context**: Fixed un-enclosed batch claiming in notification dispatcher.

