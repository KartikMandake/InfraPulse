# InfraPulse — Incident Severity & Classification Policy

## 1. Purpose & Principles

This policy defines the objective, quantitative classification criteria for operational incidents in InfraPulse. Severity levels dictate response urgency, escalation channels, on-call paging policies, communication cadences, and post-incident review requirements.

Severity is determined by **business and user impact**, not technical complexity or underlying effort.

---

## 2. Severity Classification Matrix

| Severity Level | Designation | Customer & Business Impact | Technical Criteria & SLO Burn Rate | MTTA Target | MTTR Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`SEV-1`** | **Critical Emergency** | Critical business outage; payment processing down; wide-scale customer outage ($> 10\%$ of user base impacted) | 1-hr SLO error budget burn rate $\ge 14.4$; core Tier-1 service total failure or data corruption risk | $\le 5\text{ mins}$ | $\le 45\text{ mins}$ |
| **`SEV-2`** | **Major Incident** | High business impact; primary feature degraded; workaround available but difficult; partial customer disruption ($2\% - 10\%$ impacted) | 6-hr SLO burn rate $\ge 6.0$; Tier-1 service partial degradation or Tier-2 service outage | $\le 15\text{ mins}$ | $\le 2\text{ hours}$ |
| **`SEV-3`** | **Moderate Incident** | Low customer impact; non-critical feature impaired; internal tool disruption; minor latency increase without systemic errors | 24-hr SLO burn rate $\ge 1.0$; Tier-3 service impairment or non-blocking defect | $\le 30\text{ mins}$ | $\le 8\text{ hours}$ |
| **`SEV-4`** | **Low / Minor** | Negligible impact; cosmetic defect, minor internal batch processing delay; zero impact on end-user requests | No SLO burn; isolated non-critical warning | $\le 2\text{ hours}$ | $\le 24\text{ hours}$ |

---

## 3. Service Tier Definitions

1. **Tier-1 (Mission Critical)**:
   - Direct impact on revenue, auth, or core workflows (e.g., `auth-gateway-v2`, `srv-payments`, `order-service`, primary database cluster).
   - Any sustained degradation automatically classifies as $\ge \text{SEV-2}$, escalating to $\text{SEV-1}$ if $P_{99} > 1500\text{ ms}$ or error rate $> 5\%$.
2. **Tier-2 (Business Critical)**:
   - Services supporting Tier-1 functions with asynchronous decoupling or fallback caches (e.g., `notification-service`, `search-indexer`, `recommendation-engine`).
   - Failure degrades user experience but does not block transaction completion.
3. **Tier-3 (Internal & Supporting)**:
   - Internal analytics, backoffice dashboards, batch reporting workers, and staging environments.

---

## 4. Escalation & De-escalation Protocol

### 4.1 Automated Escalation Triggers
An incident is automatically escalated by the system when:
1. **Unacknowledged MTTA Breach**:
   - `SEV-1` unacknowledged after 5 minutes escalates notification fan-out to the Secondary On-Call and Engineering Director.
2. **SLO Burn Rate Acceleration**:
   - If an ongoing `SEV-2` incident experiences accelerating error rates breaching 1-hr burn rate thresholds ($\ge 14.4$), it is immediately escalated to `SEV-1`.
3. **Cascade Blast Radius Expansion**:
   - If a failure cascades across two or more downstream Tier-1 services, severity escalates to `SEV-1`.

### 4.2 De-escalation & Downgrade Criteria
- Severity may only be downgraded by the designated **Incident Commander (IC)**.
- Mandatory condition: Core user impact has been verified as mitigated, confirmed by $\ge 15$ minutes of normalized telemetry metrics below warning thresholds.

---

## 5. Communication & Notification Cadence

| Severity | Paging Channels | Status Page Update | Stakeholder Cadence | Postmortem Trigger |
| :--- | :--- | :--- | :--- | :--- |
| **`SEV-1`** | PagerDuty (Phone/SMS) + `#inc-war-room` Slack + Exec Email | Immediate ($< 10\text{ mins}$) | Every 15 minutes | Mandatory within 48 hours |
| **`SEV-2`** | PagerDuty (Push) + Slack `#inc-active` + Email | Within 30 minutes | Every 30 minutes | Mandatory within 72 hours |
| **`SEV-3`** | Slack `#alerts-ops` | Optional / Not required | Every 2 hours | Discretionary by Tech Lead |
| **`SEV-4`** | Asynchronous Ticket / Slack Digest | Not required | Daily digest | Not required |
