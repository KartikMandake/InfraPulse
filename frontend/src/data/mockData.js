import { initialServices } from '../../../backend/src/data/services.js';
import { initialIncidents } from '../../../backend/src/data/incidents.js';
import { initialAlerts } from '../../../backend/src/data/alerts.js';
import { initialDeployments } from '../../../backend/src/data/deployments.js';
import { initialLogs, initialTraces } from '../../../backend/src/data/telemetry.js';

export const INITIAL_SERVICES = initialServices;
export const INITIAL_INCIDENTS = initialIncidents;
export const INITIAL_ALERTS = initialAlerts;
export const INITIAL_DEPLOYMENTS = initialDeployments;
export const INITIAL_TRACES = initialTraces;
export const INITIAL_TELEMETRY_LOGS = initialLogs;

export const INITIAL_SLOS = [
  {
    id: 'slo-01',
    name: 'Order Checkout Latency (< 150ms)',
    serviceId: 'checkout-api',
    serviceName: 'checkout-api',
    targetPercent: 99.90,
    currentPercent: 95.88,
    budgetRemainingPercent: 0,
    burnRateMultiplier: 14.4,
    windowDays: 30,
    status: 'breached',
    totalRequests: '48.2M',
    sliDefinition: 'Successful HTTP POST /orders completed with latency <= 150ms'
  },
  {
    id: 'slo-02',
    name: 'Payment Authorization Success Rate',
    serviceId: 'payment-service',
    serviceName: 'payment-service',
    targetPercent: 99.95,
    currentPercent: 96.12,
    budgetRemainingPercent: 0,
    burnRateMultiplier: 12.8,
    windowDays: 30,
    status: 'breached',
    totalRequests: '14.8M',
    sliDefinition: 'Successful gRPC AuthorizePaymentCharge responses excluding client 4xx errors'
  },
  {
    id: 'slo-03',
    name: 'OAuth Token Introspection Latency (< 25ms)',
    serviceId: 'auth-gateway-v2',
    serviceName: 'auth-gateway-v2',
    targetPercent: 99.99,
    currentPercent: 99.10,
    budgetRemainingPercent: 42,
    burnRateMultiplier: 3.2,
    windowDays: 30,
    status: 'burn_warning',
    totalRequests: '182.4M',
    sliDefinition: 'HTTP GET /oauth/v2/introspect latency <= 25ms'
  },
  {
    id: 'slo-04',
    name: 'Inventory Stock Reservation Availability',
    serviceId: 'inventory-mesh',
    serviceName: 'inventory-mesh',
    targetPercent: 99.90,
    currentPercent: 99.98,
    budgetRemainingPercent: 92,
    burnRateMultiplier: 0.2,
    windowDays: 30,
    status: 'nominal',
    totalRequests: '24.1M',
    sliDefinition: 'Successful gRPC ReserveStock response code OK'
  }
];

