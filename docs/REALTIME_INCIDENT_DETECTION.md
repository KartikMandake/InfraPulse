# InfraPulse — Real-Time Incident Detection Engine

## 1. Overview & Architecture

The InfraPulse Real-Time Incident Detection Engine transforms continuous infrastructure and application telemetry into actionable, prioritized operational signals. Instead of treating telemetry streams as passive monitoring artifacts, the detection engine evaluates metric streams, distributed traces, structured logs, and infrastructure events in near real time to recognize anomalies at their inception.

```
 +-----------------------------------------------------------------------------------+
 |                             TELEMETRY INGESTION LAYER                             |
 |                                                                                   |
 |  [Prometheus Metrics]   [OTLP Distributed Traces]   [Loki Structured Logs]        |
 |       (P99, RPS, Error%)     (Spans, Trace IDs)      (5xx, Connection Pool)       |
 +----------------------------------------+------------------------------------------+
                                          |
                                          v
 +-----------------------------------------------------------------------------------+
 |                       EVALUATION & ANOMALY DETECTION ENGINE                       |
 |                                                                                   |
 |  - Continuous Rule Evaluator (`evaluateAndCorrelateAlerts`)                       |
 |  - Statistical Baseline Deviation & Outlier Analysis                              |
 |  - Flapping Suppression & Cooldown Sliding Windows                                |
 +----------------------------------------+------------------------------------------+
                                          |
                     +--------------------+--------------------+
                     |                                         |
                     v                                         v
   [Existing Active Alert / Cooldown]          [New Threshold Breach / Anomaly]
                     |                                         |
         (Increment Occurrence Counter)                        v
         (Suppress Alert Duplication)                 [Generate Active Alert]
                                                               |
                                                               v
                                              [Topological Graph Correlation]
                                                               |
                     +-----------------------------------------+---------------------+
                     |                                                               |
                     v                                                               v
   [Correlated with Open Incident]                                  [Uncorrelated Critical Anomaly]
                     |                                                               |
   - Link Alert to Incident (`incidentId`)                          - Transactional Incident Declaration (`INC-xxxx`)
   - Append Milestone Event to Timeline                             - Classify Explainable Severity (`SEV-1`)
   - Update Impacted Blast Radius                                   - Trigger Authoritative Deterministic RCA
                                                                    - Dispatch Multi-Channel Notifications
```

---

## 2. Telemetry Ingestion Mechanisms

### 2.1 Supported Telemetry Signals
1. **Application & Runtime Metrics**:
   - HTTP response latency percentiles ($P_{50}$, $P_{90}$, $P_{99}$).
   - Status code rates ($2xx$, $4xx$, $5xx$ error ratios).
   - Throughput (Requests Per Second - RPS).
   - Host resource saturation (CPU utilization, RSS memory, thread pool exhaustion).
2. **Distributed Tracing (OTLP/Tempo)**:
   - Trace IDs, Span IDs, and parent-child causal relationships.
   - Unhandled span exceptions, span tags, and critical path latency breakdowns.
3. **Structured Log Telemetry (Loki)**:
   - High-severity log streams (`ERROR`, `FATAL`, `PANIC`).
   - Exception stack traces, database query timeouts, and circuit breaker trips.
4. **Cloud Infrastructure Lifecycle Events**:
   - Container crashes, OOMKilled events, pod restarts, and cloud provider health status.

### 2.2 Streaming vs. Batch Ingestion Architecture
- **Real-Time Stream Processing**:
  - Telemetry webhooks, OTLP collectors, and Prometheus push/pull targets feed metrics directly into the ingestion gateway.
  - Streaming updates update service telemetry snapshots in memory and in PostgreSQL (`services` table).
- **Scheduled Micro-Batch Evaluation**:
  - The evaluation loop executes on configurable intervals (default: 60 seconds) or immediately upon receiving high-severity telemetry spikes.
  - Telemetry points are evaluated within sliding time windows ($W = 60\text{ min}$) to identify both acute spikes and sustained degradations.

---

## 3. Ingestion Latency & Sampling Policies

| Signal Type | Ingestion Frequency | Sampling Strategy | Ingestion Latency ($P_{95}$) | Retention Target |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP Metrics ($P_{99}$, RPS, Err)** | 10 seconds | 100% aggregation | $< 250\text{ ms}$ | 30 days |
| **Host Saturation (CPU, Mem)** | 15 seconds | Continuous gauge | $< 300\text{ ms}$ | 14 days |
| **Distributed Traces** | Real-time streaming | Adaptive head-based (10% normal, 100% on error/slow) | $< 500\text{ ms}$ | 7 days |
| **Error Logs** | Real-time streaming | 100% of WARN/ERROR, rate-limited at 1000/sec/service | $< 400\text{ ms}$ | 14 days |
| **Database Pool Stats** | 10 seconds | Direct probe gauge | $< 150\text{ ms}$ | 30 days |

---

## 4. Multi-Tenant Boundary Isolation & Rate Limiting

1. **Logical Tenant Isolation**:
   - Every telemetry record, alert rule, alert event, and incident is tagged with a mandatory `tenant_id`.
   - Database operations enforce PostgreSQL Row-Level Security (RLS) policies and strict session contexts via `tenantContext()`. Cross-tenant telemetry bleed is physically impossible at the repository layer.
2. **Ingestion Rate Limiting**:
   - Ingestion endpoints enforce per-tenant token bucket rate limits (e.g., maximum 500 requests/minute per tenant for telemetry writes).
   - Exceeding quotas triggers HTTP 429 Too Many Requests with explicit retry headers, preventing noisy-neighbor starvation.
3. **Safe Fallback Boundaries**:
   - If downstream telemetry datasources (such as external Prometheus or OpenTelemetry collectors) experience transient downtime, the ingestion gateway fails closed for that datasource without corrupting tenant state or generating spurious synthetic outages.

---

## 5. Security & Ingestion Safeguards

- **OTLP Authentication**: Ingestion keys are authenticated using cryptographically secure tokens (`otlp_••••••••`) encrypted via AES-256-GCM at rest.
- **Private Endpoint Isolation**: Internal collector endpoints can be configured with strict loopback/private subnet constraints (`ALLOW_PRIVATE_INTEGRATION_ENDPOINTS=true`).
- **Audit Logging**: Any runtime modification to telemetry rules, thresholds, or service baselines produces immutable records in `audit_logs` referencing the authenticated actor ID and IP address.
