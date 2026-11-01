# InfraPulse — Phase 29 Defect Register & Known Issues

**Platform**: InfraPulse v2.4.0  
**Phase**: Phase 29 — Production Validation & Reliability Testing  
**Date**: November 1, 2026  

---

## 1. Defect Register (Phase 29 Audit)

| Defect ID | Severity | Component | Summary & Impact | Root Cause | Resolution | Regression Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-29-01** | **High** | `backend/src/repositories/remediation.repository.js` | `createApproval` failed to populate `approved_plan_hash`, causing `executePlan` to throw `Approval does not match the immutable plan content and version` on pre-approved repository test fixtures. | Migration `019` added column `approved_plan_hash` to `infra_remediation_approvals`, but `remediationRepository.createApproval` did not insert `$15 (approved_plan_hash)`. | Updated `createApproval` in `remediation.repository.js` to accept `approvedPlanHash` and automatically populate `plan.plan_hash` when status is `APPROVED`. | `governedRemediationIntelligence.test.js` tests 11 & 12: **PASSED (17/17)** |

---

## 2. Documented Operational Boundaries & Limitations

### 1. Cloud Deployment State (AWS ap-south-1)
- **Status**: Live cloud deployment was **HALTED AT THE APPROVAL GATE** in Phase 28 due to the strict ₹0 out-of-pocket budget constraint.
- **Limitation**: Real production infrastructure has not been provisioned in AWS. Account `********3579` is already hosting existing resources (`reachify-postgres`, `reachify-ec2-free-tier`, 20GB EBS) which consume Free Tier allowances.
- **Mitigation**: Option C (Local / Staging Self-Hosted) is 100% operational with identical codebase, security hardening, and database schemas at verified ₹0 cost.

### 2. Multi-Test Database Concurrency
- **Observation**: Running multiple test files simultaneously against a single local PostgreSQL database without `--test-concurrency=1` can cause table state collisions (e.g., one test truncating `cloud_lifecycle_operations` while another is actively querying it).
- **Enforcement**: Test execution scripts and package commands mandate `--test-concurrency=1` to guarantee deterministic, isolated test execution.

### 3. Opt-In Live Infrastructure Acceptance Tests
- **Observation**: In `tests/cloud-lifecycle/liveIntegrationAcceptance.test.js`, tests for live AWS STS, live Docker socket, live Kubernetes API server, and live Prometheus query skip cleanly when opt-in flags (`LIVE_AWS_TEST`, `LIVE_DOCKER_TEST`, `LIVE_K8S_TEST`, `LIVE_PROMETHEUS_TEST`) are absent.
- **Guarantee**: InfraPulse never manufactures fake live integration results or claims live cloud connectivity without explicit credential opt-in.

### 4. Telemetry Stack Memory Requirements
- **Observation**: Running the full telemetry suite (`prometheus`, `grafana`, `loki`, `tempo`, `otel-collector`) concurrently with the backend, worker, and database requires 3.5 GB to 4.5 GB of RAM.
- **Guidance**: In resource-constrained environments (e.g., low-memory 2 GB instances), use the core profile (`deploy/production/compose.yml`) with `TELEMETRY_MODE=live` (forwarding to external collector) or `TELEMETRY_MODE=demo`.

### 5. AI Assistant Offline Fallback
- **Observation**: When an external LLM provider experiences an outage, high latency, or rate limiting, the AI assistant gracefully falls back to deterministic RCA findings.
- **Guarantee**: The core deterministic RCA scoring engine is 100% decoupled from LLMs and never hallucinates root-cause candidates or alters ranking scores.

