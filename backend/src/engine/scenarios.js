import { initialServices } from '../data/services.js';
import { initialIncidents } from '../data/incidents.js';
import { initialAlerts } from '../data/alerts.js';
import { initialDeployments } from '../data/deployments.js';
import { initialLogs, initialTraces } from '../data/telemetry.js';

export const SCENARIO_1_DEPLOYMENT_REGRESSION = {
  id: 'scenario-1-deployment-regression',
  name: 'Scenario 1: Recent Deployment Regression',
  description: 'Canary deployment v1.8.3 on payment-service immediately followed by 504 Gateway Timeouts and DB pool saturation.',
  expectedTopCandidateId: 'payment-service',
  minExpectedScore: 75,
  incident: initialIncidents[0],
  services: initialServices,
  alerts: initialAlerts,
  deployments: initialDeployments,
  logs: initialLogs,
  traces: initialTraces
};

export const SCENARIO_2_DEPENDENCY_CASCADE = {
  id: 'scenario-2-dependency-cascade',
  name: 'Scenario 2: Dependency Failure Cascade',
  description: 'Downstream database proxy ledger-db-proxy experiences thread deadlock, causing cascading 504s in payment-service and checkout-api.',
  expectedTopCandidateId: 'ledger-db-proxy',
  minExpectedScore: 60,
  incident: {
    ...initialIncidents[0],
    id: 'INC-4922',
    title: 'Widespread Checkout Failure Cascade: Database Proxy Saturation',
    summary: 'Upstream services checkout-api and payment-service reporting gRPC DEADLINE_EXCEEDED when communicating with ledger-db-proxy.',
    serviceId: 'payment-service',
    startedAt: '15:10:00 UTC'
  },
  services: initialServices.map(s => {
    if (s.id === 'ledger-db-proxy') {
      return { ...s, status: 'critical', latencyP99: 980, latencyBaseline: 5, errorRate: 18.5, cpuPercent: 99.0 };
    }
    return s;
  }),
  alerts: [
    {
      id: 'ALT-CASCADE-01',
      title: 'Database Proxy Connection Pool Deadlock',
      severity: 'critical',
      state: 'firing',
      serviceId: 'ledger-db-proxy',
      serviceName: 'ledger-db-proxy',
      region: 'us-east-1',
      metric: 'pgpool.deadlocks_detected',
      threshold: '> 0',
      currentValue: '14 deadlocks/sec',
      firedAt: '15:08:12 UTC'
    },
    {
      id: 'ALT-CASCADE-02',
      title: 'Caller Timeout Spikes to ledger-db-proxy',
      severity: 'critical',
      state: 'firing',
      serviceId: 'payment-service',
      serviceName: 'payment-service',
      region: 'us-east-1',
      metric: 'grpc.client.requests.errors(target=ledger-db-proxy)',
      threshold: '> 0.05',
      currentValue: '0.24 (24%)',
      firedAt: '15:09:40 UTC'
    }
  ],
  deployments: [
    {
      id: 'dep-old-01',
      serviceName: 'payment-service',
      version: 'v1.8.2',
      environment: 'production',
      author: 'system',
      commitSha: '6b2a11',
      commitMessage: 'routine rebuild',
      timestamp: '04:00:00 UTC (11h ago)',
      status: 'healthy',
      acaScore: 99,
      canaryTrafficPercent: 100,
      p99CanaryVsStable: { canary: 24, stable: 24 },
      errorRateCanaryVsStable: { canary: 0.01, stable: 0.01 }
    }
  ],
  logs: [
    {
      id: 'log-casc-1',
      timestamp: '15:09:59.100',
      level: 'ERROR',
      service: 'ledger-db-proxy',
      serviceId: 'ledger-db-proxy',
      message: 'FATAL: database pool deadlock detected in pgpool lock manager. 120 client queries queued.',
      traceId: 'trace-casc-01',
      pod: 'ledger-db-proxy-0'
    },
    {
      id: 'log-casc-2',
      timestamp: '15:10:02.340',
      level: 'ERROR',
      service: 'payment-service',
      serviceId: 'payment-service',
      message: 'Call to ledger-db-proxy:5432 failed: DEADLINE_EXCEEDED after 5000ms timeout.',
      traceId: 'trace-casc-01',
      pod: 'payment-service-stable-9c12-0'
    }
  ],
  traces: [
    {
      id: 'span-casc-1',
      traceId: 'trace-casc-01',
      service: 'payment-service',
      operation: 'AuthorizePaymentCharge',
      durationMs: 5040,
      offsetMs: 0,
      status: 'error',
      httpStatus: 504,
      attributes: { 'error.message': 'ledger-db-proxy timeout' }
    },
    {
      id: 'span-casc-2',
      traceId: 'trace-casc-01',
      parentId: 'span-casc-1',
      service: 'ledger-db-proxy',
      operation: 'AcquireConnection & BeginTransaction',
      durationMs: 5020,
      offsetMs: 15,
      status: 'error',
      attributes: { 'pgpool.deadlock': 'true' },
      isCriticalPath: true
    }
  ]
};

