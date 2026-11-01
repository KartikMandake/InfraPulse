# InfraPulse Grafana Production Dashboards

## 1. Overview & Provisioning

InfraPulse provides seven pre-configured Grafana dashboard JSON definitions located in `deploy/grafana/dashboards/` and auto-provisioned via `deploy/grafana/provisioning/dashboards/dashboards.yaml`.

All panels query internal platform metrics exported via `/metrics` (`infrapulse_*`).

---

## 2. Dashboard Catalog

### 1. InfraPulse — Platform Overview (`infrapulse-platform-overview.json`)
- **UID**: `infrapulse-platform-overview`
- **Key Panels**:
  - Active In-Flight Requests (`infrapulse_http_active_requests`)
  - API 5xx Error Rate % (`sum(rate(infrapulse_http_requests_total{status_class="5xx"}[5m])) / sum(rate(infrapulse_http_requests_total[5m])) * 100`)
  - API P95 Response Latency (`histogram_quantile(0.95, sum(rate(infrapulse_http_request_duration_seconds_bucket[5m])) by (le))`)
  - Worker Heartbeat Age (`infrapulse_worker_heartbeat_age_seconds`)
  - Trace Export Failures (`infrapulse_trace_export_errors_total`)
  - HTTP Request Throughput by Status Class (Timeseries)
  - API Request Latency Quantiles (P50, P95, P99)
  - Database Connection Pool Distribution (active, idle, waiting)
  - V8 Memory & RSS Consumption (`rssBytes`, `heapUsedBytes`, `heapLimitBytes`)

### 2. InfraPulse — API Performance (`infrapulse-api-performance.json`)
- **UID**: `infrapulse-api-performance`
- **Key Panels**:
  - Requests per Second by API Route (`sum(rate(infrapulse_http_requests_total[1m])) by (route)`)
  - HTTP Status Code Distribution (`2xx`, `3xx`, `4xx`, `5xx`)
  - P95 Latency by Endpoint Route
  - In-Flight Concurrency (Active HTTP Requests)

### 3. InfraPulse — PostgreSQL Health (`infrapulse-postgresql-health.json`)
- **UID**: `infrapulse-postgresql-health`
- **Key Panels**:
  - Connection Pool Saturation (`active`, `idle`, `waiting`)
  - Database Query & Transaction Rates (`db.query`, `db.transaction`)
  - Database Operation Latency (P95)

### 4. InfraPulse — Background Worker Health (`infrapulse-worker-health.json`)
- **UID**: `infrapulse-worker-health`
- **Key Panels**:
  - Notification Worker Heartbeat Age
  - Pending Notification Deliveries Queue Depth
  - Worker Batch Processing Rate
  - Worker Batch Execution Duration (P95)

### 5. InfraPulse — RCA Engine Performance (`infrapulse-rca-performance.json`)
- **UID**: `infrapulse-rca-performance`
- **Key Panels**:
  - RCA Investigations Execution Rate (`rca.investigation`)
  - RCA Engine Latency (P95)
  - RCA Evidence Quality Distribution (`HIGH`, `MEDIUM`, `LOW`)
  - Candidate Ranking Bucket Distribution (1, 2, 3, 5, 10...)

### 6. InfraPulse — Telemetry Pipeline (`infrapulse-telemetry-pipeline.json`)
- **UID**: `infrapulse-telemetry-pipeline`
- **Key Panels**:
  - Telemetry Ingestion Rate (`telemetry.ingest`)
  - Telemetry Processing Latency (P95)
  - Self-Monitoring OpenTelemetry Export Failures

### 7. InfraPulse — Resource Utilization (`infrapulse-resource-utilization.json`)
- **UID**: `infrapulse-resource-utilization`
- **Key Panels**:
  - CPU Core Utilization (`cpuPercentOfOneCore`)
  - Node.js Event Loop Delay (`eventLoopP95Ms`)
  - Memory Consumption Breakdown (`rssBytes`, `heapUsedBytes`)
  - V8 Heap Saturation % (`heapUtilizationPercent`)

