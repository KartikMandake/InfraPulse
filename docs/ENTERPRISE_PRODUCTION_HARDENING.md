# InfraPulse — Enterprise Production Hardening & Operational Architecture

## 1. Executive Summary & Architecture Overview

InfraPulse is an enterprise-grade Observability, Autonomous SRE Intelligence, and Governed Remediation platform. It unifies cloud resource inventory across AWS, Docker, and Kubernetes with live OpenTelemetry, Prometheus, and CloudWatch metrics.

```
       +--------------------------------------------------------------------------+
       |                  InfraPulse Web Console (React / Vite)                   |
       |  - Unified Health   - SRE Predictions   - SLO Burn Rates   - Incident RCA |
       +------------------------------------+-------------------------------------+
                                            | REST API / Reverse Proxy (Nginx)
       +------------------------------------v-------------------------------------+
       |                 InfraPulse API Gateway & Express Backend                 |
       |  - Auth & RBAC (/api/auth)              - Telemetry Normalizer           |
       |  - Cloud Lifecycle (/api/cloud)         - Incident & RCA Engine          |
       |  - Drift Governance (/api/drift)        - Governed Remediation (/api/rem)|
       |  - SRE Intelligence (/api/sre)          - Self-Observability Diagnostics |
       +----+-------------------------------+-------------------------------+-----+
            |                               |                               |
       +----v-----+                   +-----v----+                    +-----v----+
       |  AWS     |                   |  Docker  |                    |   K8s    |
       | Provider |                   | Provider |                    | Provider |
       +----+-----+                   +-----+----+                    +-----+----+
            |                               |                               |
+-----------v-------------------------------v-------------------------------v-----+
|                   PostgreSQL 16 Durable Persistence (18 Migrations)             |
| - Tenant Isolated Multi-Schema Partitioning  - Composite Query Performance Idxs  |
| - SLA & SLO Error Budget Ledger             - Cryptographic Plan Audit Trail    |
+---------------------------------------------------------------------------------+
```

---

## 2. Security Architecture & Hardening

### Authentication & Token Security
- **Argon2 / Scrypt Hashing**: Passwords hashed with high iteration count; plaintext passwords are never logged, returned in JSON, or stored.
- **Session Expiration & Revocation**: Server-side session tokens with idle TTL (60 minutes) and explicit logout revocation.

### Role-Based Access Control (RBAC)
- `viewer`: Read-only access to dashboards, topology, incidents, and health metrics. Blocked with `403 Forbidden` from initiating lifecycle mutations or changing policies.
- `responder`: Allowed to triage incidents, acknowledge alerts, execute non-destructive dry-run evaluations, and request remediation approvals.
- `admin`: Privileged authority to modify alert policies, manage team credentials, and provide 2-person cryptographic approval on remediation plans.

### Multi-Tenant Isolation
- Strict database indexing and query filtering on `tenant_id` and `environment`.
- Cross-tenant requests to recommendations, approvals, dead-letter items, or incident evidence reject with empty or forbidden results.

### Network Boundary & SSRF Protection
- Prometheus, Kubernetes and Docker HTTP transports validate endpoints and resolve through [the endpoint policy](../backend/src/security/endpointPolicy.js), checking every resolved address and rejecting redirects. Other outbound clients require their own transport review before production approval.
- Link-local (`169.254.0.0/16`), cloud instance metadata (`169.254.169.254`, `metadata.google.internal`), loopback (`127.0.0.0/8`), and RFC1918 private subnets are blocked by default.

---

## 3. Telemetry Pipeline & Reliability

- **Chronological Sorting & Deduplication**: Telemetry payloads are sorted by event timestamp; tenant/environment/provider-scoped database claims prevent duplicate side effects across processes and restarts. Canonical persistence and claim processing share a transaction. Define retention and monitor claim-table growth before production operation.
- **Dead-Letter Auditing**: Payloads with invalid timestamps, corrupt JSON, or unresolvable metrics route directly to `telemetry_dead_letter` with specific error codes (`INVALID_TIMESTAMP`, `FUTURE_TIMESTAMP_EXCEEDED`).
- **Freshness Monitoring**: Real-time evaluation of datasource ingestion intervals. Telemetry older than 300 seconds is flagged as `STALE`, dropping health evaluation confidence from `HIGH` to `MEDIUM` or `LOW`.

