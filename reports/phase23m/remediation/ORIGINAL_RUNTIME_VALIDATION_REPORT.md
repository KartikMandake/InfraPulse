# Phase 23M — Independent Runtime Validation

Validation dates: **31 October–1 November 2026**, Asia/Calcutta. Repository: `D:\Projects\InfraPulse`.

**Overall readiness: FAILED.** The real backend and built React frontend were started, all 19 frontend routes were inspected, and workflows A–F were exercised with isolated data. Critical security and correctness failures remain. Passing unit tests do not establish production readiness.

Evidence for this independent run is in [`reports/phase23m/independent`](../reports/phase23m/independent/). Earlier artifacts in the parent `phase23m` directory were preserved and are not counted as fresh verification. Readiness labels in this report mean:

- **VERIFIED:** directly exercised with evidence.
- **VERIFIED WITH LIMITATIONS:** exercised within the stated scope.
- **NOT VERIFIED:** not exercised.
- **FAILED:** exercised and the required behavior failed.

## 1. Repository audit

**VERIFIED WITH LIMITATIONS.** Reviewed the application entry points, routes, controllers, persistence, migrations, integration providers, telemetry and intelligence engines, frontend context and page wiring, deployment manifests, backup scripts, and existing tests. The initial preservation snapshot hashes **407 files**. The later source audit indexes **400 source/configuration/test/document files** and **196 route declarations**, including validation additions. Generated assets, dependency trees, reference-design images, and secrets were excluded from the source index. An indexed file is not a claim of exhaustive manual or dynamic verification of every code path.

| Area | Implementation and independent finding |
|---|---|
| Frontend | React 19, React Router, Vite, Tailwind, React Flow and Recharts. `App.jsx` exposes 19 routes. `AppContext` starts with mock state and selectively replaces it with API responses; failed requests can leave plausible mock data visible. |
| Backend | Express ESM application; `server.js` validates configuration, checks PostgreSQL, optionally migrates/seeds, then starts HTTP and the optional notification worker. The worker was disabled for validation. |
| Database | PostgreSQL; migrations `001`–`018`. Core service/incident/auth tables, integrations, canonical events, drift, remediation and SRE tables. The fresh database initially contained 72 public tables; a restore sentinel added the 73rd. |
| Authentication | Bcrypt password verification, PostgreSQL sessions, HTTP-only cookies and bearer session tokens. Valid/invalid login, cookies, logout, persistence after backend restart and role restrictions were tested. Users returned by the repository have no tenant identity. |
| Authorization | `authenticate` permits requests without a token; it does not enforce login. Many read routes omit `requireAuth`. `requireRole` accepts exactly the enumerated roles, rather than an implicit hierarchy. |
| Tenant/environment isolation | Some repositories filter `tenant_id`; core resource/service queries do not. Several controllers accept tenant identity from query parameters. Canonical event uniqueness omits tenant identity. Environment selection in the UI does not establish server-side authorization. |
| Integrations | Registry has eight providers. Local Kubernetes HTTP fixture exercised connection testing, read-only discovery, synchronization, provider failure, disable/re-enable and reconnection. AWS clients were inspected/tested without cloud credentials or mutation calls. |
| Telemetry | Public OTLP handlers call `ingestEvent` directly. The richer `telemetryPipelineService` has service updates, dependency inference and alert evaluation, but these public handlers bypass it. In-memory pipeline deduplication is not durable across processes. |
| Alerting/incidents | Database-backed evaluation created alerts and an incident, linked alerts, and returned investigation/timeline/correlation data. This was a separate controlled service-state scenario, not successful OTLP-to-incident verification. |
| RCA/topology | Dependency-aware ranking and evidence fields exist. An observed crashed workload caused `CONFIRMED_FACT` despite `sufficientEvidence: false`. |
| Drift | Baselines, snapshots, severity, differences and reconciliation previews persist. Preview did not mutate the provider. Baseline/snapshot normalization also introduced unrelated namespace/region differences. |
| Remediation | Recommendations, risk scoring, plans, approvals, execution records and feature guards exist. Global execution disablement worked. Resource exclusion is not enforced by a database constraint; stored plan content can change without invalidating approval. |
| SRE intelligence | Health, regression-based prediction, SLO arithmetic and capacity recommendations exist. Real rolling burn windows were not implemented: the service weights one aggregate. Zero utilization was incorrectly replaced by a default; corrected in this phase. |
| Deployment/recovery | Docker Compose, staging Nginx and Kubernetes manifests were inspected. No deployment was performed. Logical backups were restored with real data; WAL archiving was off. |

Supporting files: `initial-file-hashes.json`, `source-audit-inventory.json`, `tenant-schema-audit.json`, `technical.json`.

## 2. Application startup and local environment

**VERIFIED WITH LIMITATIONS.** Node **v26.4.0**, npm **11.17.0**, Windows **10.0.26100**, Intel i5-13420H, 12 logical CPUs, approximately 15.65 GiB RAM. Installed dependencies were sufficient to build and run; no dependency installation or lockfile update was needed.

| Component | Actual target/result |
|---|---|
| Backend | `http://127.0.0.1:5010`; Express server started successfully. |
| Second backend | `http://127.0.0.1:5011`; used for the cross-instance kill-switch comparison. Not retained as a final running service. |
| Frontend | `http://127.0.0.1:5180`; actual Vite production bundle served by a local validation HTTP server, with `/api` proxied to port 5010. This did not validate production Nginx or the Vite development proxy. |
| Original local database | `infrapulse`, port 5434: read-only transaction confirmed 18 migrations, 8 services and 5 incidents. No migrations, seeding, truncation or application writes were directed at this database. |
| Isolated database | `infrapulse_23m_independent_1793461903978`; separate `_suite` and `_restore` databases. |
| Final PostgreSQL cluster | `127.0.0.1:5541`, PostgreSQL **16.14**; run-owned data directory `D:/Projects/.infrapulse-23m-independent/pgdata`. Loopback-only test authentication; not a deployment template. |
| Migrations | All 18 applied successfully to fresh application and suite databases. Existing database migration status was inspected without modification. |
| Frontend build | Exit 0, 18.10 seconds reported by Vite, 79 transformed modules. Main JS asset **1,737.64 kB**, gzip **293.16 kB**; Vite emitted its large-chunk warning. |

