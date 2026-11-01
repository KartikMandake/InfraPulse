# InfraPulse Platform Self-Monitoring & Observability Architecture

## 1. Executive Summary

Phase 26 establishes enterprise-grade self-observability and internal telemetry for the InfraPulse platform. While InfraPulse observes and correlates telemetry across customer microservices and hybrid cloud environments, it must also observe **itself** with zero recursive alerting loops, predictable bounded overhead, and strict credential isolation.

The self-monitoring subsystem provides continuous instrumentation across all 10 core InfraPulse components:
1. **Frontend Console (React/Vite)**
2. **Backend API Services (Node.js/Express)**
3. **PostgreSQL Relational Storage (pg Pool)**
4. **Standalone Background Worker (Polling loop)**
5. **Notification Engine (Slack & Email Dispatcher)**
6. **Deterministic RCA Engine**
7. **AI Investigation Assistant**
8. **Cloud Lifecycle & Discovery Providers**
9. **Autonomous SRE Scheduler**
10. **Telemetry Pipeline & Dead-Letter Queue**

---

## 2. Telemetry Separation & Cardinality Safeguards

### 2.1 Complete Telemetry Plane Separation
Internal self-monitoring telemetry and customer telemetry pipelines are completely decoupled:
- Internal metrics are registered exclusively in an isolated `@prometheus-io/client` registry prefixed with `infrapulse_`.
- Internal trace spans are registered under OpenTelemetry tracer `infrapulse-self`.
- Internal alerts evaluate only platform operational health and never generate customer incidents.
- Self-monitoring scrape endpoints (`/metrics` and `/api/self-monitoring/metrics`) are isolated from user sessions.

### 2.2 Bounded Cardinality Guarantees
To prevent memory exhaustion and TSDB degradation:
- **Routes**: Mapped strictly to normalized route templates via `routeLabel(path)` (e.g. `/api/incidents/*`, `/api/services/*`, or `unmatched`). Never emits raw paths containing UUIDs or numeric IDs.
- **Methods**: Allowlisted to standard HTTP verbs (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`); any unknown verb maps to `OTHER`.
- **Status Classes**: Aggregated to status classes (`2xx`, `3xx`, `4xx`, `5xx`, `other`).
- **Subsystem Operations**: Allowlisted to 12 fixed operation identifiers (`db.query`, `db.transaction`, `rca.investigation`, `worker.batch`, etc.).

---

## 3. Distributed Tracing & W3C Context Propagation

### 3.1 Trace Context Standards
- Adheres to **W3C Trace Context Level 1** (`traceparent` header: `00-<32-hex-trace-id>-<16-hex-parent-id>-<flags>`).
- Invalid, all-zero, or spoofed traceparents are cleanly rejected and replaced with fresh traces.
- Incoming trace IDs and span IDs are passed through Express request flow and propagated to downstream calls and structured log contexts.

### 3.2 Trace Exporter & Graceful Degradation
- Configurable via `SELF_MONITORING_OTLP_ENDPOINT` (default: `http://127.0.0.1:4318/v1/traces`).
- Restricted to approved local collector URLs (`127.0.0.1`, `localhost`, `otel-collector`).
- All tracing failures trigger `traceErrors.inc()` counter and **never throw or block core API request processing**.

---

## 4. Structured Logging & Context Redaction

- Structured JSON logs emitted to stdout (and stderr for ERROR level).
- Automatically incorporates `correlationId`, `traceId`, and `spanId` from `AsyncLocalStorage` (`logContext`).
- Multi-layer recursive redaction strips 18 sensitive key patterns including tokens, passwords, bearer credentials, API keys, database URLs, and Slack webhook URLs.
- Maximum traversal depth bounded at 5 levels to prevent circular reference stack overflows.

---

## 5. Metrics Engine & Exposition

- **Exposition Format**: Standard OpenMetrics / Prometheus text exposition format (`Content-Type: text/plain; version=0.0.4; charset=utf-8`).
- **Scrape Endpoints**:
  - `GET /metrics` (Standard root scraper path)
  - `GET /api/self-monitoring/metrics` (API path)
- **Scrape Authentication**:
  - Protected by `SELF_MONITORING_METRICS_TOKEN` via Bearer header or platform operator RBAC.
  - Constant-time string comparison (`crypto.timingSafeEqual`) prevents timing oracle attacks.
  - When unconfigured, permits local loopback scraping.

