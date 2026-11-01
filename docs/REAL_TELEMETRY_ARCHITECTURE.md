# InfraPulse Real Telemetry & Integration Architecture

**Phase**: Phase 34: Live Integrations & Real Infrastructure Monitoring  
**Repository**: `https://github.com/KartikMandake/InfraPulse`  
**Branch**: `kartik`  
**Status**: `ENFORCED & OPERATIONAL`  

---

## 1. High-Level Architecture Overview

InfraPulse consumes infrastructure signals across real and external integration streams through secure, authenticated provider adapters. Data enters either through **active polling** (Prometheus, Docker, Kubernetes, AWS) or **push ingestion** (OpenTelemetry OTLP, GitHub webhooks, Grafana webhooks).

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                        REAL TELEMETRY SOURCES                          │
  ├──────────────────┬──────────────────┬─────────────────┬────────────────┤
  │    PROMETHEUS    │    OPENTELEMETRY │     GITHUB      │      AWS       │
  │ /metrics scrape  │ OTLP HTTP Spans  │ Push Webhook    │ ap-south-1     │
  │ 147 series live  │ Traces, Logs     │ Commits, Deliv. │ Read-Only Inv. │
  └────────┬─────────┴────────┬─────────┴────────┬────────┴────────┬───────┘
           │                  │                  │                 │
           ▼                  ▼                  ▼                 ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                 INFRAPULSE INTEGRATION ADAPTER LAYER                   │
  │  • SSRF Protection & Loopback Policy Guardrails                        │
  │  • AES-256-GCM Credential Encryption at Rest                           │
  │  • Constant-Time HMAC Signature Verification                           │
  │  • Honest Status Classification (CONNECTED, ERROR, NOT CONFIGURED)     │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                     CANONICAL EVENT NORMALIZER                         │
  │  • Standardized Entity Mapping (serviceId, traceId, spanId)            │
  │  • Temporal Alignment & Provenance Tracking (telemetryMode: 'live')    │
  │  • Zero Synthetic Data Confusion (isSimulated: false)                  │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                    DETERMINISTIC RCA ENGINE & GRAPH                    │
  │  • Topological Service Dependency Distance Calculation                 │
  │  • Multi-Factor Diagnostic Scoring (0-100)                             │
  │  • Explainable Evidence Provenance & Audit Trail                       │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Integration Classification Matrix

| Provider Key | Provider Name | Mode | Status | Live Verification Details |
| :--- | :--- | :---: | :---: | :--- |
| **`opentelemetry`** | OpenTelemetry (OTLP) | **LIVE** | **CONNECTED** | OTLP HTTP traces and logs ingested via `/api/integrations/otlp/v1/*` with verified token header `X-OTLP-KEY`. |
| **`github`** | GitHub Webhooks | **LIVE** | **CONNECTED** | Ingested live push webhooks for repository `KartikMandake/InfraPulse` with HMAC-SHA256 signature verification. |
| **`prometheus`** | Native Exporter | **LIVE** | **CONNECTED** | Live scraper exposing 147 real metrics on `http://127.0.0.1:5001/metrics`. |
| **`aws`** | AWS Read-Only Discovery | **LIVE** | **AVAILABLE** | Ambient IAM read-only discovery verified via AWS CLI (`arn:aws:iam::416121583579:root`). Discovered EC2 `i-09bd1ec5f0c4899ee` (stopped) in `ap-south-1`. |
| **`docker`** | Docker Engine & Compose | **LOCAL** | **BLOCKED** | Docker CLI installed, but background Windows named pipe engine inactive (`ENOENT //./pipe/docker_engine`). Correctly classified as `ERROR` without faking telemetry. |
| **`kubernetes`** | Kubernetes Cluster | **REMOTE** | **NOT CONFIGURED** | No cluster active in local kubecontext (`ENOTFOUND kubernetes.default.svc`). Correctly marked as `ERROR`. |