Initial verification used an earlier local test cluster on 5540. It became unavailable during a browser attempt. Fresh run-owned databases were then initialized on 5541 without deleting the original cluster or databases. The initial host had roughly 1.3 GiB free physical memory and about 147 MB free on C:. Shell/thread and Chromium failures occurred under these resource constraints; these failures are environment limitations, not proof of application defects. Later browser runs succeeded. A later runtime interruption required restarting the run-owned cluster; PostgreSQL performed automatic internal crash recovery. This is not an archived-WAL/PITR test.

Final checks returned HTTP **200** for frontend, `/api/health/live`, `/api/health/ready`, and `/api/health/diagnostics`. Browser requests through port 5180 reached the backend. The frontend's text saying “port 5000” is hard-coded and is not the measured backend URL.

Evidence: `build.json`, `startup.json`, `fresh-cluster.json`, `environment.json`, `runtime-final.json`, backend logs, fresh migration/seed JSON files. `environment.json` describes the initial 5540 attempt; **`runtime-final.json` is authoritative for final URLs and port 5541**.

## 3. Page-by-page frontend validation

Every listed route was opened in headless Chromium at 1440×1000 and 390×844. The first completed walkthrough had no uncaught page exceptions. A second interaction pass exposed the clipboard exception and permission failures described below. Rendering alone was not treated as functional verification.

| Route/page | Controls and behavior actually exercised | Readiness |
|---|---|---|
| `/` — Incident Overview | Inspect control; incident/service content and associated API traffic inspected. | VERIFIED WITH LIMITATIONS |
| `/system-overview` | Environment and time controls; Run Diagnostic. Dashboard includes demo/local presentation, not measured production telemetry. | VERIFIED WITH LIMITATIONS |
| `/services` | Search with no matches, severity selection, Inventory/Graph switching, graph content. Controlled 503 and empty API responses. | VERIFIED WITH LIMITATIONS |
| `/services/auth-gateway-v2` | Pod, alert, dependency and endpoint tabs; returned service data. | VERIFIED WITH LIMITATIONS |
| `/incidents` | Severity filter, reset and Investigate navigation. | VERIFIED WITH LIMITATIONS |
| `/incidents/INC-6400` | Evidence expansion, deployment timeline filtering, suggested assistant question; investigation API exercised separately. RCA confidence failure remains. | FAILED |
| `/alerts` | Filter controls and acknowledgment on isolated data; alert-evaluation API exercised separately. | VERIFIED WITH LIMITATIONS |
| `/telemetry` | Traces/logs/metrics switching, query and search controls in demo mode. Live datasource behavior was not tested. | VERIFIED WITH LIMITATIONS |
| `/deployments` | Risk assessor, dependency blast radius, regressions and historical-intelligence tabs. No rollback or real deployment. | VERIFIED WITH LIMITATIONS |
| `/slos` | Filter, Evaluate and Define SLO form. Arithmetic tested; real multi-window behavior failed. | FAILED |
| `/runbooks` | Search/filter, generated dry-run plan, approval and execution/audit tabs; role-page comparison. No real execution. | VERIFIED WITH LIMITATIONS |
| `/fault-injection` | Scenario selection and preview content. Injection intentionally not requested. | VERIFIED WITH LIMITATIONS |
| `/reports` | Export clicked with default denied clipboard permission: uncaught rejection. Retest with clipboard permission copied 875 characters. A guessed COMPLETED control was absent in the later dataset and is not counted as tested. | FAILED |
| `/operations` | Pattern/recommendation/trend tabs; admin Sync Patterns and Scan Warnings initially returned 403. After correction both returned 200 in the browser. | VERIFIED WITH LIMITATIONS |
| `/cloud-lifecycle` | Search; drift, approvals, schedules, cost and audit tabs. Viewer/responder comparisons exposed empty inventory due to a bundled admin-only audit request. No lifecycle execution. | FAILED |
| `/sre-intelligence` | Risk, SLO, capacity and recommendation tabs; Refresh State. Freshness/forecast arithmetic tested separately; confidence/window limitations remain. | VERIFIED WITH LIMITATIONS |
| `/integrations` | Ecosystem/notification/community tabs, Logs open/close, configuration open/cancel, required-name validation, invalid JSON draft handling. First interaction script failed to close a modal; targeted retest corrected that harness sequence. | FAILED |
| `/team` | Audit and API-token tabs, role comparisons, backend user-list restrictions. A generic initial select probe attempted a protected role change and got 403; it is not evidence of a successful role edit. No real invitation/token provisioning. | VERIFIED WITH LIMITATIONS |
| `/auth` | Wrong password 401; correct password 200; cookie-backed session; logout; reload showed Guest. Cluster setup tab inspected without installing its Helm command. | VERIFIED WITH LIMITATIONS |

Loading/empty/error coverage: loading waits and network responses recorded across routes; explicit empty and 503 service responses were intercepted only inside the browser. A 503 left mock service content visible rather than a clear failure. This does not verify each page's separate error/empty branch. Role checks covered viewer, responder and admin on team, cloud and runbook pages plus API probes; every role/action permutation was not tested.

Responsive limitation: normal-font mobile screenshot shows clipped integration tabs and account control; measured right edges were approximately 408 and 425 px at a 390 px viewport. Document width alone stayed 390 because overflow was clipped. Initial screenshots deliberately blocked remote fonts to reduce resource pressure; later visual captures allowed fonts and still reproduced clipping. No screenshot comparison against a design spec was claimed.

Evidence: `browser-results.json`, `browser-interactions.json`, `browser-role-pages.json`, `browser-error-state.json`, `browser-empty-state.json`, `browser-final.json`, `browser-visual.json`, and desktop/mobile PNGs.

## 4. API validation

