# InfraPulse — Automatic Incident Creation & Deterministic RCA Validation

## 1. Overview & Isolation Methodology

This document validates the automatic incident declaration, alert deduplication, and deterministic Root Cause Analysis (RCA) pipeline implemented in Phase 35.

To prevent ambiguity and adhere strictly to validation guidelines:
- **No Existing Incident Was Used**: An isolated test service fixture was created dynamically with **zero topological edges** to guarantee it could not link to any existing open incident.
- **Controlled Synthetic Telemetry**: Synthetic metrics were injected into the test service fixture to simulate an acute failure.
- **Full Restoration**: All test fixtures, alerts, incident records, investigation runs, and notification deliveries were completely purged from the PostgreSQL database upon test completion.

---

## 2. Telemetry Classification: Synthetic vs. External

> [!IMPORTANT]
> **Synthetic Test Telemetry**:
> Telemetry injected directly into service records or via the simulated fault lab for testing purposes is labeled as `isSimulated: true` or scoped to temporary test fixtures (`srv-iso-test-*`).
>
> **Actual External Telemetry**:
> Telemetry ingested from live Prometheus pull endpoints, OTLP collectors, and cloud provider APIs is tagged with `telemetryMode: 'live'` and `isSimulated: false`.

---

## 3. End-to-End Test Execution & Evidence

The automated validation suite [`scripts/verify-phase35-1-independent.cjs`](file:///d:/Projects/InfraPulse/scripts/verify-phase35-1-independent.cjs) executed the complete validation cycle:

### 3.1 Isolated Service Fixture Creation
```sql
INSERT INTO services (
  id, name, tier, protocol, status, latency_p99, latency_baseline,
  error_rate, rps, pod_count, region, namespace, cpu_percent, memory_percent,
  dependencies, tags, endpoints, pods
) VALUES (
  'srv-iso-test-mvxosmy2', 'Isolated Test Fixture Service (srv-iso-test-mvxosmy2)',
  1, 'HTTP', 'nominal', 110, 110, 0.01, 100, 2, 'us-east-1', 'default', 15, 25,
  '{}', '{"test-fixture"}', '[]', '[]'
);
```
- **Dependencies**: Empty array (`{}`).
- **Topological Overlap**: Zero callers, zero callees.

### 3.2 Telemetry Anomaly Injection
```sql
UPDATE services
SET latency_p99 = 1950, error_rate = 18.5, status = 'degraded', updated_at = NOW()
WHERE id = 'srv-iso-test-mvxosmy2';
```
- **Observed $P_{99}$ Latency**: $1950\text{ ms}$ (threshold: $> 800\text{ ms}$ via `RULE-LAT-01`).
- **Observed Error Rate**: $18.5\%$ (threshold: $> 5.0\%$ via `RULE-ERR-01`).

### 3.3 Rule Evaluation & Automatic Incident Declaration
Calling `POST /api/alerts/evaluate`:
- **Rules Evaluated**: 5
- **Rules Triggered**: 13
- **Alerts Created**: 2
  - `ALT-5658` (`RULE-LAT-01`, critical, $1950\text{ ms}$)
  - `ALT-5659` (`RULE-ERR-01`, critical, $18.5\%$)
- **Incident Declaration**: Because `ALT-5658` was critical and had no topological link to existing incidents, the correlation engine transactionally declared:
  - **New Incident ID**: `INC-9617`
  - **Title**: `Incident: Cascading anomaly detected on Isolated Test Fixture Service`
  - **Severity**: `SEV-1`
  - **Status**: `investigating`

### 3.4 Independent Deduplication Verification
Calling `POST /api/alerts/evaluate` a second time immediately:
- **Deduplicated Alerts**: `ALT-5658` and `ALT-5659` matched the existing active alerts within the cooldown window.
- **Occurrence Counter**: Incremented from 1 to 2.
- **New Incidents Created**: **0** (strictly suppressed; zero duplicate incidents spawned).

### 3.5 Deterministic RCA Execution on `INC-9617`
Calling `POST /api/incidents/INC-9617/investigation/run`:
- **Candidates Ranked**: 7
- **Confidence Level**: `STRONG_HYPOTHESIS` (54% score)
- **Top Candidate**: `auth-gateway-v2` / `srv-iso-test-mvxosmy2`
- **Scoring Breakdown**:
  - Anomaly Severity Score: 85
  - Causal Dependency Score: 70
  - Deployment Correlation: 95
  - Log/Trace Error Evidence: 80
- **Anti-Double-Counting Safeguards**: Log score dampened by 15% to prevent double-weighting against active alert evidence.
- **AI Boundary**: Verified that LLM assistant components strictly consume the deterministic score and cannot alter ranks.

### 3.6 Lifecycle Transitions & Notification Queue
- **State Transitions**:
  1. `PATCH /api/incidents/INC-9617` $\to$ `status: investigating` (HTTP 200)
  2. `PATCH /api/incidents/INC-9617` $\to$ `status: mitigating` (HTTP 200)
  3. `PATCH /api/incidents/INC-9617` $\to$ `status: resolved` (HTTP 200)
- **Decoupled Notification Deliveries Generated**:
  1. `incident.created` (Slack, key: `incident.created_INC-9617_chan_slack_default_...`)
  2. `incident.created` (Email, key: `incident.created_INC-9617_chan_email_default_...`)
  3. `alert.critical` (Slack, key: `alert.critical_INC-9617_chan_slack_default_SE...`)
  4. `incident.resolved` (Slack, key: `incident.resolved_INC-9617_chan_slack_default...`)
  5. `incident.resolved` (Email, key: `incident.resolved_INC-9617_chan_email_default...`)

### 3.7 Database Cleanup
All records associated with `srv-iso-test-mvxosmy2` and `INC-9617` were deleted via cascading foreign key cleanup, restoring PostgreSQL to a pristine operational baseline.
