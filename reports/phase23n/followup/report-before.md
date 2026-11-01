# InfraPulse — Phase 23N Operational Readiness Report

Date: **Sunday, 1 November 2026 at 6:54:52 am IST**. Evidence generated 2026-11-01T01:24:52.445Z. Reference: [Phase 23M runtime validation](PHASE_23M_RUNTIME_VALIDATION_REPORT.md).

## Decision

**NOT PRODUCTION READY — NO-GO.** Independent validation found **18 open lifecycle/operational defects, including five P0 findings: N01, N02, N03, N09 and N11**. Approval bypass, missing lifecycle approval binding, duplicate dispatch, incorrect live/StatefulSet classification and crash-recovery failure block readiness. Real Docker/Kubernetes lifecycle execution and archival PITR also remain unverified. No readiness exception is granted by passing existing tests.

This phase performed validation only. **No application implementation, prior test, prior report or environment file was changed.** The additions are Phase 23N validation harnesses, raw evidence and this report. 474 starting file hashes were recorded; all pre-existing application files and both environment files match. Existing Git modifications were preserved, staged state is unchanged, and no staging, commit, push or branch creation was performed.

## Scope, environment and safety

- New owned PostgreSQL **16.14** cluster on **127.0.0.1:5543**, under `D:/Projects/.infrapulse-23n`. Fresh application/suite/restore databases use the `infrapulse_23n_` prefix; migrations **001–022** applied. The original database on 5434 and Phase 23M databases were not written to.
- Real backend on **5030**; disposable crash-test backends on **5031**; actual notification-worker processes were started and restarted with delivery mocked. All Phase 23N backends, workers and the owned PostgreSQL cluster were stopped at completion. Data directories, disposable databases and archives were retained.
- **AWS_LIFECYCLE_MUTATIONS_ENABLED=false throughout.** Docker, Kubernetes and remediation mutation flags also remained false. Existing suites ran with a preload that rejects attempts to enable them. A simulated eligibility result reporting mutationsFlagEnabled:true is a classification defect, not an enabled configuration flag.
- Real AWS credential resolution was confined to a separate read-only process. An explicit SDK command whitelist allowed only GetCallerIdentity and EC2/RDS Describe commands. **Zero AWS mutation SDK commands were called.** No resources were created, started, stopped, deleted or scaled in AWS; no billing/CloudWatch paid-data APIs were requested. No paid resources were created.
- Docker Desktop CLI is installed, but its local desktop-linux pipe is unavailable. kubectl is installed with no current context; kind/minikube are absent. Docker Desktop was not started, no cluster was installed, and no existing local containers could be auto-started as a side effect. No real Docker/Kubernetes mutation, volume deletion, PVC deletion or production-infrastructure mutation occurred.
- Synthetic operation transitions and injected provider responses are labelled below. They change only the owned validation database. No original database was restored over; recovery used an initially empty disposable target.

## Results at a glance

| Validation | Measured result | Classification |
|---|---|---|
| Selected existing tests | **196/196 pass**, zero failures/skips in this selection | Fresh isolated database; SDK/provider fixtures where specified by each test |
| Independent lifecycle/security/scheduling/failure assertions | **19 pass, 18 fail across 37 checks** | Actual HTTP/services/database, plus explicitly injected provider failures |
| Real AWS identity/discovery | STS succeeds; ap-south-1 returns **1 EC2, 1 EBS, 1 address, 1 RDS** | **VERIFIED, read-only** |
| AWS pagination/throttling | Real SDK retry/parser over an injected transport: initial RequestLimitExceeded, successful first page, second-page token; 2 resources from 3 attempts | **VERIFIED with fixture limits**, not a real AWS throttle event |
| AWS lifecycle dispatch | Start/stop guard rejects before any injected SDK send; all mutation traps remain empty | **VERIFIED disabled-policy behavior**; positive AWS mutations intentionally untested |
| Docker lifecycle | Daemon unreachable; real start/stop/restart, physical volume and graceful-shutdown tests not performed | **NOT VERIFIED**; inventory error handling defect N16 |
| Kubernetes lifecycle | No isolated cluster; system/PVC/StatefulSet predicates tested on typed fixtures, discovered-type gap reproduced | **NOT VERIFIED physically**; N08/N09 block operational confidence |
| Scheduling | Asia/Kolkata storage/Intl conversion, pause/resume and repeated missed-run detection work; execution/claims/recovery absent | **FAILED / unsupported execution**, N07/N10/N14 |
| Real logical recovery | Windows backup/restore scripts restore **295 rows, 74 tables**, every per-table SHA-256 matches; archive **400314 bytes** | **VERIFIED for isolated logical data recovery** |
| Real PostgreSQL outage | Liveness 200, readiness 503, authenticated inventory 503, emergency state fail-closed; restart returns readiness/inventory 200 | **VERIFIED connection failure/recovery** |
| Actual backend crash | Process killed during simulated dispatch; fresh full server startup retains executing, replacement request 409 | **FAILED**, N11 |
| Archival PITR | archive_mode=off, archive_command disabled, archived_count=0; no base-backup/archive/target-time restore | **NOT VERIFIED** |