| Behavior | Observed result | Readiness |
|---|---|---|
| Liveness/readiness/diagnostics | 200 while connected; liveness 200 and readiness 503 during controlled DB outage. | VERIFIED |
| Valid/invalid authentication | Three seeded roles authenticated; wrong password/invalid session rejected; browser form/session/logout and persisted session after backend restart tested. | VERIFIED WITH LIMITATIONS |
| User administration RBAC | Viewer user-list request 403; admin 200. | VERIFIED |
| Anonymous reads | Services, incidents, alerts, deployments, events, integrations and cloud resources returned 200; SRE overview required authentication and returned 401. | FAILED |
| Tenant reads | Anonymous query selecting another tenant and direct event-ID read returned private sentinel data. Authenticated viewer could select another tenant too. | FAILED |
| Tenant writes | Two tenants submitted matching event identity; second payload overwrote first tenant's event summary while the row retained the first tenant ID. | FAILED |
| Ingestion auth | Configured real synthetic OTLP key was rejected; `Authorization: Bearer <ingestion-key>` was also treated as an invalid session. | FAILED |
| Alert/investigation/timeline/correlation | Controlled evaluation and investigation/timeline/correlation returned 200, with persisted alerts/incident linkage. | VERIFIED WITH LIMITATIONS |
| Remediation guards | Self-approval, wrong supplied hash, expiry and disabled execution rejected, but with HTTP 500. Correct independent approval returned 200. | VERIFIED WITH LIMITATIONS |
| Stored-plan integrity | Edited stored parameters with unchanged stored hash were approved with the original hash, HTTP 200. No mutation was executed. | FAILED |
| Operations admin permissions | Two live HTTP controls initially 403; six-role/endpoint regression cases passed after correction. | VERIFIED |

API paths/bodies, response envelopes, timings and relevant SQL are in executable harnesses and JSON evidence. The source inventory records route declarations; it is not a claim that all 196 declarations were dynamically exercised.

## 5. End-to-end workflows

### A — Infrastructure integration: VERIFIED WITH LIMITATIONS

Created a Kubernetes integration pointing only to an in-process loopback HTTP fixture. Connection tests succeeded; both responder and admin synchronization discovered a deployment and pod, persisted inventory and timestamps, and made only GET requests to the fixture. A controlled provider 503 caused synchronization to return success with zero resources and retain `CONNECTED`; a separate connection test correctly changed status to `ERROR`. Reconnection succeeded. Disabling the integration did not stop synchronization. Actual Kubernetes API authorization, Docker Engine and live AWS discovery are **NOT VERIFIED**.

### B — Telemetry to incident: FAILED

Public OTLP JSON metric and two linked spans returned 200. Duplicate traces were also acknowledged as two ingested records. Requested tenant `phase23m-other-tenant` became `default_tenant`; the service metric remained unchanged; alert/incident counts stayed at 5/3; observed dependency records were empty. The canonical trace representation dropped the parent-span relationship. These handlers bypass the richer pipeline.

Separately, changed only the isolated payment-service row, evaluated rules, observed newly created alerts and an auth-gateway incident plus links to the seeded payment incident, then inspected investigation/timeline/correlation responses. This verifies those downstream components, **not** the failed OTLP-to-incident connection. No production service was faulted.

### C — RCA: FAILED

Controlled caller→database topology ranked the database first (23.8) and caller second (21.3), both `WEAK_HYPOTHESIS` with insufficient evidence. A symptom/crashed-workload scenario returned score **88**, **`CONFIRMED_FACT`**, **`sufficientEvidence: false`**. That observed state is insufficient to prove the causal origin.

The existing labeled evaluator separately exercised eight scenarios: top-1 85.7%, top-3 100%, MRR 0.929, reported false-positive rate 0%, insufficient-evidence detection 100%, average 3.67 ms. Those small-dataset results do not override the independent failing scenario or establish accuracy on real incidents.

### D — Drift governance: VERIFIED WITH LIMITATIONS

Initialized a staging desired-state baseline, changed only the fixture deployment's inventory state to stopped, detected medium-severity workload-state drift, and generated a reconciliation preview. The resource remained stopped, `is_executable` was false, and the provider recorded **zero non-GET calls**. Namespace and region normalization also produced unrelated differences, so drift accuracy is limited. Real infrastructure drift and mutation reconciliation are **NOT VERIFIED**.

### E — Governed remediation: FAILED

The initial fixture had no matching payment resource, so its guard checks used an explicitly recorded fallback plan. A supplemental scenario added a synthetic crashed payment container and seeded a provisional strong hypothesis. The actual recommendation API then generated one recommendation, LOW risk, score 30, with a generated plan and hash. This used synthetic evidence; it was not proof that workflow B automatically produced a correct recommendation.

Dry-run, requester/approver separation, independent approval, supplied-hash mismatch, expiration and disabled execution were exercised. Execution records remained **zero**. All provider/execution feature flags stayed false. A separate stored-parameter edit with the old hash was approved; the parameters were restored after recording the failure. Cross-instance and restarted-process kill switches disagreed. Therefore approval integrity and distributed safety are not verified as correct.

### F — SRE intelligence: VERIFIED WITH LIMITATIONS

All six SRE GET APIs responded. Pure SLI fixture: 10,000 events, 9,950 good, 50 bad, target 99.9% → SLI 99.5%, ten allowed bad events, no remaining budget, burn multiplier 5. The actual SLO service instead produced 1h/6h/24h rates **7.5/5.5/5** from weighted copies of that aggregate; these are not independently measured windows.

OLS fixture with four hourly points 40/50/60/70 produced slope 10/hour, R² 1; insufficient samples were identified. Fresh/stale/no-data overrides yielded FRESH/STALE/UNAVAILABLE; 25-hour-old data remained STALE with MEDIUM confidence. Actual aggregate health was FRESH/HIGH while all displayed services lacked telemetry. Capacity zero-utilization behavior was corrected and regression tested. Cost displays and API fields use estimated pricing/savings; actual billing and realized savings are **NOT VERIFIED**.

Evidence: `workflows.json`, `technical.json`, `supplement.json`, `final-api-audit.json`.

## 6. Independent evaluation of the ten known technical risks

