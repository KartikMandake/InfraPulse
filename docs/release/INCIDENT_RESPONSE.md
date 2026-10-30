# InfraPulse — Operational Incident Response Guide

**Phase 20 Release Engineering Deliverable**  
**Audience**: On-Call SREs, Incident Commanders, Platform Responders  
**Platform Version**: 2.4.0  

---

## 1. Incident Severity Definitions

| Severity | Definition | Response Target | Notification Channels |
|---|---|---|---|
| **SEV-1** | Total platform outage, database corruption, or complete loss of ingestion and alerting | Page On-Call immediately (< 5 min) | PagerDuty high-urgency, Slack `#incidents-war-room`, SMS |
| **SEV-2** | Critical service impairment, elevated RCA latency (>2s), or notification worker stall | Page On-Call (< 15 min) | Slack `#incidents-war-room`, Email |
| **SEV-3** | Degraded non-critical integration (e.g. Grafana webhook sync failure), minor UI glitch | Business hours (< 2 hrs) | Slack `#sre-alerts` |
| **SEV-4** | Cosmetic defect or low-impact documentation discrepancy | Next sprint planning | Jira / GitHub Issue |

---

## 2. Standard Operating Procedures (SOP)

### SOP-01: High P99 Investigation Latency Spike
1. **Diagnosis**: Check PostgreSQL connection pool utilization and query locks:
   ```sql
   SELECT pid, age(clock_timestamp(), query_start), usename, query
   FROM pg_stat_activity
   WHERE state != 'idle' AND query NOT ILIKE '%pg_stat_activity%'
   ORDER BY age DESC;
   ```
2. **Mitigation**: Terminate hung long-running analytical queries:
   ```sql
   SELECT pg_terminate_backend(<PID>);
   ```
3. **Runbook**: Execute Runbook `RB-DB-01` to recycle pooled database connections safely.

### SOP-02: Notification Worker Queue Backlog
1. **Diagnosis**: Check count of pending and stuck deliveries:
   ```sql
   SELECT status, COUNT(*), MIN(created_at)
   FROM notification_deliveries
   WHERE status IN ('pending', 'processing')
   GROUP BY status;
   ```
2. **Mitigation**: If worker crashed, restart the worker container:
   ```bash
   docker compose -f deploy/docker-compose.yml restart worker
   ```
3. **Verification**: Confirm deliveries are claimed and status transitions to `sent`.

### SOP-03: Webhook Verification Failures (401 Unauthorized)
1. **Diagnosis**: Check GitHub or Grafana integration status in `/integrations` or query audit logs:
   ```sql
   SELECT * FROM integration_health_events ORDER BY created_at DESC LIMIT 5;
   ```
2. **Mitigation**: Rotate webhook secret in `/integrations` modal and update the webhook secret on GitHub repository settings.

---

## 3. Postmortem & Corrective Actions Process

1. Every SEV-1 and SEV-2 incident requires a blameless postmortem within 48 hours.
2. Utilize the Reports & Postmortems engine (`/reports`) to automatically compile:
   - Time to Detection (TTD) and Time to Remediation (TTR).
   - Investigation timeline milestones and RCA candidate rankings.
   - Runbook execution history and human approvals.
3. Track corrective action items as preventive recommendations in `/operations`.