export const SCENARIO_3_LATENCY_WITHOUT_DEPLOYMENT = {
  id: 'scenario-3-latency-no-deploy',
  name: 'Scenario 3: Latency Surge Without Deployment',
  description: 'Sudden JWT verification latency spike on auth-gateway-v2 with zero recent code changes.',
  expectedTopCandidateId: 'auth-gateway-v2',
  minExpectedScore: 50,
  incident: {
    id: 'INC-4923',
    title: 'High Latency Spike in OAuth2 Token Verification',
    summary: 'auth-gateway-v2 P99 latency increased 15x over baseline due to JWKS key retrieval stall against external Vault cluster.',
    severity: 'SEV-2',
    status: 'investigating',
    serviceId: 'auth-gateway-v2',
    serviceName: 'auth-gateway-v2',
    lead: 'David Kim',
    leadRole: 'Platform Lead',
    channel: '#inc-4923-auth-latency',
    startedAt: '16:00:00 UTC',
    durationMinutes: 18,
    dropRatePercent: 1.8,
    estimatedCostPerMin: 3200,
    sloBreached: true,
    sloCurrent: 97.4,
    sloTarget: 99.95,
    aiConfidencePercent: 82,
    aiHypothesis: 'External key vault rotation lockup causing JWT verification thread stalls.',
    aiRemediationRecommendation: 'Flush local JWKS cache and failover to secondary Vault replica.',
    timeline: [
      { time: '15:58:00 UTC', title: 'Vault Key Rotation Event', description: 'Upstream HashiCorp Vault initiated automated key rotation.', source: 'telemetry_anomaly' },
      { time: '16:00:00 UTC', title: 'Incident Declared', description: 'Elevated auth latency exceeded SEV-2 threshold.', source: 'ai_engine', isKeyMilestone: true }
    ]
  },
  services: initialServices.map(s => {
    if (s.id === 'auth-gateway-v2') {
      return { ...s, status: 'critical', latencyP99: 310, latencyBaseline: 18, errorRate: 3.2 };
    }
    return s;
  }),
  alerts: [
    {
      id: 'ALT-LAT-01',
      title: 'JWT Token Validation Latency Elevation (p99 > 250ms)',
      severity: 'critical',
      state: 'firing',
      serviceId: 'auth-gateway-v2',
      serviceName: 'auth-gateway-v2',
      region: 'us-east-1',
      metric: 'auth.jwt.validation.duration_ms(p99)',
      threshold: '> 250ms',
      currentValue: '310ms',
      firedAt: '15:59:10 UTC'
    }
  ],
  deployments: [
    {
      id: 'dep-unrelated-01',
      serviceName: 'checkout-api',
      version: 'v3.2.0',
      environment: 'production',
      author: 'marcus.v',
      commitSha: '2d8819a',
      commitMessage: 'routine payload fix',
      timestamp: 'Yesterday 18:40 UTC',
      status: 'healthy',
      acaScore: 98,
      canaryTrafficPercent: 100,
      p99CanaryVsStable: { canary: 45, stable: 45 },
      errorRateCanaryVsStable: { canary: 0.01, stable: 0.01 }
    }
  ],
  logs: [
    {
      id: 'log-auth-01',
      timestamp: '15:59:45.120',
      level: 'ERROR',
      service: 'auth-gateway-v2',
      serviceId: 'auth-gateway-v2',
      message: 'JWKS_KEY_STALL: Connection timed out fetching keys from vault-cluster:8200 after 3000ms',
      traceId: 'trace-auth-01',
      pod: 'auth-gateway-v2-55a1-0'
    }
  ],
  traces: [
    {
      id: 'span-auth-01',
      traceId: 'trace-auth-01',
      service: 'auth-gateway-v2',
      operation: 'POST /oauth/v2/token',
      durationMs: 310,
      offsetMs: 0,
      status: 'error',
      httpStatus: 504,
      attributes: { 'error.type': 'JWKSFetchTimeout' },
      isCriticalPath: true
    }
  ]
};