---

## 4. Governed Remediation Safeguards (Phase 23J)

InfraPulse enforces strict zero-trust operational safety:
1. **Disabled by Default**: `REMEDIATION_EXECUTION_ENABLED=false` and `REMEDIATION_PRODUCTION_ENABLED=false`. Mutations in production are strictly forbidden out-of-the-box.
2. **Prohibited Action Matrix**:
   - `RESOURCE_DELETE`, `DATABASE_DELETE`, `DATABASE_RESTART`, `VOLUME_DELETE`, `SCALE_TO_ZERO`, `EXECUTE_SHELL_COMMAND` are unconditionally blocked by policy.
3. **Separation of Duties & Two-Person Approval**:
   - The user who requests a remediation plan cannot approve it.
   - Requires cryptographic approval from an independent Administrator.
4. **Plan Immutability**:
   - Remediation plans generate a SHA-256 hash upon dry-run. If parameters or targets change prior to approval, the hash check fails and execution is blocked.
5. **Workload Protection**:
   - Critical database workloads (`postgres`, `mysql`, `mongo`) and Kubernetes control plane namespaces (`kube-system`) cannot be stopped or scaled down.

---

## 5. Autonomous SRE Intelligence (Phase 23K)

- **Unified Infrastructure Health**: Combines CPU, memory, disk, network, container readiness, K8s replica states, and AWS instance health. Strictly rejects the assumption that missing telemetry equals healthy infrastructure.
- **Mathematical Forecasting**: Uses Ordinary Least Squares (OLS) linear regression to calculate consumption slopes ($%/hr), $R^2$ variance, and project Time-to-Exhaustion (TTE).
- **SLO Error Budget Multi-Window Burn Rates**:
  - Fast-burn multiplier ($\ge 14.4\times$) alerts when 100% of a 30-day budget will exhaust in 2 days.
  - Slow-burn multiplier ($\ge 3.0\times$) alerts when budget will exhaust in 10 days.

---

## 6. Disaster Recovery & Backup Verification

### Recovery evidence and limits

Production RPO and RTO are **NOT VERIFIED**. A migration-only schema replay measures initialization, not recovery of persisted application data. `node tests/release/verifyDatabaseRecovery.js` is a schema-replay check and must not be used as proof of data restoration or a production RTO.

Phase 23M verified a logical custom-format PostgreSQL dump restored real rows and matching per-table hashes in an isolated Windows cluster. PostgreSQL also performed automatic internal crash recovery after an interrupted local process. **Archived-WAL/PITR is NOT VERIFIED**: archive mode was off, and no base backup plus archived WAL restoration was exercised. Hourly logical dumps cannot justify a 15-minute RPO. Configure, retain and restore-test an actual archival/base-backup system before claiming that objective.

### Logical backup and restore (Windows)

Use explicit host, port and database parameters. Restore into a newly created disposable database; the restore script uses `--clean --if-exists` and overwrites target objects. Apply only to the intended target. A backup is sensitive and requires protected storage. The migration-created tenant runtime role must exist in the destination PostgreSQL cluster before restoring policies that reference it.

```powershell
.\scripts\backup-db.ps1 -BackupDir .\backups -DbHost 127.0.0.1 -DbPort 5542 -DbUser postgres -DbName <disposable-source>
.\scripts\restore-db.ps1 -BackupFile <custom-format-archive> -DbHost 127.0.0.1 -DbPort 5542 -DbUser postgres -DbName <new-disposable-target>
```

Scripts: [Windows backup](../scripts/backup-db.ps1), [Windows restore](../scripts/restore-db.ps1), [POSIX backup](../scripts/backup-db.sh), [POSIX restore](../scripts/restore-db.sh). Windows local PostgreSQL paths were exercised. POSIX paths, Docker fallback branches, production restore, failover and archival-PITR remain NOT VERIFIED. Refer to [Phase 23M evidence](PHASE_23M_RUNTIME_VALIDATION_REPORT.md) for the exact tested scope and commands.
