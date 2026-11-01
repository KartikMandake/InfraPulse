# InfraPulse Integration Connection Guide

**Target Environment**: Production / Operational Deployment  
**Audience**: DevOps, SRE, Platform Engineers  

---

## 1. Connecting OpenTelemetry (OTLP) Exporters

InfraPulse features a high-performance OTLP HTTP ingestion endpoint.

### Configuration
1. Register integration in InfraPulse with an ingestion key:
   ```json
   {
     "name": "Production OTLP Telemetry Collector",
     "provider": "opentelemetry",
     "config": { "enableTraces": true, "enableLogs": true, "enableMetrics": true },
     "credentials": { "ingestionKey": "<YOUR_SECRET_KEY>" }
   }
   ```
2. Configure your application OpenTelemetry SDK / Collector `config.yaml`:
   ```yaml
   exporters:
     otlphttp:
       endpoint: "http://localhost:5001/api/integrations/otlp"
       headers:
         X-OTLP-KEY: "<YOUR_SECRET_KEY>"
   ```
3. Verified endpoints:
   - Traces: `POST /api/integrations/otlp/v1/traces`
   - Logs: `POST /api/integrations/otlp/v1/logs`
   - Metrics: `POST /api/integrations/otlp/v1/metrics`

---

## 2. Connecting GitHub Repository Webhooks

InfraPulse correlates live code deployments and PR merges with anomaly spikes.

1. Navigate to: `GitHub Repo -> Settings -> Webhooks -> Add webhook`.
2. **Payload URL**: `https://<YOUR_DOMAIN>/api/integrations/webhooks/github` (or via local tunnel).
3. **Content type**: `application/json`
4. **Secret**: Enter the exact secret registered in InfraPulse.
5. **Events**: Select `Pushes`, `Pull requests`, `Releases`, `Workflow runs`.
6. Verified with constant-time HMAC SHA-256 validation.

---

## 3. Connecting Prometheus / VictoriaMetrics

To scrape InfraPulse self-monitoring metrics into external Prometheus:
```yaml
scrape_configs:
  - job_name: 'infrapulse'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:5001']
    metrics_path: '/metrics'
```
Exposes 147 native metrics including:
- `infrapulse_http_requests_total`
- `infrapulse_http_request_duration_seconds`
- `infrapulse_database_connections_active`
- `infrapulse_worker_queue_depth`