export const SCENARIO_4_INCOMPLETE_TELEMETRY = {
  id: 'scenario-4-incomplete-telemetry',
  name: 'Scenario 4: Incomplete Telemetry Coverage',
  description: 'Incident ticket declared on inventory-mesh with zero trace spans and empty log collector buffer.',
  expectedTopCandidateId: 'inventory-mesh',
  minExpectedScore: 35,
  incident: {
    id: 'INC-4924',
    title: 'Inventory Sync Desynchronization Alert',
    summary: 'Warehouse reconciliation worker failed batch sync. Telemetry logs and traces dropped during collector buffer overflow.',
    severity: 'SEV-2',
    status: 'investigating',
    serviceId: 'inventory-mesh',
    serviceName: 'inventory-mesh',
    lead: 'Elena Rostova',
    leadRole: 'Senior SRE',
    channel: '#inc-4924-inv-sync',
    startedAt: '17:15:00 UTC',
    durationMinutes: 25,
    dropRatePercent: 1.1,
    estimatedCostPerMin: 1800,
    sloBreached: false,
    sloCurrent: 98.9,
    sloTarget: 99.90,
    aiConfidencePercent: 44,
    aiHypothesis: 'Partial attribution: Topology match on inventory-mesh, but telemetry signals truncated.',
    aiRemediationRecommendation: 'Check OTLP collector queue depth and re-enable debug logging on worker nodes.',
    timeline: [
      { time: '17:15:00 UTC', title: 'Batch Desync Incident Declared', description: 'Automated reconcile check failed.', source: 'telemetry_anomaly', isKeyMilestone: true }
    ]
  },
  services: initialServices.map(s => {
    if (s.id === 'inventory-mesh') {
      return { ...s, status: 'degraded', latencyP99: 120, latencyBaseline: 20, errorRate: 2.1 };
    }
    return s;
  }),
  alerts: [
    {
      id: 'ALT-INV-01',
      title: 'Inventory Sync Error Rate (> 2.0%)',
      severity: 'warning',
      state: 'firing',
      serviceId: 'inventory-mesh',
      serviceName: 'inventory-mesh',
      region: 'us-east-1',
      metric: 'inventory.sync.error_ratio',
      threshold: '> 0.02',
      currentValue: '0.021',
      firedAt: '17:14:20 UTC'
    }
  ],
  deployments: [],
  logs: [],
  traces: []
};

export const SCENARIO_5_NO_CONVINCING_CANDIDATE = {
  id: 'scenario-5-no-convincing-candidate',
  name: 'Scenario 5: No Convincing Candidate (False Alarm)',
  description: 'Incident ticket with healthy services, resolved alerts, and normal baselines.',
  expectEmpty: true,
  incident: {
    id: 'INC-4925',
    title: 'Transient Ingress Jitter Probe',
    summary: 'Short spike on external synthetic probe that cleared immediately. All backend telemetry nominal.',
    severity: 'SEV-3',
    status: 'resolved',
    serviceId: 'notification-worker',
    serviceName: 'notification-worker',
    lead: 'David Kim',
    leadRole: 'Platform Lead',
    channel: '#inc-4925-synthetic-jitter',
    startedAt: '18:00:00 UTC',
    durationMinutes: 5,
    dropRatePercent: 0.0,
    estimatedCostPerMin: 0,
    sloBreached: false,
    sloCurrent: 100.0,
    sloTarget: 99.95,
    aiConfidencePercent: 12,
    aiHypothesis: 'No persistent causal root cause detected. Synthetic probe blip.',
    aiRemediationRecommendation: 'Close ticket as transient network blip.',
    timeline: [
      { time: '18:00:00 UTC', title: 'Probe Spike Detected', description: 'Single packet drop on synthetic ping.', source: 'telemetry_anomaly' },
      { time: '18:05:00 UTC', title: 'Baseline Restored', description: 'Metrics returned to nominal 0% loss.', source: 'telemetry_anomaly' }
    ]
  },
  services: initialServices.map(s => ({
    ...s,
    status: 'nominal',
    errorRate: 0.01,
    latencyP99: s.latencyBaseline
  })),
  alerts: [],
  deployments: [],
  logs: [],
  traces: []
};

