# InfraPulse Security Incident Response Runbook

## 1. Overview & Severity Matrix

This runbook guides responders and platform administrators through triage, containment, eradication, and post-incident review for security anomalies affecting InfraPulse.

| Severity | Definition | Examples | Response Target |
|---|---|---|---|
| **SEV-1 (Critical)** | Active compromise of platform credentials, cross-tenant data leakage, or unauthorized cloud mutations | Compromised admin session, secret leak in production build, bypass of RLS | **< 15 minutes** |
| **SEV-2 (High)** | Discovered privilege escalation path, SSRF vulnerability, or authentication brute-force surge | Rate-limit failure, unauthorized role update attempt, high 5xx surge from attacks | **< 1 hour** |
| **SEV-3 (Medium)** | Low-impact configuration drift, missing security headers, or localized rate-limit violations | Single IP rate limit hit, failed login spikes, unhandled validation errors | **< 4 hours** |

---

## 2. Containment Procedures

### 2.1 Compromised User Account
1. Suspend the compromised user account:
   - Call `PATCH /api/auth/users/:id/role` or update user status in PostgreSQL: `UPDATE users SET status = 'suspended' WHERE id = $1`.
2. Terminate all active sessions immediately:
   - Run in PostgreSQL or call `sessionsRepo.deleteUserSessions(userId)`: `DELETE FROM sessions WHERE user_id = $1`.
3. Audit recent actions taken by the compromised identity:
   - Run `SELECT * FROM audit_logs WHERE actor_id = $1 ORDER BY created_at DESC;`.

### 2.2 Emergency Infrastructure Mutation Kill-Switch
If an unauthorized or runaway infrastructure remediation is observed:
1. Trigger the Global Cloud Lifecycle Kill Switch:
   - Call `POST /api/cloud/kill-switch` with payload `{ "active": true, "reason": "Emergency security containment" }`.
2. Confirm the state in `cloud_emergency_state`:
   - `SELECT active, enabled_at, reason FROM cloud_emergency_state;`.
3. This instantly blocks all lifecycle operations across AWS EC2, Docker, and Kubernetes providers with `403 Forbidden` (`Cloud lifecycle operations are disabled by emergency kill-switch`).

### 2.3 Suspected Credential / Secret Leakage
1. Invalidate compromised secret immediately in the target service (AWS IAM, GitHub Token, Slack Webhook, Database).
2. Deploy replacement secret file using file-based mounting in `/run/secrets/`.
3. Restart containers cleanly: `docker compose restart backend`.
4. Run `node scripts/securityAudit.js` across source repositories to ensure no residual credentials remain.

---

## 3. Evidence Collection & Post-Incident Review

1. **Audit Logs**:
   - Query `audit_logs` table for timestamps, IPs, actors, and outcomes.
2. **Observability Metrics**:
   - Review `/metrics` and Grafana dashboards for error rate spikes (`infrapulse_http_requests_total{status_class="5xx"}`), connection pool saturation, and event loop lag.
3. **Structured Server Logs**:
   - Inspect JSON logs formatted by `logger.js` containing `correlationId` and `traceId`.
4. Document root-cause and remediation in a postmortem report using the built-in Reports module (`/reports`).

