# InfraPulse Platform Self-Monitoring Service Level Objectives (SLOs)

## 1. Objectives & SLI Definitions

InfraPulse manages its internal reliability using quantifiable Service Level Indicators (SLIs) and Service Level Objectives (SLOs) with real-time error-budget and burn-rate tracking.

---

## 2. Target SLO Catalog

### 2.1 Core API Availability SLO
- **Objective ID**: `slo_api_availability`
- **SLI Formulation**: `(Total HTTP Requests - HTTP 5xx Server Errors) / Total HTTP Requests * 100`
- **Target Attainment**: `99.9%` (Over rolling 5-minute window or 30-day production period)
- **Allowed Error Budget**: `0.1%` (1 in 1,000 requests)
- **Burn Rate**: Calculated dynamically as `Current Error Rate / Allowed Error Rate (0.1%)`. A burn rate of `1.0x` consumes 100% of budget over the period; `10.0x` triggers instant high-priority SRE alert.

### 2.2 Core API Latency SLO
- **Objective ID**: `slo_api_latency`
- **SLI Formulation**: Percentage of API requests completing within target duration: `P95 <= 500ms`.
- **Target Attainment**: `95.0%` of requests.
- **Classification**: `COMPLIANT` when `P95 <= 500ms`, `DEGRADED` when `P95 > 500ms`.

### 2.3 PostgreSQL Query Reliability SLO
- **Objective ID**: `slo_database_reliability`
- **SLI Formulation**: `(Total Database Queries - Failed Queries) / Total Database Queries * 100`
- **Target Attainment**: `99.9%`
- **Classification**: `COMPLIANT` when query error rate <= 0.1%.

### 2.4 Background Dispatch Reliability SLO
- **Objective ID**: `slo_worker_reliability`
- **SLI Formulation**: `(Total Dispatch Batches - Failed Batches) / Total Dispatch Batches * 100`
- **Target Attainment**: `99.5%`
- **Classification**: `COMPLIANT` when worker execution failure rate <= 0.5%.

---

## 3. Real-Time SLI Telemetry API

Access real-time SLO metrics via `GET /api/self-monitoring/slos`:
```json
{
  "success": true,
  "data": {
    "slos": [
      {
        "id": "slo_api_availability",
        "name": "Core API Availability",
        "targetPercent": 99.9,
        "currentAttainmentPercent": 100.0,
        "errorBudgetRemainingPercent": 100.0,
        "burnRate": 0.0,
        "status": "COMPLIANT",
        "window": "5-minute rolling window",
        "totalRequests": 1420,
        "failedRequests": 0
      }
    ]
  }
}
```