| Risk | Result and scope | Readiness |
|---|---|---|
| DB-backed idempotency/resource locks | Independent DB clients: same key rejected with SQLSTATE 23505; distinct keys allowed multiple EXECUTING records for one resource. Service checks are separate SELECT/INSERT operations. No actual mutation race was run. | FAILED |
| Durable telemetry deduplication | Same-process repeat counted as duplicate; fresh process processed the event again. Canonical upsert kept one row but did not provide durable side-effect deduplication. | FAILED |
| Tenant isolation | Anonymous/private-ID access and cross-tenant overwrite directly reproduced. Some scoped repository tests passed; complete isolation across every API/query is not established. | FAILED |
| Private integration endpoints/SSRF | Private IPv4 denied by default in production-mode validator; explicit opt-in allowed private fixture addresses and still denied literal metadata IP. `localhost`, bracketed IPv6 and mapped loopback were accepted without equivalent checking. No metadata request or DNS-rebinding exploit performed. | FAILED |
| AWS regions | Default ap-south-1 accepted, alternate region rejected by current allowlist. Source reads `AWS_ALLOWED_REGIONS`; individual discovery takes one region. Live configured multi-region traversal was not exercised. | VERIFIED WITH LIMITATIONS |
| Actual WAL backups/restoration | Inspected settings: `archive_mode=off`, archive command disabled, WAL level replica. No archive/base-backup/PITR restoration performed. | NOT VERIFIED |
| Recovery restores real data | Logical archive restored all 548 rows across 73 tables, identical per-table hashes and sentinel; actual PowerShell backup/restore scripts also succeeded. This is logical recovery, not archived WAL recovery. | VERIFIED WITH LIMITATIONS |
| SLO windows | Basic event arithmetic exercised; real service windows are synthetic weights of a single aggregate. | FAILED |
| RCA confirmed status | Crash symptom promoted to confirmed fact with insufficient evidence. | FAILED |
| Integration failure health | Fixture 503 sync returned success/CONNECTED; connection test correctly reported ERROR. Disabled integration still synchronized. | FAILED |

## 7. Performance measurements

**VERIFIED WITH LIMITATIONS.** Local seeded data, test-mode backend, worker disabled, one backend during load measurements, PostgreSQL pool cap eight, low-memory Windows host. These are development measurements, not capacity estimates. No sustained production-scale soak, large dataset, internet provider latency or availability target was established.

Independent workload: **three repetitions × ten concurrent requests × five endpoints = 150 requests**, all 200. Every latency and status is recorded in `technical.json`; nearest-rank aggregate summaries are in `performance-summary.json`.

| Endpoint | Requests | p50 ms | p95 ms | Maximum ms | Errors |
|---|---:|---:|---:|---:|---:|
| `/api/health/ready` | 30 | 12.29 | 136.41 | 136.64 | 0 |
| `/api/services` | 30 | 15.60 | 22.94 | 24.02 | 0 |
| `/api/incidents` | 30 | 19.96 | 43.13 | 44.12 | 0 |
| `/api/alerts` | 30 | 18.61 | 32.17 | 34.34 | 0 |
| `/api/sre-intelligence/overview` | 30 | 75.36 | 136.02 | 138.69 | 0 |

Existing `tests/performance/api-load.js`: one 2,500 ms stage per endpoint, ten concurrent workers. Ready/services/incidents/alerts respectively reported **1276.9/572.1/584.1/660 requests/s**, p95 **13.60/26.67/23.98/21.80 ms**, zero errors. Its CLI prints aggregate results; raw counts are not emitted by that CLI. It is separate from the fully recorded 150-request workload. The full benchmark aggregator was not run because it repeats broader scenario work; no aggregate benchmark success is claimed.

Telemetry workload: three batches of 100 representative log events through `/api/events/ingest`; HTTP 201 each; **300 persisted rows**. Durations **194.27/159.67/162.08 ms**, measured **514.76/626.28/616.98 events/s**. This is canonical-event ingestion, not repaired OTLP pipeline throughput.

Representative tenant-event query: one `EXPLAIN ANALYZE` at the small pre-load dataset, tenant index scan plus sort, planning **0.241 ms**, execution **0.491 ms**. Backend RSS before/after request measurements **108/109 MB**, heap used **35/37 MB**. No leak conclusion follows from two samples.

Provider timeout: loopback server deliberately never responded; configured **250 ms**, measured **273.30 ms**, returned a failed connection result without crashing the process.

Browser walkthrough elapsed times were about 1.23–1.99 seconds per route, including deliberate waits, controls, screenshots and viewport changes. They are **not** first-contentful-paint or user loading-time measurements. Web Vitals are **NOT VERIFIED**.

## 8. Reliability and recovery

- **VERIFIED:** one controlled outage of the run-owned PostgreSQL cluster. Liveness remained 200; readiness became 503. Authenticated session validation returned 500 while disconnected. Three subsequent authenticated service/readiness pairs returned 200 after restart.
- **FAILED:** unauthenticated `/api/services` returned plausible mock services with 200 during the database outage. Browser-controlled service 503 similarly left mock data visible. Consumers cannot infer live data availability from these responses.
- **VERIFIED WITH LIMITATIONS:** whole stop/probe/start drill took 2,244 ms. This includes the probe sequence and is not an RTO promise. Database contents were not intentionally destroyed in this drill.
- **VERIFIED WITH LIMITATIONS:** custom-format logical dump **289,123 bytes**, dump **971.95 ms**, restore **3,346.78 ms**; **73 tables/548 rows** matched sorted per-row JSON hashes. The test-only sentinel was restored. These figures describe this snapshot, not production RPO/RTO.
- **VERIFIED WITH LIMITATIONS:** supplied Windows backup/restore scripts returned exit 0, produced a **294,168-byte** subsequent archive and restored the sentinel. POSIX scripts, Docker fallback branches, production procedures and archival WAL remain **NOT VERIFIED**.
- **VERIFIED:** an existing session survived backend restart. **FAILED:** the in-memory kill switch reset to inactive; it was explicitly re-engaged afterward.
- **NOT VERIFIED:** graceful OS signal shutdown, notification-worker recovery in this running environment, production failover, actual remote provider degradation, and a long-duration memory soak.

