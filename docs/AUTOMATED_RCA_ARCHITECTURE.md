# InfraPulse — Automated Deterministic RCA Architecture

## 1. Architectural Philosophy & Authoritative Engine

The InfraPulse Root Cause Analysis (RCA) system is designed around a fundamental reliability principle:

> **Deterministic Causality is Authoritative.**
> Mathematical graph traversal, statistical anomaly scoring, and physical dependency reasoning determine root causes and rank candidates. Artificial Intelligence (LLM) agents are strictly explainability layers — they provide natural language summaries and runbook guidance, but are cryptographically and architecturally prevented from modifying scores, confidence ranks, or candidate ordering.

The core implementation resides in `backend/src/engine/`:
- `rcaEngine.js`: Master orchestration and candidate evaluation.
- `causalGraph.js`: Directional dependency graph traversal (distinguishing causes from symptoms).
- `scoring.js`: Weighted multi-dimensional heuristic evaluation.
- `evidenceQuality.js`: Confidence level assignment and positive/missing/contradictory evidence classification.

---

## 2. Multi-Dimensional Scoring Formula

For every candidate service $s$ in the system topology, the RCA engine computes an objective candidate score $S(s) \in [0, 100]$:

$$S(s) = w_a \cdot A(s) + w_d \cdot D(s) + w_c \cdot C(s) + w_l \cdot L(s)$$

Where the default production weights are:
- $w_a = 0.30$ (Anomaly Severity Score)
- $w_d = 0.25$ (Causal Dependency Relevance Score)
- $w_c = 0.25$ (Deployment Temporal Correlation Score)
- $w_l = 0.20$ (Log and Trace Error Evidence Score)

$$\sum w_i = 0.30 + 0.25 + 0.25 + 0.20 = 1.00$$

### 2.1 Anomaly Severity Score $A(s)$
- Evaluates active alert severity (`critical` = 80, `warning` = 45).
- Multiplies by baseline deviation ratio ($x_{\text{observed}} / \mu_{\text{baseline}}$).
- Rewards multi-signal anomalies (both latency and error spikes present).

### 2.2 Causal Dependency Relevance Score $D(s)$
- Traverses the dependency graph between candidate $s$ and the incident target service $t$.
- **Callee as Cause**: If target $t$ calls candidate $s$ ($t \to s$) and $s$ is failing, $s$ is a high-probability root cause ($\text{Score} = 85 - 100$).
- **Caller as Symptom**: If candidate $s$ calls target $t$ ($s \to t$) and only reports errors because $t$ failed, $s$ is penalized as a downstream symptom ($\text{Score} \le 30$).
- **Transitive Depth Penalty**: For every additional hop in the dependency path, confidence decays by $20\%$ to prevent distant false positives.

### 2.3 Deployment Temporal Correlation Score $C(s)$
- Correlates code releases, database migrations, and infrastructure mutations within the incident time window:
  - Deployed $0 - 15$ minutes before incident: $\text{Score} = 95$.
  - Deployed $15 - 45$ minutes before incident: $\text{Score} = 75$.
  - Deployed $> 60$ minutes before incident: $\text{Score} \le 20$.
  - Rollback / failure markers during deployment surge score to $100$.

### 2.4 Log & Trace Error Evidence Score $L(s)$
- Evaluates log volume surge of `5xx`, `ConnectionTimeout`, `DeadlockDetected`, and `OutOfMemoryError`.
- Scans trace spans for unhandled exceptions on the critical path.

---

## 3. Anti-Double-Counting Safeguards

A critical defect in naive correlation engines is **signal double-counting**: if a service has high error logs and an active 5xx alert, counting both at full weight artificially inflates confidence.

The InfraPulse engine applies non-linear dampening:
```javascript
// Anti-double-counting adjustment:
// If an active alert is already firing for this error domain,
// reduce trace score redundancy to prevent double-weighting.
let adjustedLogScore = logRes.score;
if (anomalyRes.score > 50 && logRes.score > 50) {
  adjustedLogScore = Math.round(logRes.score * 0.85);
}
```
Furthermore, infrastructure container restarts (OOMKilled) directly cap application anomaly weights to avoid treating the crash loop as separate from the memory leak.

---

## 4. Evidence-Quality Confidence Levels

The engine evaluates evidence completeness and assigns a standardized categorical confidence level to the primary candidate:

| Confidence Level | Minimum Score | Required Evidence Criteria | Operational Meaning |
| :--- | :--- | :--- | :--- |
| **`DEFINITIVE_ROOT_CAUSE`** | $\ge 85\%$ | Callee dependency confirmed + active anomaly + matching error logs + correlated deployment or crash | Irrefutable root cause. Automated runbook remediation can be safely executed. |
| **`HIGH_CONFIDENCE_ROOT_CAUSE`** | $\ge 70\%$ | Direct dependency or direct service anomaly + at least 2 independent signal matches | Highly probable root cause. Primary focus for on-call triage. |
| **`STRONG_HYPOTHESIS`** | $\ge 50\%$ | Anomaly observed with temporal or topological linkage; minor corroborating evidence | Plausible root cause requiring engineer verification before invasive remediation. |
| **`INCONCLUSIVE_DATA`** | $< 50\%$ | Weak signals, distant topology, or insufficient telemetry data | Insufficient telemetry. Escalated to manual SRE investigation. |

---

## 5. Explainable Candidate Output Structure

Each candidate produced by `runRcaAnalysis()` includes full evidence transparency:

```json
{
  "serviceId": "srv-payments",
  "serviceName": "Payment Gateway Service",
  "score": 88,
  "confidenceLevel": "DEFINITIVE_ROOT_CAUSE",
  "summary": "Recent deployment v1.8.3 (14:22 UTC) exhibits strong temporal correlation. Severe P99 latency surge (15.4x baseline) detected on callee srv-payments. Correlated error logs indicate PostgreSQL connection pool exhaustion.",
  "scoreBreakdown": {
    "anomalySeverityScore": 85,
    "dependencyRelevanceScore": 90,
    "deploymentCorrelationScore": 95,
    "logErrorEvidenceScore": 80
  },
  "positiveEvidence": [
    "P99 latency surged from 120ms to 1850ms (> 800ms threshold)",
    "Target service order-service depends on srv-payments (order-service -> srv-payments)",
    "Deployment v1.8.3 completed 13 minutes prior to incident inception"
  ],
  "missingEvidence": [],
  "contradictoryEvidence": [],
  "suggestedNextAction": "Execute connection pool expansion runbook (RB-402) or rollback deployment v1.8.3 (RB-101)."
}
```

This structured evidence enables on-call engineers to immediately trust and verify the engine's deterministic reasoning.