The 37 independent checks count each primary finding once. The additional N09 HTTP execution reproduction confirms its contract-level failure and is not counted again. Logical recovery and the actual PostgreSQL outage are separate protocols. Phase 23M’s prior results are historical context and are not included in these fresh counts.

### Existing test suites

| Existing suite | Passed / counted |
|---|---|
| backend | 60/60 |
| cloudLifecycle | 15/15 |
| awsReadOnlyDiscovery | 13/13 |
| driftDetectionReconciliation | 17/17 |
| realInfrastructureIntegrations | 17/17 |
| liveObservabilityIncidentIntelligence | 17/17 |
| autonomousSreIntelligence | 17/17 |
| enterpriseProductionHardening | 10/10 |
| enterpriseIntegrations | 15/15 |
| runbooks | 15/15 |

The full default backend test-file set is included in the 60 core tests above. The root aggregate and legacy AWS EC2/Docker/Kubernetes positive mutation suites were not invoked: they force mutation flags on, which is outside this run’s permitted environment. Successful fixture tests do not validate real provider execution, scheduler recovery or the new adversarial cases. An initial Windows --import path-URL harness error was corrected; the initial logs remain in `.harness-initial` files and are not counted as application failures.

## AWS discovery and governance

Real STS resolved the configured principal, with masked identity recorded in [aws-live-readonly.json](../reports/phase23n/aws-live-readonly.json). The returned ARN identifies a **root principal**, not a validated least-privileged application role. No IAM permissions or credentials were changed. Before production use, the role/credential model requires a separate least-privilege review. Full account/resource identifiers and secrets were not printed or persisted in this phase’s AWS evidence.

Read-only discovery succeeded for all four requested inventory classes in ap-south-1. The live account result was one page per API, so pagination and throttling were independently exercised through the real SDK with injected wire responses. All real and fixture calls were Describe/Get operations. No real AWS timeout or throttling incident was induced. Injected timeout behavior was exercised at identity and resource discovery; complete resource discovery failure is incorrectly successful (N13).

Allowlist rejection, a configured synthetic allowlist match, production tags, control-plane tags and the disabled mutation flag were evaluated independently through the predicate fields. Self-approval, missing explicit live confirmation and the shared kill switch deny execution. The positive allowlist test left the mutation flag false. Missing actual non-production tags expose N17. Costs are returned with a simulated/estimate disclaimer and “Not an official AWS invoice”; free-tier status is “Not verified.” Actual billing, credit balances, tariff accuracy and realized savings were not verified.

Normal disjoint-ID simulation/live inventory preservation passes the existing test. The same-ID collision case overwrites classification (N12). The public dryRunOverride, lifecycle row integrity, same-operation concurrency and expiration gaps remain N01–N04. Positive AWS lifecycle execution was neither attempted nor inferred to be safe.

## Docker and Kubernetes

The environment probe found Docker context desktop-linux, a local named-pipe endpoint, and a missing daemon pipe. An actual Docker container health call returns unreachable; discovery still presents cached inventory as success (N16). No container or volume was created, stopped or removed. The PostgreSQL named-volume predicate blocks a synthetic protected database workload, but **physical PostgreSQL volume preservation and container recovery are NOT VERIFIED**.

