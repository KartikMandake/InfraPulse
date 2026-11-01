# InfraPulse Operational Self-Monitoring Alerts

## 1. Overview

InfraPulse maintains an internal operational alerting engine (`selfMonitoringAlerts.service.js`) designed to detect platform failure modes, saturation, and latency spikes across its own subsystems.

Operational self-alerts are completely decoupled from customer infrastructure alerts:
- They do not emit customer-facing notifications or trigger customer incident escalation.
- They operate with deterministic cooldown periods to prevent alert thrashing.
- They evaluate both in-memory rolling performance windows and active process/database states.

---

## 2. Platform Operational Alert Rules

| Alert ID | Subsystem | Severity | Trigger Threshold | Cooldown | Evaluation Window | Mitigation |
|---|---|---|---|---|---|---|
| `backend_5xx_surge` | Backend | `CRITICAL` | HTTP 5xx rate >= 5.0% (min 50 events) | 15 minutes | 5-minute rolling window | Inspect uncaught exceptions, check DB connectivity, inspect stderr logs |
| `high_api_latency` | Backend | `WARNING` | P95 latency >= 500ms (min 50 events) | 15 minutes | 5-minute rolling window | Inspect event loop lag, check slow SQL queries, review Node.js CPU |
| `database_pool_exhaustion` | Database | `CRITICAL` | Active pool ratio >= 85% or waiting > 0 | 15 minutes | Real-time connection poll | Scale PostgreSQL `max` pool, check unreleased transaction handles |
| `worker_heartbeat_lost` | Worker | `CRITICAL` | Heartbeat age >= 120s or healthy = false | 15 minutes | Real-time file & memory poll | Restart standalone worker container, verify worker database connectivity |
| `notification_queue_growth` | Notifications | `WARNING` | Pending queue backlog >= 100 items | 15 minutes | PostgreSQL delivery table poll | Check Slack/SMTP downstream provider availability, examine retry backoffs |
| `telemetry_dead_letter_surge` | Telemetry | `WARNING` | Dead-letter queue >= 100 unparseable items | 15 minutes | Dead-letter table poll | Inspect telemetry format changes, check OTLP schema compatibility |

---

## 3. Cooldown & Deduplication State Machine

- When a condition fires, an alert transitions from `HEALTHY` to `FIRING`.
- `firstTriggeredAt` records the initial event time.
- `lastTriggeredAt` is refreshed on every evaluation cycle that the condition persists.
- `cooldownUntil` is set to `now + cooldownMs`.
- When the condition resolves, the alert transitions to `RESOLVED` with `resolvedAt` timestamp.
- The UI and API report both `totalFiring` and `totalResolved`.

