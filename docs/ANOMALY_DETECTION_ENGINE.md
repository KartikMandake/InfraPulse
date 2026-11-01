# InfraPulse — Anomaly Detection Engine

## 1. Engine Architecture & Mathematical Principles

The InfraPulse Anomaly Detection Engine operates within `backend/src/engine/anomalyDetector.js` and `backend/src/services/alertRules.service.js`. It decouples static alerts from intelligent anomaly detection by combining dynamic thresholds, statistical baseline deviations, and multi-window rate-of-change analytics.

```
 +---------------------------------------------------------------------------------+
 |                           OBSERVED TELEMETRY INPUT                              |
 |   Metric (latencyP99, errorRate, rps, cpuPercent), Baseline History, Thresholds |
 +----------------------------------------+----------------------------------------+
                                          |
                                          v
 +---------------------------------------------------------------------------------+
 |                         STATISTICAL OUTLIER EVALUATOR                           |
 |                                                                                 |
 |  1. Dynamic Ratio:  Deviation Factor = (Observed - Baseline) / Baseline          |
 |  2. Z-Score Model:  z = (x - mu) / sigma                                        |
 |  3. Multi-Window Hysteresis: Low-water and High-water triggers                  |
 +----------------------------------------+----------------------------------------+
                                          |
                                          v
 +---------------------------------------------------------------------------------+
 |                        ANTI-FLAPPING & NOISE SUPPRESSION                        |
 |                                                                                 |
 |  - Minimum Sample Window (Mins = 3 evaluation cycles)                           |
 |  - Minimum Volume Gate (RPS >= 5 req/s before error percentage fires)           |
 |  - Cooldown Deduplication Window (60 minutes)                                   |
 +----------------------------------------+----------------------------------------+
                                          |
                                          v
 +---------------------------------------------------------------------------------+
 |                         WEIGHTED ANOMALY SEVERITY SCORE                         |
 |                       Score in [0, 100], Confidence Level                       |
 +---------------------------------------------------------------------------------+
```

---

## 2. Statistical Baseline & Deviation Formulations

### 2.1 Baseline Ratio & Outlier Multiplier
For metrics with non-zero historical baseline $\mu_b$ (e.g. baseline $P_{99}$ latency of 120ms):
$$\Delta = \frac{x_{\text{observed}} - \mu_b}{\mu_b}$$

- When $\Delta \ge 3.0$ ($3\times$ baseline), an anomaly score of at least 50 is generated.
- When $\Delta \ge 10.0$ ($10\times$ baseline), the severity surges to critical ($\text{Score} \ge 85$).

### 2.2 Standard Deviation (Z-Score) Normalization
For continuous metrics exhibiting normal distribution:
$$z = \frac{x - \mu}{\sigma}$$
- $|z| < 2.0$: Normal operating jitter; anomaly suppressed.
- $2.0 \le |z| < 3.0$: Moderate anomaly (Warning severity).
- $|z| \ge 3.0$: High statistical anomaly ($> 99.7\%$ deviation; Critical severity).

### 2.3 Composite Multi-Window SLO Burn Rate
To detect rapid error-budget consumption before an outage becomes prolonged, the engine evaluates multi-window burn rates:
$$\text{Burn Rate} = \frac{\text{Observed Error Rate}}{\text{Allowed Error Budget Rate}}$$
- **1-Hour Burn Rate $\ge 14.4$**: Consumes $2\%$ of monthly budget in 1 hour; triggers an immediate `SEV-1` alert.
- **6-Hour Burn Rate $\ge 6.0$**: Consumes $5\%$ of monthly budget in 6 hours; triggers a `SEV-2` warning.

---

## 3. False-Positive Guardrails & Noise Suppression

1. **Minimum Sample Size / Volume Gate**:
   - Error percentage calculations are gated by throughput. If a service handles only 2 requests in a minute and 1 fails, the mathematical error rate is 50%, but the raw sample size is too low to declare a system outage.
   - Guardrail: Minimum threshold of $\ge 5\text{ RPS}$ or $\ge 50$ total requests within the evaluation window before triggering high-severity error rate alerts.
2. **Evaluation Window Persistence**:
   - Transient spikes lasting $< 15$ seconds do not trigger full incident declaration unless confirmed across consecutive evaluations.
3. **Flapping Prevention (Hysteresis)**:
   - Alert creation requires crossing the **High-Water Mark** (e.g., $P_{99} > 800\text{ ms}$).
   - Alert clearing requires dropping below the **Low-Water Mark** (e.g., $P_{99} < 400\text{ ms}$) for at least 2 consecutive cycles.
   - Prevents rapid oscillation between active and resolved states when a metric hovers around a boundary.
4. **Deduplication Cooldown**:
   - When an active alert exists for a service and metric rule, subsequent evaluations increment `occurrenceCount` and refresh `firedAt` timestamps rather than inserting duplicate alert rows or spawning redundant incidents.

---

## 4. Production Rule Catalog

InfraPulse ships with pre-configured, production-validated rules stored in the `alert_rules` repository:

| Rule ID | Name | Metric | Operator | Threshold | Severity | Target Service |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`RULE-LAT-01`** | High P99 Latency Surge | `latencyP99` | `>` | $800\text{ ms}$ | `critical` | `*` (All Services) |
| **`RULE-ERR-01`** | Elevated 5xx Error Rate | `errorRate` | `>` | $5.0\%$ | `critical` | `*` (All Services) |
| **`RULE-HLTH-01`** | Service Health Degradation | `status` | `!=` | `healthy` | `critical` | `*` (All Services) |
| **`RULE-TRF-01`** | Sudden Traffic Cliff | `rps` | `<` | $10\text{ req/s}$ | `warning` | `api-gateway` |
| **`RULE-DEP-01`** | Downstream Dependency Timeout | `latencyP99` | `>` | $1500\text{ ms}$ | `critical` | `srv-payments`, `db-main` |

---

## 5. Telemetry Evidence Formatting

Every alert created by the anomaly engine persists structured evidence references in `evidenceRefs` (JSONB) to ensure transparency:

```json
{
  "type": "metric_threshold",
  "metric": "latencyP99",
  "observed": 1850,
  "threshold": 800,
  "description": "Observed value 1850ms breached threshold (> 800ms) with 15.4x deviation from baseline (120ms)"
}
```
This evidence is directly ingested by the downstream Deterministic RCA Engine to establish causal confidence.
