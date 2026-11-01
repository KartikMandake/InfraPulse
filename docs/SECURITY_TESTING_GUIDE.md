# InfraPulse Security Testing Guide

## 1. Automated Security Test Suites

InfraPulse maintains comprehensive automated regression test suites covering authentication, authorization, multi-tenant isolation, SSRF prevention, rate limiting, and plan integrity.

### 1.1 Running the Security Test Suites

```bash
# Run the dedicated Phase 27 Security Hardening regression suite
node --test tests/production/securityHardening.test.mjs

# Run the Production Preparation suite (TLS, secrets, rate limiting, shutdown)
node --test tests/production/productionPreparation.test.mjs

# Run the Self-Monitoring & Metric Auth suite
node --test tests/production/selfMonitoring.test.mjs

# Run the complete backend test suite (60 tests)
npm run test:backend

# Run the static secret scan audit
node scripts/securityAudit.js
```

---

## 2. Security Test Matrix

| Test Category | Target File | Verification Criteria |
|---|---|---|
| **Password Security** | `securityHardening.test.mjs` | Bounded length (8..128 chars), whitespace rejection, bcrypt hash verification |
| **Timing Attack Protection** | `securityHardening.test.mjs` | Dummy compare execution on non-existent users; uniform execution latency |
| **Separation of Duties** | `securityHardening.test.mjs` | Requesters cannot approve their own runbook executions or remediation plans |
| **Two-Person Approval** | `remediationApproval.service.js` | High-risk actions require two distinct administrators; same approver rejected |
| **Multi-Tenant Context** | `securityHardening.test.mjs` | `withTenant` prevents context switching; `tenantBoundary` blocks param spoofing |
| **SSRF Protection** | `securityHardening.test.mjs` | Cloud metadata IPs (`169.254.169.254`) and loopbacks blocked by `validateEndpointUrl` |
| **HTTP Security Headers** | `securityHardening.test.mjs` | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `COOP`, `CORP`, `CSP` |
| **Sensitive Redaction** | `securityHardening.test.mjs` | Passwords, tokens, API keys, database connection strings redacted in logs |
| **SQL Injection** | `securityHardening.test.mjs` | Parameterized execution safely handles malicious quote and DROP TABLE payloads |
| **RBAC Enforcement** | `securityHardening.test.mjs` | Viewers denied mutating actions with 401/403; Responders denied admin routes |
| **Plan Immutability** | `planIntegrity.js` & DB trigger | Canonical SHA-256 hash mismatch aborts plan execution; DB trigger blocks UPDATE |
| **Secret Leak Scan** | `securityAudit.js` | Zero unredacted API keys, private keys, or Slack webhooks across trackable files |

---

## 3. Manual Penetration Testing Checklist

- [x] Test SQL injection in query parameters (`id`, `serviceId`, `status`, `search`).
- [x] Test Cross-Site Scripting (XSS) in alert summaries, service names, and runbook definitions.
- [x] Verify that changing `tenantId` in POST bodies returns 403 Forbidden.
- [x] Verify that demoting an admin immediately revokes active sessions.
- [x] Confirm that `/metrics` scrape endpoint returns 401 when token authentication is enabled and token is missing.
- [x] Verify that AWS lifecycle mutations fail closed when `AWS_LIFECYCLE_MUTATIONS_ENABLED` is false.
- [x] Confirm that CORS rejects unallowlisted origins in production mode.