export const INITIAL_RUNBOOKS = [
  {
    id: 'RB-402',
    title: 'Canary Depromotion & Traffic Draining',
    category: 'Mitigation',
    targetServiceId: 'payment-service',
    targetService: 'payment-service',
    description: 'Instant rollback of unhealthy canary pod instances, depromoting traffic back to baseline stable release.',
    estimatedMinutes: 2,
    isAutomated: true,
    steps: [
      { id: 1, title: 'Check Active Canary Traffic Ratio', command: 'argo rollouts get rollout payment-service-rollout -n payments-core', description: 'Validate if canary traffic exceeds 0%', status: 'idle' },
      { id: 2, title: 'Depromote Canary Pod Deployment', command: 'argo rollouts undo payment-service-rollout --to-revision=14', description: 'Drain connections from canary pod and shift traffic to stable v1.8.2', status: 'idle' },
      { id: 3, title: 'Verify P99 Latency & Error Rate Restoration', command: 'promql "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[2m])) by (le))"', description: 'Confirm P99 dropped below 50ms baseline', status: 'idle' },
    ],
    executionHistory: [
      { executedAt: '14:41:20 UTC', executedBy: 'Sarah Chen (Lead SRE)', status: 'success' }
    ]
  },
  {
    id: 'RB-209',
    title: 'PostgreSQL HikariCP Connection Pool Ceiling Bump',
    category: 'Scaling',
    targetServiceId: 'ledger-db-proxy',
    targetService: 'ledger-db-proxy',
    description: 'Dynamically scale maximum pool size in HikariCP and reload pgpool connection ceiling.',
    estimatedMinutes: 4,
    isAutomated: false,
    steps: [
      { id: 1, title: 'Inspect Active Lock Contention', command: 'psql -c "SELECT pid, query, wait_event_type, wait_event FROM pg_stat_activity WHERE state=\'active\';"', description: 'Identify unindexed blocking transactions', status: 'idle' },
      { id: 2, title: 'Patch Deployment Max Pool Size to 180', command: 'kubectl set env deployment/payment-service HIKARICP_MAX_POOL_SIZE=180 -n payments-core', description: 'Scale connection pool max limit from 100 to 180', status: 'idle' },
      { id: 3, title: 'Restart Ingress Proxies Gracefully', command: 'kubectl rollout restart deployment/ledger-db-proxy -n finance-data', description: 'Apply new connection parameters', status: 'idle' }
    ]
  },
  {
    id: 'RB-104',
    title: 'Kafka Partition Rebalance & Worker Scale Out',
    category: 'Mitigation',
    targetServiceId: 'notification-worker',
    targetService: 'notification-worker',
    description: 'Scale consumer replicas from 6 to 12 and trigger sticky partition reassignment to alleviate lag.',
    estimatedMinutes: 3,
    isAutomated: true,
    steps: [
      { id: 1, title: 'Check Consumer Lag on Topic checkout.orders', command: 'kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group analytics-worker', description: 'Verify offset distance', status: 'idle' },
      { id: 2, title: 'Scale Notification Worker Pods to 12', command: 'kubectl scale deployment notification-worker --replicas=12 -n messaging', description: 'Add 6 pods for parallel consumption', status: 'idle' },
      { id: 3, title: 'Trigger Partition Concurrency Resync', command: 'curl -X POST http://notification-worker:8080/admin/rebalance', description: 'Redistribute partitions evenly across workers', status: 'idle' }
    ]
  }
];

export const INITIAL_CHAOS_EXPERIMENTS = [
  {
    id: 'EXP-8842',
    title: 'Synthetic Aurora DB Connection Starvation',
    category: 'Connection Pool',
    targetServiceId: 'payment-service',
    targetService: 'payment-service',
    description: 'Inject artificial connection lock contention to evaluate whether InfraPulse automated canary analysis depromotes within 60 seconds.',
    status: 'idle',
    elapsedSeconds: 0,
    durationSeconds: 120,
    parameters: { maxPoolConnections: 100, latencyMs: 350 },
    accuracyScore: 98.4,
    aiAttributionTimeSec: 24,
    history: [
      { runAt: 'Yesterday 14:00', duration: '2m 14s', outcome: 'mitigated' }
    ]
  },
  {
    id: 'EXP-7719',
    title: 'Redis Cluster Shard Packet Drop & Jitter',
    category: 'Packet Loss',
    targetServiceId: 'auth-gateway-v2',
    targetService: 'auth-gateway-v2',
    description: 'Inject 15% random packet loss between auth gateway and Redis session cache to evaluate JWT JWKS token cache fallback resilience.',
    status: 'idle',
    elapsedSeconds: 0,
    durationSeconds: 180,
    parameters: { lossPercent: 15, latencyMs: 250 },
    accuracyScore: 94.2,
    aiAttributionTimeSec: 38,
    history: [
      { runAt: '3 days ago', duration: '3m 00s', outcome: 'mitigated' }
    ]
  },
  {
    id: 'EXP-6631',
    title: 'Ingress Mesh CPU Throttling Simulation',
    category: 'Memory Stress',
    targetServiceId: 'checkout-api',
    targetService: 'checkout-api',
    description: 'Constrain cgroups CPU quota to 20% to test downstream graceful degradation and retry backoff headers.',
    status: 'idle',
    elapsedSeconds: 0,
    durationSeconds: 90,
    parameters: { latencyMs: 400 },
    accuracyScore: 91.0,
    aiAttributionTimeSec: 45
  }
];

