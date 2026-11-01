# InfraPulse Self-Monitoring Metrics Reference

## 1. Metric Catalog

All self-monitoring metrics are prefixed with `infrapulse_` and registered in an independent Prometheus registry.

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `infrapulse_http_requests_total` | Counter | `method`, `route`, `status_class` | Total completed HTTP requests across API routes |
| `infrapulse_http_request_duration_seconds` | Histogram | `method`, `route` | HTTP request duration in seconds (buckets 1ms to 30s) |
| `infrapulse_http_active_requests` | Gauge | none | Real-time gauge of in-flight active HTTP requests |
| `infrapulse_operations_total` | Counter | `operation`, `outcome` | Subsystem operations (`db.query`, `worker.batch`, etc.) |
| `infrapulse_operation_duration_seconds` | Histogram | `operation` | Subsystem operation duration in seconds |
| `infrapulse_rca_candidate_rank` | Histogram | none | Emitted rank distribution of RCA candidates (1, 2, 3...) |
| `infrapulse_rca_evidence_total` | Counter | `quality` | Evidence quality distribution (`HIGH`, `MEDIUM`, `LOW`) |
| `infrapulse_database_pool_connections` | Gauge | `state` | PostgreSQL pool connections (`active`, `idle`, `waiting`) |
| `infrapulse_notification_queue_items` | Gauge | `state` | Notification queue items (`pending`, `failed`, `sent`) |
| `infrapulse_worker_heartbeat_age_seconds` | Gauge | none | Time in seconds since last worker heartbeat pulse |
| `infrapulse_dependency_state` | Gauge | `dependency` | State of key dependencies (1: up, 0: degraded, -1: down) |
| `infrapulse_trace_export_errors_total` | Counter | none | Trace export or telemetry exporter errors |
| `infrapulse_process_measurement` | Gauge | `measurement` | Runtime measurements (`rssBytes`, `heapUsedBytes`, `cpuPercentOfOneCore`, `eventLoopP95Ms`, etc.) |

---

## 2. In-Memory Rolling Observation Window

`ObservationWindow` maintains a 300-second circular second-bucket buffer tracking:
- HTTP requests total, failures, error percent
- P50, P95, and P99 latency quantiles calculated dynamically from exponential bucket arrays
- Subsystem operations (`db.query`, `worker.batch`, `rca.investigation`)
- Automatic reset on process restart with zero external dependency

---

## 3. Scrape Endpoint Configuration

- **Path**: `GET /metrics` or `GET /api/self-monitoring/metrics`
- **Environment Variables**:
  - `SELF_MONITORING_METRICS_TOKEN`: 32+ character scrape token
  - `SELF_MONITORING_METRICS_TOKEN_FILE`: Path to token file
  - `SELF_MONITORING_INTERVAL_MS`: Scrape interval recommendation (default 15000ms)
  - `SELF_MONITORING_OPERATOR_IDS`: Comma-separated list of operator IDs authorized to scrape