Evidence: `database-recovery.json`, `backend-restart.json`, logical backup entries in `technical.json`, script results in `supplement.json`, PostgreSQL logs.

## 9. Security findings and remediation safety

The most significant reproduced failures are anonymous/cross-tenant data access, cross-tenant event overwrite, and approval of modified stored plan parameters. Additional failures involve distributed kill-switch state, missing database resource exclusion, SSRF address classification and CSRF prefix matching.

Safety was maintained during validation: `AWS_LIFECYCLE_MUTATIONS_ENABLED`, `DOCKER_LIFECYCLE_ENABLED`, `KUBERNETES_LIFECYCLE_ENABLED`, `REMEDIATION_EXECUTION_ENABLED` and `REMEDIATION_PRODUCTION_ENABLED` were false in the validation processes. Notifications used mock mode; AWS credential discovery was disabled/pointed at non-existent test profiles. No real AWS start/stop, Docker/Kubernetes mutation, deployment, external notification or production database write was requested.

The lifecycle suites that set provider mutation flags true were not run. Governed-remediation tests 11 and 12 were excluded because they set execution true, even though they inject mocks. Their behavior was replaced by persistence-only probes while flags remained false. Database claims and approval probes do not prove actual safe mutation execution.

## 10. MediFlow integration preparation

**NOT VERIFIED** for a running MediFlow integration. No MediFlow repository was found in the inspected project locations, no MediFlow files were edited, and its language/runtime/SDK versions and health endpoints are unknown. This is a practical next-phase plan, not a successful integration claim.