export const INITIAL_POSTMORTEMS = [
  {
    id: 'BENCH-PHASE11',
    incidentId: 'SYS-PERF-AUDIT',
    title: 'Phase 11 Benchmark & Reliability Audit: Performance & RCA Evaluation',
    author: 'Performance & Reliability Team',
    createdAt: '2026-10-30',
    impactDuration: 'Continuous Baseline',
    rootCause: 'System audit across 8 labeled RCA scenarios (71.4% Top-1, 85.7% Top-3 accuracy, 0% false positives, 100% insufficient evidence detection) and load testing (Core API: 782 RPS health, 410 RPS services, 389 RPS incidents, 356 RPS alerts at 0% error rate).',
    preventativeActions: [
      { id: 'OPT-01', description: 'Investigate JSONB decompression overhead on POST /api/incidents/:id/investigation/run (p99 542ms)', owner: 'Backend Engineering', status: 'open', priority: 'P1' },
      { id: 'OPT-02', description: 'Maintain isolated holdout scenario dataset to prevent scoring weight calibration overfitting', owner: 'RCA Core Team', status: 'completed', priority: 'P0' },
      { id: 'OPT-03', description: 'Enforce non-blocking notification dispatch worker and SKIP LOCKED queue semantics', owner: 'Reliability SRE', status: 'completed', priority: 'P0' }
    ]
  },
  {
    id: 'POST-4921',
    incidentId: 'INC-4921',
    title: 'Postmortem: Cascading 504 Gateway Timeouts in Payment Flow (Deploy v1.8.3)',
    author: 'Sarah Chen (Lead SRE)',
    createdAt: '2026-10-30',
    impactDuration: '42 minutes',
    rootCause: 'Canary deployment v1.8.3 introduced a new database transaction wrapping an external HTTP idempotency check, which held HikariCP connections open indefinitely during external network stalls. This exhausted all 100 connections in under 4 minutes.',
    preventativeActions: [
      { id: 'ACT-01', description: 'Decouple idempotency lock from database transaction boundary via Redis distributed lock', owner: 'Alex Ross', status: 'in_progress', priority: 'P0' },
      { id: 'ACT-02', description: 'Add automated canary analysis threshold for HikariCP connection wait time (>100ms triggers automatic rollback)', owner: 'Sarah Chen', status: 'completed', priority: 'P0' },
      { id: 'ACT-03', description: 'Implement circuit breaker pattern on payment-service client in checkout-api', owner: 'David Kim', status: 'open', priority: 'P1' }
    ]
  },
  {
    id: 'POST-4919',
    incidentId: 'INC-4919',
    title: 'Postmortem: Kafka Consumer Lag Breach on Analytics Worker',
    author: 'Marcus Vance (Staff SRE)',
    createdAt: '2026-10-29',
    impactDuration: '126 minutes',
    rootCause: 'Single SKU promotional burst overwhelmed partition 14, starving worker thread pool.',
    preventativeActions: [
      { id: 'ACT-04', description: 'Implement sticky partition hashing with dynamic partition splitting', owner: 'Marcus Vance', status: 'completed', priority: 'P0' },
      { id: 'ACT-05', description: 'Configure auto-scaling HPA based on Kafka lag metrics', owner: 'Elena Rostova', status: 'open', priority: 'P1' }
    ]
  }
];

export const INITIAL_INTEGRATIONS = [
  { id: 'int-otel', name: 'OpenTelemetry OTLP Collector', category: 'Telemetry Collection', status: 'connected', icon: 'hub', ingestRate: '1.84M spans/sec', lastSync: '2s ago' },
  { id: 'int-aws', name: 'AWS CloudWatch & EKS Telemetry', category: 'Cloud Provider', status: 'connected', icon: 'cloud', ingestRate: '420k metrics/sec', lastSync: '4s ago' },
  { id: 'int-prom', name: 'Prometheus Remote Write (Cortex)', category: 'Telemetry Collection', status: 'connected', icon: 'query_stats', ingestRate: '890k series', lastSync: '1s ago' },
  { id: 'int-pd', name: 'PagerDuty On-Call Escapes', category: 'Incident Alerts', status: 'connected', icon: 'notifications_active', ingestRate: 'Active On-Call: Tier-0 SRE', lastSync: 'Live Webhook' },
  { id: 'int-slack', name: 'Slack SRE War Room Automation', category: 'Incident Alerts', status: 'connected', icon: 'forum', ingestRate: '14 channels mapped', lastSync: 'Live Bot' },
  { id: 'int-github', name: 'GitHub CI/CD Deployment Marker', category: 'Tracing', status: 'connected', icon: 'deployed_code', ingestRate: 'Auto-sync PRs & Tags', lastSync: '35m ago' }
];