There is no current Kubernetes context or reachable isolated local cluster. Typed system namespace, StatefulSet and PVC safety fixtures are denied. Actual deployment discovery, scale-to-zero/up, rollout failure, StatefulSet/PVC retention and namespace enforcement against a live cluster remain unverified. Source/runtime probes reveal that the stock lifecycle Kubernetes class supplies default healthy/complete results without a cluster (N08).

The actual integration normalizer, supplied an injected StatefulSet snapshot, emits a resource not recognized by those lifecycle safeguards. HTTP approval/execution then returns simulated success and stores scaled_down despite all mutation flags false (N09). **No Kubernetes workload was actually scaled.** This false transition is an operational defect and cannot be counted as a successful real infrastructure test.

## Scheduling and process recovery

Asia/Kolkata persists, and 14:30 UTC formats as 20:00 in that zone. Pausing excludes the schedule from missed-run detection; resuming restores detection. Those are metadata/evaluation checks. Invalid timezone/time/cron are accepted, new schedules have no next-run calculation, and PATCH ignores weekday/time edits.

A manually overdue schedule is detected repeatedly as QUEUED_FOR_EVALUATION. The actual backend/src/worker.js notification worker was started, allowed a polling interval, stopped and restarted, and allowed another interval. No cloud operation was created, last_run_at remained null, and the same missed item was still detected. There is no wired lifecycle scheduling consumer. Durable duplicate schedule dispatch, restart recovery and catch-up execution are therefore **unsupported and unverified**, not passing scenarios. No enabled schedule referenced a live-marked resource, including alternate is_live_k8s/is_live_docker metadata.

A separate full server.js backend was paused inside an injected simulated provider after storing executing, then killed. Its replacement starts successfully, but the operation stays executing and blocks another request. The final follow-up recorded the same status after **391 seconds**. Database/resource locks for distinct operation rows pass; replay of the same row and interrupted-operation recovery do not.

## Security and audit results

Passing fresh checks cover anonymous denial, viewer write denial, responder approval/kill-switch restrictions, two-tenant inventory filtering, foreign operation-ID execution denial, tenant query override denial and direct RLS-scoped reads. Known foreign IDs produce no owner data, though some cloud lookup errors use HTTP 500 rather than 404. Remediation-plan canonical tampering and immutable SQL update guards from Phase 23M still pass. These protections apply to that separate plan model; cloud lifecycle operation binding fails N02.

Structured lifecycle audit attribution/details fail N05. Integration HTTP credentials are masked, but the common audit redaction helper fails the synthetic ingestion-key probe (N15). Actual credentials were not used in that test. Tenant data reads are isolated; global lifecycle idempotency uniqueness creates cross-tenant interference (N18). No claim of complete RBAC/security certification follows from the passing subset.

## Failure-injection and recovery matrix

| Scenario | Injection / observation | Result |
|---|---|---|
| AWS API timeout | Fake client TimeoutError at STS and each resource Describe API | STS disconnected correctly; all-Describe failure reports success, N13 |
| AWS throttling | Real SDK, injected HTTP 503 RequestLimitExceeded then XML pages | Retry/token traversal pass; zero external requests from fixture |
| Docker daemon unavailable | Actual local named pipe absent | Health unreachable; inventory masks outage, N16 |
| Kubernetes API unavailable | Actual loopback connection refusal in integration provider | Failure propagates; stock lifecycle health stubs separately fail N08 |
| PostgreSQL unavailable | Actual fast shutdown of owned 5543 cluster | Readiness/read requests 503, liveness 200, kill switch fails closed; connection recovery passes |
| Backend restart during operation | Actual disposable full backend killed during simulated provider dispatch | Orphan executing state remains, N11 |
| Worker restart / missed schedule | Actual notification worker restarted twice around overdue fixture | No scheduler consumer/operation; N10 |
| Partial lifecycle execution | Simulated provider returns explicit failure/partial state | Recorded as completed and overall success, N06 |
| Approval expiration | approved_at backdated 30 days | No lifecycle expiry mechanism; N04 |
| Duplicate execution | Two concurrent service executions of same approved row | Two simulated dispatches; N03 |
| Distinct-operation resource conflict | Independent operation rows target same resource | Database uniqueness rejects the second executing claim |
| Database logical restore | Actual repository Windows scripts, initially empty owned target | Matching 74 table hashes / 295 rows |
| Archived-WAL point-in-time restore | Settings inspected, no archive chain available | NOT VERIFIED |

