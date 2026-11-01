# InfraPulse Threat Model (STRIDE Methodology)

## 1. Scope & System Definition

InfraPulse ingests infrastructure telemetry (metrics, traces, logs), runs deterministic root-cause analysis (RCA), and executes governed remediation actions against cloud and container infrastructure.

This threat model identifies key threat vectors using the **STRIDE** framework and documents the corresponding security controls.

---

## 2. STRIDE Threat Assessment

### 2.1 Spoofing
- **Threat**: Malicious actor spoofs a tenant identity or caller identity to access resources belonging to another organization.
  - **Mitigation**:
    - Tenant membership is established exclusively on the backend from verified session records (`tenantBoundary`).
    - Query parameter and body overrides (e.g. `?tenantId=...`) are rejected with `403 Forbidden`.
    - Webhook ingestions verify HMAC signatures (`sha256=...`) using timing-safe comparison (`crypto.timingSafeEqual`).
    - OTLP telemetry requires valid 32+ character ingestion tokens bound to specific tenant IDs.

### 2.2 Tampering
- **Threat**: Attacker tampers with an approved remediation plan before execution to perform unauthorized mutations.
  - **Mitigation**:
    - Canonical plan JSON is hashed via SHA-256 (`remediationPlanHash`).
    - PostgreSQL database trigger `immutable_plan` aborts any UPDATE mutation to remediation plan content.
    - Plan execution verifies that `assertPlanIntegrity` matches the approved plan hash. Any alteration invalidates approvals.

### 2.3 Repudiation
- **Threat**: User denies performing a destructive action (e.g., terminating an instance, altering alert rules, modifying roles).
  - **Mitigation**:
    - Centralized audit logging (`audit_logs` table) records `actorId`, `actorEmail`, `tenantId`, `action`, `resourceId`, IP address, and timestamp.
    - All permission denials, authentication failures, role updates, and approvals generate immutable audit events.

### 2.4 Information Disclosure
- **Threat**: Unauthorized exposure of database credentials, cloud secrets, tenant telemetry, or customer PII in logs, error responses, or metrics.
  - **Mitigation**:
    - `logger.js` implements recursive redaction across 18 sensitive key patterns (passwords, tokens, bearer headers, connection strings).
    - `errorHandler.js` returns generic sanitized error messages in production and strips stack traces and SQL details.
    - Metrics labels are strictly bounded and never contain dynamic values, UUIDs, or passwords.
    - PostgreSQL Row-Level Security (RLS) ensures that database queries executed by `infrapulse_tenant_runtime` only return rows matching `tenant_id = current_setting('infrapulse.tenant_id')`.

### 2.5 Denial of Service (DoS)
- **Threat**: Attacker sends massive payloads or high-frequency requests to crash the Node.js event loop or exhaust database connections.
  - **Mitigation**:
    - Express request body limit bounded at 2MB (`express.json({ limit: '2mb' })`).
    - Bcrypt password length capped at 128 characters to prevent CPU exhaustion.
    - Production security middleware applies IP-based rate limiting on authentication and API endpoints.
    - PostgreSQL connection pool bounded with strict timeouts (`max: 6`, `idleTimeoutMillis: 10000`).

### 2.6 Elevation of Privilege
- **Threat**: Viewer elevates their role to Admin or approves their own remediation request.
  - **Mitigation**:
    - Backend RBAC middleware (`requireRole`) protects mutating endpoints on Express routes.
    - Separation of duties strictly prevents requesters from approving their own remediation plans or runbook executions.
    - Registration bootstrap logic locks first user as admin; all subsequent registrations are forced to `viewer` role via advisory database locks (`pg_advisory_xact_lock`).
    - High-risk actions require two distinct administrator approvals.

---

## 3. Attack Surface Inventory

| Attack Surface | Protocol / Port | Authentication | Controls |
|---|---|---|---|
| Web UI | HTTPS / 8080 | Cookie / Session Token | Non-root Nginx container, CSP, HSTS, no-sniff, clickjacking frame denial |
| REST API | HTTPS / 5000 | Bearer / Cookie Session | CSRF verification, rate limiting, request validation, tenant boundary |
| Telemetry Ingestion | HTTP(S) / 5000 | Ingestion Key / HMAC | SSRF validation, isolated ingestion plane, dead-letter quarantine |
| Scrape Endpoint | HTTP / 5000 | Bearer Token (`SELF_MONITORING_METRICS_TOKEN`) | Constant-time token equality check, operator allowlist |
| Database | TCP / 5432 | Username & Password + TLS | Row-Level Security, non-bypassable runtime role, foreign key tenant triggers |
| Cloud Provider (AWS) | HTTPS | AWS SDK Provider Chain | Read-only IAM policy, region allowlist (`ap-south-1`), tag enforcement, kill-switch |

