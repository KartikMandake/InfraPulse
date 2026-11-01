# InfraPulse — Incident Correlation Architecture

## 1. Overview & Problem Definition

In modern distributed microservice environments, a single root failure (e.g., PostgreSQL connection pool exhaustion) rapidly cascades into dozens of downstream symptom alerts: API Gateway timeout alerts, payment checkout failures, authentication token delays, and queue backup alerts.

Without intelligent correlation, engineering teams experience alert fatigue, opening separate tickets and investigating symptoms rather than the root cause.

The InfraPulse Incident Correlation Engine (`backend/src/services/alertCorrelation.service.js` and `backend/src/engine/correlation.js`) clusters related signals, determines causal directionality, and associates incoming alerts with a single authoritative incident.

```
 +-----------------------------------------------------------------------------------+
 |                              INCOMING ACTIVE ALERTS                               |
 |   [Alert 1: API Gateway Timeout]  [Alert 2: Order Service 504]  [Alert 3: DB Pool] |
 +----------------------------------------+------------------------------------------+
                                          |
                                          v
 +-----------------------------------------------------------------------------------+
 |                         MULTI-SIGNAL CORRELATION ENGINE                           |
 |                                                                                   |
 |  1. Topological Graph Traversal: Direct & Transitive Dependencies                 |
 |  2. Distributed Trace Linkage: Matching Trace IDs & Parent-Child Span Trees       |
 |  3. Shared Infrastructure Entity: Common Host / DB Instance / Cluster             |
 |  4. Temporal Window Alignment: Events occurring within delta t <= 15 minutes      |
 +----------------------------------------+------------------------------------------+
                                          |
                     +--------------------+--------------------+
                     |                                         |
                     v                                         v
       [Correlated to Failure Domain]            [Isolated Failure Domain]
                     |                                         |
   - Attach to Existing Open Incident            - Declare New Targeted Incident
   - Append Timeline Milestone                   - Run Deterministic Root Cause Analysis
   - Mark as Downstream Symptom                  - Dispatch Multi-Channel Notifications
```

---

## 2. Multi-Signal Correlation Dimensions

The engine correlates operational signals across four primary dimensions:

### 2.1 Topological Dependency Graph Traversal
Services maintain directed dependency graphs (`dependencies` field in `services` table). When evaluating whether Alert A (on Service A) relates to Open Incident I (on Service B), the engine inspects:
- **Same Service**: Service A is identical to Service B (`relationship: same_service`).
- **Direct Caller-to-Callee**: Service A directly depends on Service B (`Service A -> Service B`).
- **Direct Callee-to-Caller**: Service B directly depends on Service A (`Service B -> Service A`).
- **Two-Hop Transitive Dependency**: An intermediary service C bridges them (`Service A -> Service C -> Service B`).

### 2.2 Distributed Trace Linkage
When OpenTelemetry distributed tracing is active:
- Alerts capturing slow or failed traces extract root `traceId` and `parentSpanId`.
- If an open incident has linked traces sharing the same `traceId`, the alert is deterministically linked via `shared_distributed_trace`.

### 2.3 Shared Infrastructure Host & Resource Overlap
Microservices frequently run on shared cloud resources (e.g., shared RDS database cluster, Kubernetes node, or VPC NAT gateway):
- If Alert A occurs on a service bound to `resourceId: db-cluster-prod-01` and Incident I originated from a failure on `db-cluster-prod-01`, the signals are grouped via `shared_infrastructure_host`.

### 2.4 Deployment & Change Event Temporal Correlation
Code deployments and configuration changes are correlated against incident start times:
- Changes applied within $[-30\text{ minutes}, +5\text{ minutes}]$ of anomaly inception receive high temporal correlation weighting.

---

## 3. Incident Grouping & Deduplication Rules

1. **Single Incident Per Failure Domain**:
   - Multiple alerts firing across services within the same connected dependency component are clustered under a single Incident Commander and Slack channel (e.g., `#inc-1880-auto`).
2. **Blast Radius Clustering**:
   - Downstream callers exhibiting latency surges or $504$ Gateway Timeouts are classified as **Symptoms**, not independent root causes.
   - The incident record maintains an aggregated blast radius listing all impacted caller services.
3. **Timeline Event Synchronization**:
   - Rather than creating duplicate incidents, correlated alerts append a milestone event directly into the incident's chronological timeline (`incidents.timeline` JSONB array):
   ```json
   {
     "time": "14:25:10 UTC",
     "title": "Correlated Alert: Elevated 5xx Error Rate: order-service",
     "description": "Alert alt_9182 fired for order-service. Linked via caller_to_callee (order-service -> srv-payments).",
     "source": "telemetry_anomaly"
   }
   ```
4. **Standalone Incident Fallback**:
   - If a critical alert fires for a service that shares no topological edge, no shared resource, and no shared trace with any currently open incident, a new incident is declared transactionally (`INC-xxxx`) and isolated as a distinct failure domain.

---

## 4. Correlation Audit Rationale

For complete operational transparency, every evaluation execution emits an explainable correlation rationale array. For example:

```json
{
  "alertId": "alt-lat-payments-01",
  "incidentId": "INC-1880",
  "rationale": "Alert \"alt-lat-payments-01\" (srv-payments) correlated to open incident \"INC-1880\" via caller_to_callee (order-service -> srv-payments). Contributing signal: latencyP99 (1850ms).",
  "note": "Topological dependency indicates shared failure cascade; causation verified via RCA engine."
}
```
This ensures on-call engineers can immediately inspect *why* two services were grouped without guessing or inspecting raw logs.