The logical backup protocol used an explicit host/port/source and a new disposable restore database. The restore script’s --clean --if-exists operated only on that initially empty target. Source/original databases were not overwritten. Production RPO/RTO, large-database recovery, corruption, lost-host recovery, encrypted archive management, cross-region failover, POSIX scripts and Docker fallback branches remain untested. Internal WAL needed for normal database operation is not evidence of archival PITR.

## Open defect register

All entries below remain **OPEN**. This phase did not remediate them.

| ID | Severity | Remaining defect and actual reproduction | Source | Evidence |
|---|---|---|---|---|
| N01 | P0 | **Client-controlled approval bypass.** A responder POSTed an unapproved operation with dryRunOverride:true. HTTP 200, completed operation and simulated resource state changed to running. The override is accepted by the public controller and skips approval in executeOperation. Live AWS remains blocked by its disabled feature flag; no live exploit was attempted. | [lifecycle.service.js:287](../backend/src/services/cloud-lifecycle/services/lifecycle.service.js#L287) | [N01-approval-bypass.json](../reports/phase23n/N01-approval-bypass.json) |
| N02 | P0 | **Approved lifecycle contents are not bound.** After second-person approval, SQL changed the operation target and action from start(A) to stop(B). No immutable-row/hash guard rejected the edit, and HTTP execution completed against B. This is an isolated stored-row tampering test, not evidence of a public SQL injection vulnerability. | [lifecycle.service.js:238](../backend/src/services/cloud-lifecycle/services/lifecycle.service.js#L238) | [N02-plan-binding.json](../reports/phase23n/N02-plan-binding.json) |
| N03 | P0 | **Same-operation concurrent replay dispatches twice.** Two concurrent service invocations read the same approved operation, both dispatch the simulated provider, and both complete. Measured dispatch count: 2. Resource uniqueness protects different operation rows but does not make the status transition an atomic claim of the same row. | [cloudLifecycle.repository.js:176](../backend/src/repositories/cloudLifecycle.repository.js#L176) | [N03-concurrent-operation.json](../reports/phase23n/N03-concurrent-operation.json) |
| N04 | P1 | **Lifecycle approval expiration is unsupported.** An approval backdated 30 days executes successfully. Cloud lifecycle operations have approved_at but no expiry field/check. Thirty days is the probe age, not an existing documented TTL policy. The requested expiry control is absent and needs a defined policy. | [lifecycle.service.js:284](../backend/src/services/cloud-lifecycle/services/lifecycle.service.js#L284) | [N04-expired-approval.json](../reports/phase23n/N04-expired-approval.json) |
| N05 | P1 | **Lifecycle audit loses structured attribution.** Operation request audit rows have null actor_email/actor_role and empty metadata. Lifecycle services send userId/userEmail/details; the common audit service expects actor/metadata. Execution-log prose does not repair these missing structured audit fields. | [audit.service.js:62](../backend/src/services/audit.service.js#L62) | [N05-audit-attribution.json](../reports/phase23n/N05-audit-attribution.json) |
| N06 | P1 | **Partial execution is falsely completed.** An injected simulated provider returns success:false, partialTransition:true and state starting. The orchestrator returns overall success:true and persists status completed. Live provider branches use the same unchecked-result pattern; no live partial transition was induced. | [lifecycle.service.js:379](../backend/src/services/cloud-lifecycle/services/lifecycle.service.js#L379) | [N06-partial-execution.json](../reports/phase23n/N06-partial-execution.json) |
| N07 | P1 | **Scheduling accepts invalid input and does not compute due time.** The API accepts timezone Mars/Olympus, time 99:99 and an invalid cron string with HTTP 201. A valid new schedule also has next_run_at:null. Asia/Kolkata is stored and formats correctly, but actual due-time calculation is not established. | [schedule.service.js:32](../backend/src/services/cloud-lifecycle/services/schedule.service.js#L32) | [N07-scheduling-validation.json](../reports/phase23n/N07-scheduling-validation.json), [scheduling-evaluation.json](../reports/phase23n/scheduling-evaluation.json) |
| N08 | P1 | **Stock Kubernetes health and rollout report invented success.** Without a local cluster/client, a nonexistent workload returns healthy pod data through the HTTP health endpoint, and getRolloutStatus returns success:true/complete. The stock lifecycle class contains default stubs rather than a real cluster transport and rollout verification. | [kubernetesLifecycle.provider.js:172](../backend/src/services/cloud-lifecycle/providers/kubernetesLifecycle.provider.js#L172) | [N08-kubernetes-stub.json](../reports/phase23n/N08-kubernetes-stub.json) |
| N09 | P0 | **Discovery/lifecycle contract loses live and StatefulSet protections.** Kubernetes normalization emits resource_type:statefulset and metadata.is_live_k8s:true; lifecycle guards expect k8s_statefulset and is_live:true. The emitted resource is declared eligible despite disabled K8s mutations. An approved HTTP scale-to-zero returns 200 through the simulated adapter and changes stored state to scaled_down without confirmation or real cluster mutation. Docker discovery also lacks the lifecycle is_live marker. | [KubernetesProvider.js:300](../backend/src/integrations/providers/kubernetes/KubernetesProvider.js#L300) | [N09-discovery-classification.json](../reports/phase23n/N09-discovery-classification.json), [N09-classification-http-execution.json](../reports/phase23n/N09-classification-http-execution.json) |
| N10 | P1 | **Cloud scheduler execution/recovery is not implemented.** Missed-run detection twice returns QUEUED_FOR_EVALUATION, but creates no job/operation and does not advance last_run_at. Starting/restarting the actual notification worker across two polling intervals creates zero cloud operations. No lifecycle schedule consumer is wired in server/worker startup; duplicate job execution and recovery cannot be verified. | [schedule.service.js:107](../backend/src/services/cloud-lifecycle/services/schedule.service.js#L107) | [N10-scheduler-worker-restart.json](../reports/phase23n/N10-scheduler-worker-restart.json) |
| N11 | P0 | **Backend crash leaves a permanent active claim without recovery.** A disposable full server.js process was killed after the injected simulated provider was entered and executing was stored. A fresh full backend startup leaves executing unchanged and a replacement request gets 409. Follow-up still found executing 391 seconds after dispatch. No lease/reconciliation path was found. | [lifecycle.service.js:354](../backend/src/services/cloud-lifecycle/services/lifecycle.service.js#L354) | [N11-backend-crash.json](../reports/phase23n/N11-backend-crash.json), [preservation-final.json](../reports/phase23n/preservation-final.json) |
| N12 | P1 | **Same-ID live discovery overwrites a simulation.** A simulated AWS inventory fixture and injected discovered resource share one ID. Synchronization overwrites metadata.is_simulated:true with live classification. Normal disjoint-ID preservation passes the existing suite; the collision case is unguarded. Only a synthetic inventory row was overwritten. | [awsDiscovery.service.js:97](../backend/src/services/cloud-lifecycle/services/awsDiscovery.service.js#L97) | [N12-live-sim-collision.json](../reports/phase23n/N12-live-sim-collision.json) |
| N13 | P1 | **Complete AWS discovery failure is reported as success.** Injected timeouts for every resource Describe API leave four errors and zero resources, while discoverAll returns success:true. Synchronization source records success when this flag is true and does not propagate the per-service errors. This failure injection used fake clients, not an actual AWS outage. | [awsReadOnly.provider.js:526](../backend/src/services/cloud-lifecycle/providers/awsReadOnly.provider.js#L526) | [N13-discovery-failure.json](../reports/phase23n/N13-discovery-failure.json) |
| N14 | P2 | **Schedule edit returns 200 but ignores time/weekdays.** PATCH requested 10:15 and weekend days. The response and stored row retain 20:00 and weekdays. Repository updateSchedule handles enabled, pause and last/next-run timestamps but ignores the fields passed by the controller. | [cloudLifecycle.repository.js:268](../backend/src/repositories/cloudLifecycle.repository.js#L268) | [N14-schedule-update.json](../reports/phase23n/N14-schedule-update.json) |
| N15 | P1 | **Audit redaction misses ingestion credentials.** The common audit helper stores a synthetic ingestionKey unchanged in metadata; accessKeyId is also not matched by its sensitive-key list. Integration HTTP credential responses pass masking checks. No real credential was supplied to this redaction probe or exposed in the report. | [audit.service.js:11](../backend/src/services/audit.service.js#L11) | [N15-audit-redaction.json](../reports/phase23n/N15-audit-redaction.json) |
| N16 | P2 | **Docker discovery masks daemon failure as stored inventory success.** The actual local daemon is unavailable. The inventory endpoint nevertheless returns HTTP 200/success:true, cached database rows and empty composeServices without daemon/source status; listComposeServices swallows the connection failure. The separate per-container health endpoint correctly reports unreachable. | [dockerLifecycle.provider.js:212](../backend/src/services/cloud-lifecycle/providers/dockerLifecycle.provider.js#L212) | [N16-docker-unavailable.json](../reports/phase23n/N16-docker-unavailable.json), [environment.json](../reports/phase23n/environment.json) |
| N17 | P1 | **Inventory environment substitutes for required AWS tag.** A live-marked synthetic EC2 resource with environment staging and no AWS tags passes checks.isNonProduction. The feature flag still blocks mutation. The tag predicate accepts inventory environment OR tag instead of requiring a verified approved cloud tag. | [ec2Eligibility.service.js:85](../backend/src/services/cloud-lifecycle/services/ec2Eligibility.service.js#L85) | [N17-nonprod-tag.json](../reports/phase23n/N17-nonprod-tag.json) |
| N18 | P1 | **Cloud idempotency uniqueness crosses tenant boundaries.** Tenant A creates a request using a key; tenant B requests its own independent resource with the same key and gets 409. The lifecycle idempotency_key constraint is global. RLS prevents data reads across tenants, but this key collision interferes with another tenant’s workflow. | [cloudLifecycle.repository.js:108](../backend/src/repositories/cloudLifecycle.repository.js#L108) | [N18-tenant-idempotency.json](../reports/phase23n/N18-tenant-idempotency.json) |

## Evidence, reproducibility and completion

- [summary.json](../reports/phase23n/summary.json), [runtime-results.json](../reports/phase23n/runtime-results.json), [provider-results.json](../reports/phase23n/provider-results.json), [security-extra-results.json](../reports/phase23n/security-extra-results.json), [restart-results.json](../reports/phase23n/restart-results.json), [suite-results.json](../reports/phase23n/suite-results.json) and suite TAP logs contain the current results. Independent assertion scripts intentionally return nonzero for the failed required behavior; those failures must not be reclassified as passing tests.
- [aws-live-readonly.json](../reports/phase23n/aws-live-readonly.json), [environment.json](../reports/phase23n/environment.json), [source-evidence.json](../reports/phase23n/source-evidence.json), [recovery-results.json](../reports/phase23n/recovery-results.json), [database-outage.json](../reports/phase23n/database-outage.json), [preservation-final.json](../reports/phase23n/preservation-final.json) and [cleanup.json](../reports/phase23n/cleanup.json) provide real-environment, source-line, recovery and safety evidence.
- Harnesses are under [tests/runtime-validation](../tests/runtime-validation/), named phase23n*.mjs. Command details are in [commands.jsonl](../reports/phase23n/commands.jsonl). Initialization refuses to overwrite an existing cluster/state. SDK wire-fixture retries use synthetic credentials and do not reach AWS. The 5031 backend crash uses an injected simulated provider and the full application server startup path.
- Both environment file hashes match the starting snapshot. Pre-existing application/test/document files have zero content changes, no starting file is missing, and staged state is unchanged. Phase 23N services and its cluster are stopped; its databases and archive are retained for inspection. No application fix, Git write operation, live AWS mutation or real Docker/Kubernetes mutation was performed.

**Release gate remains closed.** The five P0 findings, other governance/scheduler defects, real local-provider execution gaps and archival recovery gaps require resolution and fresh validation before a production-readiness decision can be positive.
