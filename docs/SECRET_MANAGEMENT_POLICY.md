# InfraPulse Secret Management Policy

## 1. Core Principles

1. **Zero Secret Persistence in Version Control**:
   - Production secrets, API tokens, database passwords, and encryption keys must never be committed to Git.
   - All `.env` and `.env.*` files (except `.env.example` and `.env.staging.example`) are ignored in `.gitignore`.
2. **File-Based Secret Provisioning in Production**:
   - Docker Compose in production mounts secrets via `/run/secrets/` (`PGPASSWORD_FILE`, `INTEGRATION_ENCRYPTION_KEY_FILE`, `SELF_MONITORING_METRICS_TOKEN_FILE`).
   - Prevents leakage via `docker inspect` or process environment inspection (`/proc/1/environ`).
3. **No Secret Printing or Logging**:
   - Application logger recursively redacts 18 sensitive key patterns.
   - Error messages strip database connection strings and raw SQL statements before responding to clients.
4. **Separation of Environments**:
   - Staging, CI/CD, and Production secrets must be strictly segregated with zero key reuse.

---

## 2. Sensitive Keys & Redaction Patterns

The following keys and patterns are automatically stripped or masked as `[REDACTED]`:
- `password`, `passwordhash`
- `token`, `sessiontoken`, `sessionid`
- `secret`, `webhooksecret`, `signingsecret`
- `cookie`, `authorization`, `credential`
- `apikey`, `smtp_pass`, `slackwebhookurl`
- `ingestionkey`, `accesskey`, `privatekey`
- `connectionstring`, `database_url`

---

## 3. Secret Rotation Procedures

### 3.1 Database Password Rotation
1. Create new database credentials in PostgreSQL.
2. Update the secret file mounted at `/run/secrets/app_db_password`.
3. Perform a rolling restart of backend containers.
4. Verify readiness probes (`GET /api/health/ready`).
5. Revoke old database credentials.

### 3.2 Integration Encryption Key Rotation
1. Integrations use AES-256-GCM.
2. In production, rotate key via `scripts/release/` tools or admin rotation endpoint `POST /api/integrations/:id/rotate-credentials`.
3. Audit log records `action: 'integration.credentials_rotated'`.

### 3.3 Session Token Invalidation
1. To revoke a specific session: Call `POST /api/auth/logout`.
2. To revoke all sessions for an affected user: Call `POST /api/auth/revoke-sessions`.
3. In case of user role modification or account suspension, sessions are automatically revoked via `sessionsRepo.deleteUserSessions(userId)`.

