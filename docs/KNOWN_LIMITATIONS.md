# InfraPulse v1.0.0 — Known Limitations & Operational Boundaries

**Platform**: InfraPulse v2.4.0 (Release Target v1.0.0)  
**Publication Date**: November 1, 2026  
**Audience**: Site Reliability Engineers, Platform Architects, and System Administrators  

---

## 1. Cloud Infrastructure & FinOps Boundaries

### 1.1 AWS Cloud Target (`ap-south-1`) Gated Behind User Budget Approval
- **Limitation**: Real AWS cloud infrastructure has **not been provisioned**. Provisioning was strictly halted at the Phase 28 approval gate to honor the user's out-of-pocket budget limit of ₹0.
- **Account State**: The designated AWS account (`********3579`) currently hosts an active RDS database (`reachify-postgres`), a 20 GB gp3 EBS volume, and an Elastic IP from another project (`reachify`). These existing workloads consume the account's Free Tier allowances.
- **Financial Rule**: AWS mandates a $0.005/hour ($3.65/month) charge for all public IPv4 addresses, and EBS storage exceeding 30 GB is billed at $0.0912/GB-month. Deploying InfraPulse to AWS will incur an estimated $31.06 – $41.06/month (~₹2,795 – ₹3,695 INR).
- **Mitigation**: Option C (Self-Hosted / Local Staging) provides 100% architectural and operational parity with zero cloud invoice risk. Option A is fully documented and ready for deployment upon explicit user budget authorization.

### 1.2 Single-Host Failure Domain (Option A Blueprint)
- **Limitation**: The initial cloud deployment architecture (Option A) deploys InfraPulse on a single Amazon EC2 instance in availability zone `ap-south-1a`.
- **Operational Reality**: While simple and cost-effective, a single host does not provide automatic multi-AZ failover. If the underlying EC2 host experiences hardware degradation, manual restart or restoration from EBS snapshots is required.
- **Future Roadmap**: High-Availability Multi-AZ deployment (Option B: ECS Fargate + Multi-AZ RDS + ALB) is documented for future enterprise expansion.

---

## 2. Resource Utilization & Observability Profiles

### 2.1 Colocated Telemetry Stack Memory Requirements
- **Limitation**: Running the complete observability stack colocated on a single host (Prometheus, Grafana, Loki, Tempo, OpenTelemetry Collector, Backend, Worker, PostgreSQL, and Frontend) requires **3.5 GB to 4.5 GB of RAM**. Attempting to run all telemetry containers on a 1 GB – 2 GB instance will trigger the Linux Out-Of-Memory (OOM) Killer.
- **Supported Profiles**:
  1. **Core Lightweight Profile (`deploy/production/compose.yml`)**:
     - Services: `frontend`, `backend`, `worker`, `postgres`.
     - Memory Footprint: **~650 MB peak RAM**.
     - Telemetry Mode: `TELEMETRY_MODE=live` (forwarding to external telemetry backends) or `TELEMETRY_MODE=demo`.
     - Compatible with 2 GB RAM instances (`t4g.small` / `t3.small`).
  2. **Full Telemetry Profile (`deploy/docker-compose.yml`)**:
     - Colocates all metrics, logs, and trace backends.
     - Requires 8 GB+ RAM host.

---

## 3. Testing & Development Isolation Boundaries

### 3.1 Stateful PostgreSQL Multi-Test Concurrency
- **Limitation**: Multiple Node.js test files executing concurrently against the same local PostgreSQL test database can cause table truncation collisions (e.g., one test resetting `cloud_lifecycle_operations` while another is actively evaluating an approval).
- **Mitigation**: Test scripts and package runners mandate `--test-concurrency=1` to guarantee deterministic, serial execution across suites.

### 3.2 Opt-In Live Infrastructure Acceptance Tests
- **Limitation**: Tests in `tests/cloud-lifecycle/liveIntegrationAcceptance.test.js` (such as live AWS STS queries, live Docker daemon pings, live Kubernetes API probes, and live PromQL queries) skip cleanly when opt-in environment variables (`LIVE_AWS_TEST`, `LIVE_DOCKER_TEST`, `LIVE_K8S_TEST`, `LIVE_PROMETHEUS_TEST`) are absent.
- **Guarantee**: InfraPulse never manufactures synthetic "passes" for real cloud infrastructure without verified credentials and explicit opt-in.

---

## 4. Subsystem Operational Characteristics

### 4.1 AI Investigation Assistant Offline Fallback
- **Limitation**: External AI providers (OpenAI, Gemini, Anthropic) may experience network timeouts, HTTP 503 capacity limits, or rate limits.
- **Guarantee**: The core deterministic RCA scoring engine is completely decoupled from LLMs. If an AI provider fails, the platform automatically falls back to deterministic RCA candidates without throwing an error or hallucinating causes.

### 4.2 SMTP & Notification Mock Mode
- **Limitation**: Sending live email notifications requires customer-provided SMTP relay credentials (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`).
- **Default State**: In local development and staging environments, `NOTIFICATION_MOCK_MODE=true` is enabled by default to prevent failed network calls or email spam. Live Slack and SMTP delivery activate only when valid webhook URLs or credentials are provided.

### 4.3 Workload Protection Rules
- **Guardrail**: The governed remediation engine strictly blocks any automated or manual action that attempts to restart, stop, or scale to zero a production database container or system namespace (`kube-system`). This is an intentional safety invariant and cannot be bypassed.

