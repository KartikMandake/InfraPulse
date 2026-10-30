/**
 * Initial Catalog of Remediation and Diagnostic Runbooks
 *
 * Each runbook defines:
 * - Unique ID, title, description
 * - Risk level: low | medium | high | critical
 * - Execution mode: diagnostic | remediation
 * - Supported incident types
 * - Applicable services
 * - Preconditions
 * - Ordered execution steps with allowlisted adapter actions
 * - Expected outcome & verification procedure
 * - Rollback / compensation procedure
 * - Required approval role
 */

export const INITIAL_RUNBOOKS = [
  {
    id: 'RB-LATENCY-01',
    title: 'High API Latency Diagnostic & Investigation',
    description: 'Systematic read-only evaluation of container resource metrics, p99 distribution, and upstream/downstream dependency latency to pinpoint the delay origin.',
    riskLevel: 'low',
    executionMode: 'diagnostic',
    supportedIncidentTypes: ['latency_spike', 'high_request_latency', 'p99_latency_anomaly', 'slow_queries'],
    applicableServices: ['*'],
    preconditions: [
      'Target service is registered in topology',
      'Target service telemetry stream is active'
    ],
    expectedOutcome: 'Isolated latency bottleneck identifying whether contention is compute, database, or network bound.',
    verificationProcedure: 'Verify telemetry adapter retrieves valid latency percentiles without timeouts.',
    rollbackProcedure: null,
    requiredApprovalRole: 'responder',
    version: 1,
    steps: [
      {
        stepNumber: 1,
        name: 'Inspect Service Health and CPU/Memory Saturation',
        description: 'Read current CPU and memory consumption to detect throttling or saturation.',
        adapterAction: 'inspect_service_health',
        isRemediation: false,
        parameters: { checkMetrics: ['cpuPercent', 'memoryPercent', 'podCount'] }
      },
      {
        stepNumber: 2,
        name: 'Evaluate P99 Latency Curve Against Historical Baseline',
        description: 'Compare observed P99 latency against baseline threshold to gauge deviation magnitude.',
        adapterAction: 'read_service_metrics',
        isRemediation: false,
        parameters: { metric: 'latencyP99', threshold: 200 }
      },
      {
        stepNumber: 3,
        name: 'Verify Downstream Dependency Health',
        description: 'Trace RPC calls to upstream callers and downstream callees for stalled connections.',
        adapterAction: 'verify_dependency_status',
        isRemediation: false,
        parameters: { checkDeep: true }
      }
    ]
  },
  {
    id: 'RB-5XX-01',
    title: 'HTTP 5xx Server Error Surge Investigation',
    description: 'Non-invasive diagnostic procedure to extract recent HTTP 5xx stack traces, isolate failure domain, and check caller propagation.',
    riskLevel: 'low',
    executionMode: 'diagnostic',
    supportedIncidentTypes: ['5xx_errors', 'high_error_rate', 'elevated_5xx_rate', 'gateway_errors'],
    applicableServices: ['*'],
    preconditions: [
      'Target service exists in cluster registry',
      'Log collection daemon is reachable'
    ],
    expectedOutcome: 'Identified root cause exception class and determined whether failures are internal or inherited.',
    verificationProcedure: 'Confirm error log entries are parsed and categorized by HTTP status code.',
    rollbackProcedure: null,
    requiredApprovalRole: 'responder',
    version: 1,
    steps: [
      {
        stepNumber: 1,
        name: 'Measure Current Error Rate and Throughput',
        description: 'Query telemetry adapter for real-time error percentage and request volume.',
        adapterAction: 'read_service_metrics',
        isRemediation: false,
        parameters: { metric: 'errorRate', threshold: 2.0 }
      },
      {
        stepNumber: 2,
        name: 'Inspect Recent Application Error Logs',
        description: 'Fetch last 50 error-level log lines to identify uncaught exceptions and panics.',
        adapterAction: 'inspect_recent_logs',
        isRemediation: false,
        parameters: { level: 'error', limit: 50 }
      },
      {
        stepNumber: 3,
        name: 'Check Downstream Callee Error Propagation',
        description: 'Verify if 5xx errors correlate with downstream database proxy or payment gateway failures.',
        adapterAction: 'verify_dependency_status',
        isRemediation: false,
        parameters: { checkDeep: false }
      }
    ]
  },
  {
    id: 'RB-DB-01',
    title: 'Database Connection Pool Exhaustion Mitigation',
    description: 'Controlled remediation to inspect HikariCP / DB pool saturation, simulate expanding active pool ceiling, and verify connection acquisition drop.',
    riskLevel: 'medium',
    executionMode: 'remediation',
    supportedIncidentTypes: ['connection_pool_saturation', 'db_exhaustion', 'pool_lock_timeout', 'hikari_starvation'],
    applicableServices: ['payment-service', 'ledger-db-proxy', '*'],
    preconditions: [
      'Target service connects to a PostgreSQL or Proxy database',
      'Database connection pool metric is reporting > 85% utilization',
      'Lead SRE / Responder approval granted'
    ],
    expectedOutcome: 'Active pool ceiling expanded from 100 to 180 connections; connection wait times restored to < 5ms.',
    verificationProcedure: 'Verify through simulated health adapter that pool utilization drops below 60% and connection timeouts cease.',
    rollbackProcedure: 'Revert pool size configuration parameter to original value (100) if downstream proxy latency worsens.',
    requiredApprovalRole: 'responder',
    version: 1,
    steps: [
      {
        stepNumber: 1,
        name: 'Inspect Pool Saturation and Active Wait Queues',
        description: 'Read current connection pool utilization and pending acquisition lock count.',
        adapterAction: 'inspect_service_health',
        isRemediation: false,
        parameters: { resource: 'connectionPool' }
      },
      {
        stepNumber: 2,
        name: 'Simulate Expanding Maximum Pool Size to 180',
        description: 'Simulate updating container connection pool ceiling to 180 with graceful socket reallocation.',
        adapterAction: 'simulate_service_scale',
        isRemediation: true,
        parameters: { maxPoolSize: 180, scaleTarget: 'connection_pool' },
        compensationAction: {
          action: 'simulate_service_scale',
          parameters: { maxPoolSize: 100, scaleTarget: 'connection_pool' }
        }
      },
      {
        stepNumber: 3,
        name: 'Verify Database Acquisition Recovery',
        description: 'Confirm thread wait times drop and no new 504 gateway timeouts are logged.',
        adapterAction: 'verify_service_recovery',
        isRemediation: false,
        parameters: { expectedMetric: 'latencyP99', maxAcceptable: 50 }
      }
    ]
  },
  {
    id: 'RB-RESTART-01',
    title: 'Graceful Rolling Service Restart Remediation',
    description: 'Controlled remediation procedure to gracefully restart degraded service containers while maintaining availability and monitoring readiness probes.',
    riskLevel: 'medium',
    executionMode: 'remediation',
    supportedIncidentTypes: ['health_failure', 'service_critical', 'crash_loop', 'memory_leak'],
    applicableServices: ['*'],
    preconditions: [
      'Target service replica count >= 1',
      'Kubernetes readiness probes are configured',
      'Explicit Responder or Admin approval confirmed'
    ],
    expectedOutcome: 'Degraded pods terminated gracefully; newly spawned pods pass readiness checks and resume traffic.',
    verificationProcedure: 'Verify service status transitions from critical to nominal on the service topology.',
    rollbackProcedure: 'If replacement pods fail readiness checks, notify on-call emergency escalation and preserve crash dumps.',
    requiredApprovalRole: 'responder',
    version: 1,
    steps: [
      {
        stepNumber: 1,
        name: 'Confirm Target Service Degraded State',
        description: 'Validate probe failure counts and memory consumption before initiating restart.',
        adapterAction: 'inspect_service_health',
        isRemediation: false,
        parameters: { verifyUnhealthy: true }
      },
      {
        stepNumber: 2,
        name: 'Execute Simulated Rolling Pod Restart',
        description: 'Simulate zero-downtime rolling restart across deployment replicas.',
        adapterAction: 'simulate_service_restart',
        isRemediation: true,
        parameters: { rollingDelayMs: 200 },
        compensationAction: {
          action: 'inspect_recent_logs',
          parameters: { level: 'critical', limit: 20 }
        }
      },
      {
        stepNumber: 3,
        name: 'Verify Container Readiness and Health Restoration',
        description: 'Poll readiness probe status until all pods report healthy state.',
        adapterAction: 'verify_service_recovery',
        isRemediation: false,
        parameters: { expectedStatus: 'nominal' }
      }
    ]
  },
  {
    id: 'RB-TIMEOUT-01',
    title: 'Downstream Dependency Timeout Diagnostic',
    description: 'Traces cascading timeouts through upstream callers and downstream callees to verify circuit breaker trip states and deadlocks.',
    riskLevel: 'low',
    executionMode: 'diagnostic',
    supportedIncidentTypes: ['dependency_timeout', 'downstream_timeout', 'gateway_timeout', 'circuit_breaker_open'],
    applicableServices: ['*'],
    preconditions: [
      'Distributed tracing spans are enabled',
      'Target service has at least one dependency declared'
    ],
    expectedOutcome: 'Pinpointed exact stalled RPC boundary and identified whether circuit breaker has opened.',
    verificationProcedure: 'Trace waterfall span duration confirmed and mapped against dependency graph.',
    rollbackProcedure: null,
    requiredApprovalRole: 'responder',
    version: 1,
    steps: [
      {
        stepNumber: 1,
        name: 'Verify Callee RPC Latencies and Response Codes',
        description: 'Check outgoing HTTP/gRPC client latencies for all declared service dependencies.',
        adapterAction: 'verify_dependency_status',
        isRemediation: false,
        parameters: { measureOutbound: true }
      },
      {
        stepNumber: 2,
        name: 'Scan Client Socket Error Logs',
        description: 'Search for connection timeout, broken pipe, or DNS resolution failure signatures.',
        adapterAction: 'inspect_recent_logs',
        isRemediation: false,
        parameters: { keywords: ['timeout', 'ECONNRESET', 'ETIMEDOUT'] }
      },
      {
        stepNumber: 3,
        name: 'Evaluate Caller Timeout Budget Depletion',
        description: 'Confirm whether upstream callers (e.g. api-gateway or checkout) are exceeding total request deadline.',
        adapterAction: 'read_service_metrics',
        isRemediation: false,
        parameters: { metric: 'latencyP99', threshold: 300 }
      }
    ]
  },
  {
    id: 'RB-ROLLBACK-01',
    title: 'High-Risk Canary Rollback & Deployment Depromotion',
    description: 'High-risk automated remediation to instantly depromote a regressed canary release (e.g. v1.8.3), shift 100% of traffic back to stable baseline (v1.8.2), and verify error rate restoration.',
    riskLevel: 'high',
    executionMode: 'remediation',
    supportedIncidentTypes: ['deployment_regression', 'canary_failure', 'bad_release', 'post_deploy_anomaly'],
    applicableServices: ['payment-service', 'checkout-api', 'auth-gateway-v2', '*'],
    preconditions: [
      'Incident is correlated with a recent deployment (ACA score < 70 or error spike)',
      'Previous stable deployment artifact is available in registry',
      'Admin role approval AND secondary confirmation confirmed'
    ],
    expectedOutcome: 'Canary traffic drained to 0%; stable baseline restored; p99 latency restored to nominal (<50ms).',
    verificationProcedure: 'Verify telemetry adapter reports canary traffic == 0% and p99 latency restored to nominal baseline.',
    rollbackProcedure: 'Re-enable previous revision traffic routing if depromotion causes unexpected database schema mismatches.',
    requiredApprovalRole: 'admin',
    version: 1,
    steps: [
      {
        stepNumber: 1,
        name: 'Verify Canary Error Spike & Correlated Commit Diff',
        description: 'Inspect canary pod error rate vs stable pod baseline to confirm regression locus.',
        adapterAction: 'inspect_recent_logs',
        isRemediation: false,
        parameters: { filter: 'canary' }
      },
      {
        stepNumber: 2,
        name: 'Simulate Instant Canary Depromotion to Stable v1.8.2',
        description: 'Simulate Argo Rollouts undo / traffic drain to instantly revert 10% canary traffic to stable.',
        adapterAction: 'simulate_canary_depromote',
        isRemediation: true,
        parameters: { targetRevision: 'stable', drainTimeoutSec: 10 },
        compensationAction: {
          action: 'simulate_canary_depromote',
          parameters: { targetRevision: 'freeze_rollout' }
        }
      },
      {
        stepNumber: 3,
        name: 'Verify Post-Rollback Latency & SLO Restoration',
        description: 'Confirm p99 latency drops below 50ms and error budget burn rate returns to 0.',
        adapterAction: 'verify_service_recovery',
        isRemediation: false,
        parameters: { expectedMetric: 'latencyP99', maxAcceptable: 50, expectedStatus: 'nominal' }
      }
    ]
  }
];