1. Inventory MediFlow runtimes, services, routes, database clients, jobs and deployment topology. Record actual versions and existing `/health`/readiness endpoints before choosing SDK versions. Use separate names such as `mediflow-api`, `mediflow-worker` and `mediflow-web`, with `service.namespace=mediflow`, `service.version`, `deployment.environment.name=staging`, and an instance identifier. Also provide the legacy `deployment.environment` attribute while InfraPulse's current parser requires it.
2. Initialize compatible instrumentation before application/framework imports. The local demo provides a Node SDK example, but pins older SDK/exporter families; do not assume that its `Resource` API or versions fit MediFlow. The official [JavaScript exporter documentation](https://opentelemetry.io/docs/languages/js/exporters/) describes HTTP/JSON and HTTP/protobuf transports; choose matching packages for the actual MediFlow runtime.
3. Prefer MediFlow → local/private OpenTelemetry Collector → approved telemetry backends. InfraPulse currently accepts JSON bodies only at `/api/integrations/otlp/v1/{traces,metrics,logs}`. Default SDK export may use protobuf; explicitly configure a supported JSON exporter/bridge, or implement and test protobuf acceptance in a later authorized phase. The [official exporter configuration](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/) documents protocol and per-signal endpoint settings; setting a signal-specific endpoint must use its complete path. This protocol guidance is inference applied to the inspected InfraPulse handlers, not a MediFlow compatibility test.
4. Existing `deploy/otel-collector-config.yaml` exports to Tempo, Prometheus and Loki, **not** directly into InfraPulse canonical ingestion. Configure and test an explicit ingestion path rather than assuming dashboard visibility implies canonical-event ingestion. Resolve the broken OTLP key/session-token handling first; bind tenant/environment to a verified ingestion credential, not a query parameter. Keep ingestion credentials server-side.
5. Trace inbound HTTP, downstream HTTP/database/queue calls, propagate W3C trace context, and collect request counts, failed requests and latency histograms with consistent units. Map these metrics to alert/SLO inputs; the current public receiver does not perform that mapping. Verify histogram/counter semantics with representative SDK payloads; only the supplied gauge/span JSON fixtures were exercised here.
6. Permit MediFlow→collector 4318/4317 as appropriate; collector→Tempo/Prometheus/Loki and/or authenticated InfraPulse receiver; InfraPulse→approved private metrics/inventory endpoints. Use routable service DNS rather than container-local `localhost`. Set a scoped private-endpoint policy while preserving metadata denial, DNS/IPv6/redirect checks, TLS verification and timeouts.
7. Plan health probes for MediFlow API, worker/queue processing and database dependencies. Inspect read-only Docker/Kubernetes labels (`app`, `app.kubernetes.io/name`, Compose service) and align them with OTel service names. Current discovery can enumerate a test workload, but OTLP parent relationships are lost and automatic end-to-end correlation failed. MediFlow discovery/correlation therefore remains **NOT VERIFIED** until corrected and exercised.
8. Acceptance exercise for the next phase: named staging services visible; authenticated tenant-correct traces/metrics/logs; repeat/restart deduplication; correct dependency edges; controlled failed request → alert → incident → evidence-qualified RCA; measured SLO windows and recovery. Exclude patient/request bodies and personal identifiers from telemetry. Keep all execution flags disabled and all remediation dry-run only.

No changes to MediFlow, collector deployment, network policy or real infrastructure were made in this phase.

## 11. Defect register

All reproductions target the isolated application/database. Paths refer to current source. Evidence filenames are under `reports/phase23m/independent`. A proposed correction is not a completed fix unless explicitly stated.

| ID / severity | Description, reproduction and component | Evidence / established cause | Correction and required regression |
|---|---|---|---|
| M01 **P0** | Anonymous reads expose services/incidents/integrations; anonymous or viewer request with another `tenantId`, or a known event ID, exposes that tenant's sentinel. Routes/controllers/auth and repositories. | `workflows.json` public-boundary probe; `supplement.json` viewer probe. Optional authentication, client-selected tenant, unscoped ID lookup; user model lacks trusted tenant identity. | Enforce login and server-derived tenant authorization across routes/queries. Add anonymous, two-tenant, direct-ID, environment and role/API matrix tests. Complete API-wide isolation remains unverified. |
| M02 **P0** | Submit identical canonical event identity for tenants alpha and beta; beta replaces alpha's summary while row remains alpha-owned. | `supplement.json`, `cross-tenant-event-collision`; tenant omitted from event identity/upsert constraint. | Tenant-scoped IDs and unique keys plus migration/collision handling; regress concurrent same-source events across tenants. |
| M03 **P0** | Generate plan/request approval, edit stored parameters without changing `plan_hash`, approve using old hash: 200 APPROVED. | `final-api-audit.json`; approval compares stored hash to supplied hash without recomputing canonical content. Tested with a synthetic different container target; no execution. | Immutable canonical plan/version binding, recomputation/signature at approval and execution, mandatory hash/version verification. Regress stored-parameter, target, action and version tampering. |
| M04 **P1** | Enable kill switch on backend 1; backend 2 stays inactive. Restart backend 1: inactive again. | `workflows.json`, `backend-restart.json`; module-level variables in `lifecycle-policy.js`. | Durable shared/fail-closed state checked at execution; test two instances and restart propagation. |
| M05 **P1** | Independent DB clients insert distinct execution keys on same resource; multiple EXECUTING rows persist. | `technical.json`; SELECT/INSERT lock check is not atomic; no active-resource exclusion constraint. Actual provider race not executed. | Transactional resource claims/advisory lock or tenant/resource partial unique constraint; test synchronized concurrent processes and crash recovery without real mutation. |
| M06 **P1** | Post representative OTLP metric/parent-child spans: 200, but wrong tenant, unchanged service, no new alerts/incidents/dependencies. | `workflows.json`; handler calls normalizer directly, passes tenant as a string where options are expected, and bypasses pipeline; trace re-normalization loses parent linkage. | Route authenticated ingestion through shared pipeline and retain canonical trace/resource attributes. Regress real SDK JSON → metric/dependency → alert/incident. |
| M07 **P1** | Configure ingestion key; correct X-OTLP-Key returns 401. Bearer ingestion key rejected as invalid login session. | `workflows.json`; comparison uses redacted credential preview; global authentication consumes bearer tokens before OTLP handling. | Decrypt/verify ingestion credential in a dedicated auth path and bind tenant to it. Test valid, invalid, missing, rotated, disabled and bearer/custom-header cases. |
| M08 **P1** | Provider returns 503: sync says success/zero resources, still CONNECTED. Disabled integration still syncs. | `workflows.json`; Kubernetes snapshot catches failure, sync lacks enabled guard and accurate failure propagation. | Preserve unavailable/partial/error states and timestamps; block disabled sync. Regress 503, timeout, partial failure, disable/re-enable and recovery. |
| M09 **P1** | Crashed-workload symptom yields score 88, CONFIRMED_FACT and insufficient evidence simultaneously. | `workflows.json` controlled RCA; `hasInfraFailure` directly selects confirmed status. | Separate observed infrastructure fact from causal confirmation; require independent causal evidence. Add symptom-only crash/cascade and contradictory-evidence regressions. |
| M10 **P1** | Evaluate SLO using 10,000/50 bad events: 1h/6h/24h outputs 7.5/5.5/5 without distinct windows. | `supplement.json`; `slo.service.js` weights one count by 1.5/1.1/1; default volume is an RPS approximation. | Time-bucketed event counts per actual window and clear estimated-data status. Regress window boundaries, burst timing, zero traffic and late samples. |
| M11 **P1** | Cookie-only dry-run rejected without origin/for unrelated origin; accepted with `Origin: http://localhost:51730`. | `supplement.json`; CSRF compares `startsWith`, not URL origins. This is an HTTP boundary test, not a live cross-site exploitation exercise. | Parse/exact-match origins and constrain cookie/header exemptions. Test prefix ports/domains and genuine cross-origin browser requests. |
| M12 **P1** | AWS roleArn-only credentials validate, but constructed SDK client receives no role assumption configuration. | `technical.json`; capture-only client, no AWS call; `_getClient` ignores roleArn. | Implement explicit scoped assume-role credential resolution and external-ID handling; injected STS/client-config tests plus later approved read-only live test. |
| M13 **P1** | Production-mode URL validator blocks private IPv4 but accepts localhost, bracketed IPv6 and mapped loopback. | `technical.json`; lexical hostname/net.isIP checks omit DNS resolution and bracket normalization. No metadata connection attempted. | Normalize/resolve addresses, validate all IP forms and redirects, prevent rebinding; explicit scoped private allowlist. Test IPv4/IPv6, DNS and metadata redirects against local fixtures. |
| M14 **P2** | Event duplicate detected in one process is processed again in a new process. | `technical.json`; pipeline dedup Map. DB upsert limits rows but not processing side effects. | Durable tenant-scoped dedup/claim transaction; regress restart and simultaneous-worker replay with alert/dependency side effects. |
| M15 **P2** | Self-approval, tampering, expiry and disabled execution return HTTP 500. | `workflows.json`, `supplement.json`; expected domain rejections use generic Error. | Map domain failures to appropriate 4xx responses without weakening guards; HTTP regression tests. |
| M16 **P2** | Viewer/responder cloud page shows zero inventory despite readable resources. | `browser-role-pages.json`; page's Promise.all includes admin-only audit endpoint, causing the full load to fail. | Fetch authorized data independently and clearly show denied sections. Test each role's inventory despite audit 403. |
| M17 **P2** | Integration tabs/account control clipped on 390 px screen. | `browser-visual.json`, `visual-mobile-integrations.png`; fixed/minimum widths inside clipped containers. | Responsive wrapping/scroll behavior and accessible navigation. Regress narrow layout and actual tab/account interaction, not document width alone. |
| M18 **P2** | Replace integration JSON draft with `{`; field snaps back to prior object instead of retaining draft/error state. | `browser-final.json`; textarea reparses every keystroke and discards invalid intermediate JSON. | Preserve editable draft strings; validate on blur/submit. Regress ordinary typing, invalid draft feedback and valid paste. |
| M19 **P2** | Export with clipboard permission denied emits uncaught rejection; allowed permission works. | `browser-interactions.json`, `browser-final.json`; unawaited `navigator.clipboard.writeText` and unconditional success toast. | Await/catch copy, display failure or download fallback. Test denied/missing/allowed clipboard. |
| M20 **P2** | Baseline/state-only change also yields unrelated namespace/region drift on fixture resources. | `workflows.json`; baseline and snapshot normalization disagree (`infrapulse` vs fixture namespace, API URL vs ap-south-1). | Canonicalize both paths from same provider identity/config. Regress unchanged baseline→snapshot as zero drift, then one-field deviation. |
| M21 **P2** | Aggregate health reports FRESH/HIGH while all services show unavailable telemetry; 25-hour-old override remains STALE/MEDIUM. | `workflows.json`, `supplement.json`; aggregate integration activity differs from service evidence and unavailable threshold is not applied to old samples. | Derive freshness/confidence from per-entity observation timestamps/coverage. Test no service samples, sync-only activity, stale updated rows and >24h age. |
| M22 **P2**, corrected | Measured zero CPU/memory produces no idle-compute insight. | `capacity-regression-before.json`: failure; after: 2 tests pass. Boolean fallback discarded zero. | **Changed two expressions to nullish fallbacks** in capacity optimization. Regression covers real zero and missing readings; focused 29-test run passed. |
| M23 **P2**, corrected | Admin operations Sync Patterns/Scan Warnings return 403, while responder succeeds. | `browser-interactions.json`, `operations-regression-before.json`: 2 failures; after: 6 pass, browser both 200. Exact-role middleware omitted admin. | **Added admin to six operational-intelligence write-route role lists.** HTTP regressions cover two sync endpoints with all three roles; other write endpoints share corrected declaration but were not all executed. |
| M24 **P2** | Existing suite has four failing assertions: registry count, Kubernetes old fixture contract, Prometheus status label, malformed OTLP behavior. | Two suite logs: expected 6 providers vs actual 8; old Kubernetes test attempts unavailable cluster DNS; expected OK vs AVAILABLE; expected empty array but validation throws. | Update stale fixtures/contracts after agreeing intended behavior; retain valid malformed-request rejection. These are not four proven separate production outages. |
| M25 **P2** | DB/backend failure can leave simulated service data with successful presentation. | `database-recovery.json`, `browser-error-state.json`; backend/frontend mock fallbacks. | Explicit source/freshness/error metadata; fail clearly or display labelled stale/demo fallback. Regress disconnected DB and partial frontend API failures. |
| M26 **P2** | Main frontend JS bundle exceeds 1.7 MB minified, producing Vite warning. | `build.json`; monolithic bundle. User loading performance not measured. | Profile/code-split route/chart/graph dependencies; retain warning and measure Web Vitals before setting budgets. |
| M27 **P3** | Setup/readiness documentation is stale: README says ten migrations/168 tests and contains outdated route/script claims; WAL recovery is not demonstrated by migration-only recovery script. | Source audit, current package scripts/migrations; inspected `verifyDatabaseRecovery.js` creates schema rather than restoring rows. | Align docs with actual commands/migrations and distinguish logical restore, internal WAL crash recovery and archival PITR. Test documented startup and backup paths on each supported platform. |

M01–M21 and M24–M27 remain unresolved in this phase. Architectural/security corrections were documented rather than attempted as broad, poorly bounded changes. Only M22 and M23 were changed in application source; existing user edits were preserved.

## 12. Tests passed, failed and skipped

The broad independent selection ran **323 tests: 314 passed, 4 failed, 5 skipped**. It used its own suite database; it was not an unqualified `npm test` pass.

| Group | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Backend | 60 | 0 | 0 |
| Reliability | 6 | 0 | 0 |
| RCA enhancement / assistant | 11 / 8 | 0 | 0 |
| Runbooks / SLO / changes / correlation / operations | 15 each | 0 | 0 |
| Enterprise integrations | 12 | 3 | 0 |
| Release lifecycle E2E | 1 | 0 | 0 |
| Release failure recovery | 19 | 1 | 0 |
| Cloud lifecycle / AWS read-only | 15 / 13 | 0 | 0 |
| Drift / infrastructure integrations / live observability intelligence | 17 each | 0 | 0 |
| Live integration acceptance | 1 | 0 | 5 |
| Autonomous SRE / enterprise hardening | 17 / 10 | 0 | 0 |
| Governed remediation safe selection | 15 | 0 | 0 |

Five live-acceptance tests were skipped because live test flags/credentials were unavailable or disabled. Two additional governed-execution cases were filtered out (11/12); this Node runner omits filtered cases from the reported skip count. AWS EC2 mutation and Docker/Kubernetes lifecycle suites were not run because their setup enables mutation flags. No genuine provider mutation or production test is represented as passed.

Additional checks, counted separately rather than inflating distinct broad-suite totals:

- Capacity regression: initially 1 passed/1 failed; after fix **2 passed**.
- Focused SRE + hardening + capacity run: **29 passed**, zero failed.
- Operations RBAC HTTP regression: reproduced **4 passed/2 failed**; after fix **6 passed**, zero failed. Earlier harness attempts while services/database were stopped failed at setup and are not counted as application assertions.
- Vite production build exit 0 with large-chunk warning.
- Controlled browser/workflow/technical checks use recorded HTTP/SQL results, not test-runner pass totals.
- One labeled-RCA command initially used a relative path with a different working directory and failed to locate the runner; a corrected absolute-path invocation succeeded. An initial integration browser sequence was corrected after leaving its Logs modal open.

## 13. Exact execution commands and evidence

The machine-readable [`commands.jsonl`](../reports/phase23m/independent/commands.jsonl) records exact subprocess executable, arguments, cwd and timestamps. [`EXACT_SUBPROCESS_COMMANDS.md`](../reports/phase23m/independent/EXACT_SUBPROCESS_COMMANDS.md) renders it as PowerShell commands. Environment overrides are explicit in `tests/runtime-validation/independent23m.mjs`; no real credentials are embedded in the command list. SQL and HTTP/browser operations are retained in the harness source and response JSON rather than reconstructed from prose.

Principal top-level commands executed from repository root (some corrected/retried as described):

```powershell
Get-Content -LiteralPath 'C:\Users\karti\.codex\attachments\f09a1949-52e7-487f-8fd2-db4a77120a3a\Pasted text.txt'
git status --short
git diff --numstat
rg --files -g AGENTS.md -g package.json -g pyproject.toml -g README.md -g '*23M*' -g '*23m*'
rg --files backend/src frontend/src scripts deploy infra tests/performance
node --version
npm --version
node tests/runtime-validation/independent23m.mjs setup
node tests/runtime-validation/independent23m.mjs build
node tests/runtime-validation/independent23m.mjs start
node tests/runtime-validation/independent-prepare23m.mjs
node tests/runtime-validation/independent-workflows23m.mjs
node tests/runtime-validation/independent-browser23m.mjs
node tests/runtime-validation/independent-cluster23m.mjs
node tests/runtime-validation/independent-cluster-seed23m.mjs
node tests/runtime-validation/independent23m.mjs start
node tests/runtime-validation/independent-workflows23m.mjs
node tests/runtime-validation/independent-browser23m.mjs
node tests/runtime-validation/independent-suites23m.mjs
node tests/runtime-validation/independent-technical23m.mjs
node tests/runtime-validation/independent-interactions23m.mjs
node tests/runtime-validation/independent-summary23m.mjs
node tests/runtime-validation/independent-supplement23m.mjs
node tests/runtime-validation/independent-fix-check23m.mjs before
node tests/runtime-validation/independent-fix-check23m.mjs after
node tests/runtime-validation/independent-recovery23m.mjs
node tests/runtime-validation/independent-recovery23m.mjs --restart-only
node tests/runtime-validation/independent-evidence-summary23m.mjs
node tests/runtime-validation/independent-fix-check23m.mjs before operations
node tests/runtime-validation/independent-fix-check23m.mjs after operations
node tests/runtime-validation/independent-backend23m.mjs
node tests/runtime-validation/independent-serve23m.mjs
node tests/runtime-validation/independent-audit23m.mjs
node tests/runtime-validation/independent-browser-final23m.mjs
node tests/runtime-validation/independent-finalize23m.mjs
```

Native final test-cluster resume command:

```powershell
& 'C:/Program Files/PostgreSQL/16/bin/postgres.exe' -D 'D:/Projects/.infrapulse-23m-independent/pgdata' -p 5541 -h 127.0.0.1 -c shared_buffers=16MB -c max_connections=20 -c autovacuum=off
```

Other read-only inspection commands used `Get-Content`, `rg -n`, `Get-ChildItem`, `Get-Process`, `Get-CimInstance`, `Get-PSDrive`, `Get-FileHash`, `Invoke-RestMethod` and PowerShell's parser on the referenced source/configuration/evidence files. `Get-NetTCPConnection` was attempted but its module could not load. Owned validation processes were stopped/restarted; existing env files and source were hashed. Two application fixes and new harness/report files were written with `apply_patch`. No Git mutation command was executed.

Harness limitations: these scripts preserve fixed run-specific paths/state and are evidence, not a general-purpose destructive reset tool. Setup refuses to overwrite its state. Do not blindly rerun all scripts against an existing state; the backup/sentinel and cluster setup probes intentionally expect fresh isolated targets. A delayed initial `pg_ctl` wrapper caused stale PID state; a restart attempt got ESRCH, then ownership was established from recorded liveness PID before retry. Current running status is recorded separately in `runtime-final.json`, not inferred from historical state PIDs.

## 14. Changes made and preservation checks

Two bounded application corrections:

1. `backend/src/services/sre-intelligence/capacityOptimization.service.js`: preserve measured zero CPU/memory using nullish fallback.
2. `backend/src/routes/operationalIntelligence.routes.js`: allow admin alongside responder on six operational write routes.

Added independent harnesses, two regression files, raw reports, screenshots, test archives and this report. Earlier backup-script/integration-route corrections visible at the independent baseline were not authored as part of these two fixes.

`preservation-check.json` compared all 407 initial hashes: only the two intended application files and the newly introduced validation helper changed. **No unexpected baseline file changes; root `.env` and `backend/.env` hashes unchanged.** Initial/final Git short status is retained. Git already contained extensive working-tree changes and untracked phase files; these were not discarded, reset or overwritten.

## 15. Git status and infrastructure safety confirmation

**VERIFIED WITH LIMITATIONS.** Used read-only Git status/diff commands. No `git add`, commit, push, merge, branch creation/deletion/rename/switch, reset or clean. No production deployment or database migration. Original local application DB inspected in a read-only transaction; isolated databases retain synthetic test data. Archives and run-owned PostgreSQL files remain available for review.

The final check observed frontend and backend HTTP 200 at the URLs above. These are development validation processes, not an installed persistent service. The second backend was stopped after its comparison. Final cluster is deliberately small and has autovacuum disabled for a bounded test run; do not use it for a production deployment. Provider execution flags remain disabled.

## 16. Remaining limitations

- Live AWS, Docker Engine, real Kubernetes, remote Prometheus/Tempo/Loki, TLS/private networking and actual multi-region discovery: **NOT VERIFIED**.
- Production Nginx/container/Kubernetes deployment, horizontal failover, real notification delivery, archived-WAL/PITR, production RPO/RTO and MediFlow: **NOT VERIFIED**.
- Full API/role/tenant/environment combinations, every button/form error branch, every screen reader/accessibility path, and every responsive layout: **NOT VERIFIED**. Representative tests and static findings do not establish complete coverage.
- The frontend uses demo/mock paths and test users; the dedicated worker and all execution paths stayed disabled. No actual causal recovery from a provider mutation was tested.
- Broad tests have four unresolved contract/fixture failures. The final fixes have focused evidence; the entire broad selection was not rerun after two bounded changes.
- Benchmark scale, observation duration and host resource constraints are explicitly recorded. No production capacity, availability, predictive accuracy or cost-savings guarantee follows.

## 17. Completion disposition

Phase 23M's independent validation/reporting work is complete within the documented safe local scope: application startup/connectivity, major-page interaction, workflows A–F, technical risk probes, defects, narrow fixes, recovery measurements, MediFlow plan and Git preservation have evidence. Several required application behaviors **FAILED**, and the unexercised external/production behaviors remain **NOT VERIFIED**. No new feature-development or deployment phase was started.
