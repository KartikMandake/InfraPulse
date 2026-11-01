# InfraPulse Enterprise Security Architecture

## 1. Executive Security Architecture Overview

InfraPulse operates as an autonomous observability and SRE intelligence platform. It processes real-time infrastructure telemetry, runs deterministic root-cause analysis (RCA), and governs infrastructure remediations across multi-tenant hybrid cloud environments.

The platform is designed around **Zero Trust**, **Least Privilege**, **Defense in Depth**, and **Deterministic Governance**:
- Every API request authenticates and establishes a verified tenant context.
- Database access enforces PostgreSQL Row-Level Security (RLS) dynamically using `infrapulse.tenant_id` session settings and unprivileged runtime roles.
- Cloud mutations require two-person cryptographic plan approval, hard allowlists, non-production tag enforcement, and are bounded by explicit kill-switches.
- Telemetry ingestion is strictly segregated from internal self-monitoring to prevent recursive loops and state leakage.

---

## 2. Core Security Boundaries

```
+-------------------------------------------------------------------------------------------------+
|                                    INFRAPULSE SECURITY PERIMETER                                |
|                                                                                                 |
|   +-----------------------+     W3C Trace & CSRF       +------------------------------------+   |
|   |      Browser UI       | ------------------------>  |       Edge Nginx / Reverse Proxy   |   |
|   | (React SPA / Vite)    | <------------------------  | (TLS Term, HSTS, Rate Limit, CSP)  |   |
|   +-----------------------+                            +-----------------+------------------+   |
|                                                                          |                      |
|                                                   HTTP / JSON Body Limit | 2MB                  |
|                                                                          v                      |
|                                                        +------------------------------------+   |
|                                                        |         Express API Gateway        |   |
|                                                        | - requestLogger (Correlation IDs)  |   |
|                                                        | - securityHeaders (CSP, nosniff)   |   |
|                                                        | - requireHttps & rateLimiters      |   |
|                                                        | - csrfProtection (Origin check)    |   |
|                                                        | - authenticate & tenantBoundary    |   |
|                                                        +-----------------+------------------+   |
|                                                                          |                      |
|                           +----------------------------------------------+                      |
|                           |                                                                     |
|                           v                                              v                      |
|             +----------------------------+                 +----------------------------+       |
|             |   Role-Based Authorization |                 | Ingestion Identity Router  |       |
|             |  (Admin, Responder, Viewer)|                 | (HMAC Webhooks / OTLP Auth)|       |
|             +-------------+--------------+                 +-------------+--------------+       |
|                           |                                              |                      |
|                           v                                              v                      |
|             +---------------------------------------------------------------------------+       |
|             |                    Tenant Context Boundary (withTenant)                   |       |
|             |               Enforces tenant isolation in AsyncLocalStorage              |       |
|             +-------------------------------------+-------------------------------------+       |
|                                                   |                                             |
|                                                   v                                             |
|             +---------------------------------------------------------------------------+       |
|             |                 PostgreSQL 16 Connection Layer with RLS                   |       |
|             |           SET LOCAL infrapulse.tenant_id = $tenantId                      |       |
|             |           SET LOCAL ROLE infrapulse_tenant_runtime (NOBYPASSRLS)          |       |
|             +---------------------------------------------------------------------------+       |
+-------------------------------------------------------------------------------------------------+
```

---

## 3. Authentication & Session Management

### 3.1 Password Security
- Passwords hashed using `bcrypt` (10 rounds).
- Length bounded strictly: **Minimum 8 characters, Maximum 128 characters** (mitigates CPU exhaustion / bcrypt DoS).
- Whitespace-only passwords strictly rejected.

### 3.2 Account Enumeration & Timing Protection
- Login authentication executes a dummy bcrypt comparison against a precomputed dummy hash (`DUMMY_BCRYPT_HASH`) when the user email is not found, ensuring uniform response times between existent and non-existent accounts.

### 3.3 Session Management
- Cryptographically secure 256-bit session tokens (`crypto.randomBytes(32)`).
- Session storage bound to `userId` and `tenantId` in PostgreSQL.
- Sessions automatically revoked on security events:
  - Role update / demotion (`updateUserRole`) revokes all active sessions for that user.
  - User suspension revokes all active sessions.
  - Dedicated endpoint `POST /api/auth/revoke-sessions` allows immediate credential rotation.

---

## 4. Role-Based Access Control (RBAC)

InfraPulse defines three platform roles:

| Role | Read Operations | Write / Triage Operations | Critical / Administrative Operations |
|---|---|---|---|
| **`viewer`** | Read services, topology, incidents, alerts, SLOs, runbooks, metrics | **None** (Cannot modify, acknowledge, or triage) | **None** |
| **`responder`** | Read all platform resources | Triage and acknowledge alerts, request runbook/remediation execution, trigger RCA investigations, acknowledge drift | Cannot manage users, cannot alter alert rules, cannot view audit logs, cannot approve high-risk remediations |
| **`admin`** | Read all platform resources | Full operational and triage capabilities | User management, role updates, audit log queries, system config, runbook creation, high-risk plan approval |

---

## 5. Multi-Tenant Isolation & RLS

1. **Database Row-Level Security (RLS)**:
   - Every public application table contains `tenant_id varchar(64)`.
   - Table RLS is enforced via `CREATE POLICY tenant_membership ON <table> TO infrapulse_tenant_runtime USING (tenant_id = current_setting('infrapulse.tenant_id', true))`.
   - The runtime database role `infrapulse_tenant_runtime` is marked `NOLOGIN NOSUPERUSER NOBYPASSRLS`.
2. **Foreign Key Cross-Tenant Triggers**:
   - PostgreSQL trigger `tenant_relations` executes before INSERT or UPDATE, verifying that parent and child foreign keys share identical `tenant_id`.
3. **Application Tenant Boundary**:
   - `tenantBoundary` middleware inspects `req.user.tenantId`.
   - Any mismatched `tenantId` in query string or request body triggers instant `403 Forbidden` (`Tenant identity is derived from authenticated membership`).

---

## 6. Cloud & Lifecycle Governance

1. **Read-Only AWS Discovery**:
   - Enforced by IAM policy denying all mutating actions (`ec2:StopInstances`, `ec2:StartInstances`, `ec2:TerminateInstances`, `iam:*`, `rds:*`).
   - Region strictly restricted to `ap-south-1`.
2. **Mutations Kill-Switch**:
   - `AWS_LIFECYCLE_MUTATIONS_ENABLED`, `DOCKER_LIFECYCLE_ENABLED`, `KUBERNETES_LIFECYCLE_ENABLED`, `REMEDIATION_EXECUTION_ENABLED` default to `false`.
3. **Separation of Duties & Two-Person Approval**:
   - The user who requests a runbook execution or remediation plan cannot approve it.
   - High-risk / critical remediations require two distinct administrator approvals.
   - Plan contents are cryptographically bound via canonical SHA-256 hash (`assertPlanIntegrity`). Any modification to a plan invalidates prior approvals.

