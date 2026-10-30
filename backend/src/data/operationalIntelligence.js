/**
 * Seed & Initial Data for Operational Intelligence & Predictive Incident Prevention
 * InfraPulse Phase 18
 */

export const INITIAL_OPERATIONAL_PATTERNS = [
  {
    id: 'pat-db-pool-sat-01',
    category: 'database_pool_saturation',
    title: 'Database Connection Pool Saturation on payment-service',
    description: 'Repeated database connection acquisition timeouts and thread exhaustion during traffic surges between payment-service and ledger-db-proxy.',
    affectedServices: ['payment-service', 'ledger-db-proxy'],
    occurrenceCount: 4,
    firstObservedAt: new Date(Date.now() - 21 * 86400000).toISOString(),
    lastObservedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    trendDirection: 'increasing',
    commonSignals: [
      'Connection lease timeout after 5000ms',
      'Database connection pool utilization sustained >= 95%',
      'Elevated thread wait time on postgresql driver pool'
    ],
    relatedIncidents: ['INC-2026-0042', 'INC-2026-0038'],
    confidence: 'high',
    sampleSize: 4
  },
  {
    id: 'pat-canary-regr-02',
    category: 'deployment_associated_regression',
    title: 'Post-Deployment Regressions on payment-service',
    description: 'Degraded P99 latency and 5xx error spikes observed within 45 minutes following canary deployment rollouts.',
    affectedServices: ['payment-service'],
    occurrenceCount: 3,
    firstObservedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    lastObservedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    trendDirection: 'stable',
    commonSignals: [
      'Canary pod error rate divergence > 8% relative to stable baseline',
      'Post-deployment regression alert triggered within 30m window'
    ],
    relatedIncidents: ['INC-2026-0042'],
    confidence: 'high',
    sampleSize: 3
  },
  {
    id: 'pat-timeout-prop-03',
    category: 'dependency_timeout_propagation',
    title: 'Cascading Timeout Propagation affecting auth-gateway-v2',
    description: 'Redis cache latency spikes cause cascading HTTP 504 Gateway Timeouts across auth-gateway-v2 token validation endpoints.',
    affectedServices: ['auth-gateway-v2', 'redis-session-cache'],
    occurrenceCount: 3,
    firstObservedAt: new Date(Date.now() - 28 * 86400000).toISOString(),
    lastObservedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    trendDirection: 'decreasing',
    commonSignals: [
      'Redis connection pool wait timeout > 250ms',
      'Cascading 504 Gateway Timeout returned to upstream callers'
    ],
    relatedIncidents: ['INC-2026-0019'],
    confidence: 'medium',
    sampleSize: 3
  },
  {
    id: 'pat-slo-burn-04',
    category: 'repeated_slo_exhaustion',
    title: 'Persistent Error Budget Burn on payment-service',
    description: 'Multi-window burn-rate alerts triggered consecutively, rapidly consuming monthly availability and latency error budgets.',
    affectedServices: ['payment-service'],
    occurrenceCount: 3,
    firstObservedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    lastObservedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    trendDirection: 'increasing',
    commonSignals: [
      'Fast burn rate (14.4x) triggered on 1h window',
      'Monthly error budget consumed > 75% before mid-cycle'
    ],
    relatedIncidents: ['INC-2026-0042'],
    confidence: 'high',
    sampleSize: 3
  }
];

export const INITIAL_PATTERN_EVIDENCE = [
  {
    id: 'evi-pool-01',
    patternId: 'pat-db-pool-sat-01',
    evidenceType: 'incident_record',
    sourceRefId: 'INC-2026-0042',
    title: 'Payment Gateway Connection Saturation Outage',
    description: 'Root cause confirmed as HikariCP pool starvation during morning batch settlement.',
    observedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    metadata: { maxPoolSize: 20, activeConnections: 20, waitingThreads: 48 }
  },
  {
    id: 'evi-pool-02',
    patternId: 'pat-db-pool-sat-01',
    evidenceType: 'alert_record',
    sourceRefId: 'ALT-1092',
    title: 'Database Pool Starvation Alert',
    description: 'Postgres connection lease duration exceeded 3000ms threshold.',
    observedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    metadata: { alertRule: 'Database Pool Exhaustion', severity: 'critical' }
  },
  {
    id: 'evi-regr-01',
    patternId: 'pat-canary-regr-02',
    evidenceType: 'deployment_regression',
    sourceRefId: 'REG-2026-0081',
    title: 'v1.8.3 Canary Latency Divergence',
    description: 'Canary pod p99 latency surged from 24ms to 412ms within 10 minutes of traffic routing.',
    observedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    metadata: { releaseVersion: 'v1.8.3', changeType: 'canary_deployment' }
  },
  {
    id: 'evi-timeout-01',
    patternId: 'pat-timeout-prop-03',
    evidenceType: 'trace_record',
    sourceRefId: 'trace_48c71a39ef8b01',
    title: 'Distributed Trace Timeout Cascade',
    description: 'Auth gateway span timed out waiting for Redis session cache lookup.',
    observedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    metadata: { durationMs: 1250, downstreamService: 'redis-session-cache' }
  }
];

export const INITIAL_PREVENTIVE_RECOMMENDATIONS = [
  {
    id: 'REC-POOL-01',
    title: 'Scale and Optimize Database Connection Pool Parameters',
    explanation: 'Increase maximum pool size from 20 to 50 on payment-service and configure aggressive lease timeouts (1500ms) with idle connection reaping.',
    serviceId: 'payment-service',
    serviceName: 'payment-service',
    priority: 'P1',
    status: 'OPEN',
    ownerRole: 'SRE Reliability Team',
    ownerUserId: 'user-sre-lead',
    expectedBenefit: 'Eliminates thread starvation during settlement surges, reducing P99 latency spikes by estimated 65%.',
    benefitType: 'measured',
    supportingPatternIds: ['pat-db-pool-sat-01'],
    supportingEvidenceRefs: ['INC-2026-0042', 'ALT-1092'],
    relevantRunbookIds: ['RB-DB-01'],
    verificationMethod: 'Execute load test simulating 25,000 req/sec; confirm pool lease wait times remain < 50ms and zero connection timeouts occur over 7-day monitoring window.',
    verificationNotes: null,
    dismissedReason: null,
    linkedIssueRef: 'JIRA-RELIABILITY-412'
  },
  {
    id: 'REC-TIMEOUT-02',
    title: 'Deploy Circuit Breaker with Local Fallback Cache for Auth Tokens',
    explanation: 'Introduce fail-open localized memory caching for valid JWT claims in auth-gateway-v2 to decouple incoming authentication from remote Redis latency.',
    serviceId: 'auth-gateway-v2',
    serviceName: 'auth-gateway-v2',
    priority: 'P1',
    status: 'ACKNOWLEDGED',
    ownerRole: 'Security Edge Team',
    ownerUserId: 'user-edge-eng',
    expectedBenefit: 'Prevents cascading 504 timeouts when Redis undergoes cluster rebalancing or high load.',
    benefitType: 'qualitative',
    supportingPatternIds: ['pat-timeout-prop-03'],
    supportingEvidenceRefs: ['trace_48c71a39ef8b01'],
    relevantRunbookIds: ['RB-TIMEOUT-01'],
    verificationMethod: 'Simulate downstream Redis 2000ms latency injection via Fault Injection Lab; verify auth gateway serves authenticated requests within 45ms using local cache.',
    verificationNotes: null,
    dismissedReason: null,
    linkedIssueRef: 'JIRA-SEC-891'
  },
  {
    id: 'REC-CANARY-03',
    title: 'Automate Canary Rollback upon Error Rate Divergence',
    explanation: 'Enforce automated progressive canary analysis that triggers an immediate rollback if canary error rate exceeds baseline by 2% for 3 consecutive minutes.',
    serviceId: 'payment-service',
    serviceName: 'payment-service',
    priority: 'P0',
    status: 'IN_PROGRESS',
    ownerRole: 'Release Engineering',
    ownerUserId: 'user-release-bot',
    expectedBenefit: 'Stops problematic releases before full fleet promotion, mitigating 100% of canary regression incidents.',
    benefitType: 'measured',
    supportingPatternIds: ['pat-canary-regr-02'],
    supportingEvidenceRefs: ['REG-2026-0081'],
    relevantRunbookIds: ['RB-ROLLBACK-01'],
    verificationMethod: 'Deploy simulated faulty canary in staging; confirm automated rollback triggers within 3 minutes and audit event is recorded.',
    verificationNotes: null,
    dismissedReason: null,
    linkedIssueRef: 'JIRA-CD-105'
  },
  {
    id: 'REC-CACHE-04',
    title: 'Auth Gateway Session Cache Memory Quotas and Connection Limits',
    explanation: 'Apply strict concurrency limits and connection timeouts on auth-gateway-v2 session cache clients to prevent thread pool exhaustion.',
    serviceId: 'auth-gateway-v2',
    serviceName: 'auth-gateway-v2',
    priority: 'P2',
    status: 'VERIFIED',
    ownerRole: 'Platform Infrastructure',
    ownerUserId: 'admin-alex',
    expectedBenefit: 'Guarantees auth gateway remains resilient under token verification pressure without service degradation.',
    benefitType: 'measured',
    supportingPatternIds: ['pat-timeout-prop-03'],
    supportingEvidenceRefs: ['INC-2026-0019'],
    relevantRunbookIds: ['RB-RESTART-01'],
    verificationMethod: 'Inspect session client memory info metrics under 95% load and verify requests are serviced without process restarts.',
    verificationNotes: 'Verified in production on Oct 29. Client timeouts verified functioning under stress test with 0 pod restarts.',
    dismissedReason: null,
    linkedIssueRef: 'JIRA-PLAT-334'
  }
];

export const INITIAL_EARLY_WARNINGS = [
  {
    id: 'ew-pool-payment-01',
    category: 'accelerating_budget_burn',
    serviceId: 'payment-service',
    serviceName: 'payment-service',
    severity: 'critical',
    indicators: [
      'Error budget consumption rate is 14.4x normal over the past 1-hour window',
      'Remaining error budget margin is down to 24.12%',
      'Target objective: 99.9% (Payment API Availability)'
    ],
    historical_comparison: 'Historical data indicates burn rates >= 5x on payment-service precede critical availability outages within 2 to 4 hours if left unmitigated.',
    windowMinutes: 60,
    confidence: 'high',
    recommendedInvestigation: 'Execute latency/error diagnostic runbook (RB-LATENCY-01) and inspect upstream callers for retry storms.',
    detectedAt: new Date(Date.now() - 15 * 60000).toISOString()
  },
  {
    id: 'ew-regr-payment-02',
    category: 'repeated_deployment_regression',
    serviceId: 'payment-service',
    serviceName: 'payment-service',
    severity: 'warning',
    indicators: [
      '2 deployment regressions observed in close succession',
      'Recent regression: v1.8.3 showed latency/error divergence',
      'Change failure rate elevated above baseline'
    ],
    historical_comparison: 'Corresponds to recurrent deployment regression pattern on payment-service. Similar post-release degradation previously led to customer-facing SEV-1 incidents.',
    windowMinutes: 1440,
    confidence: 'high',
    recommendedInvestigation: 'Verify canary verification gates (RB-ROLLBACK-01) and review pull request telemetry diffs before promoting next release.',
    detectedAt: new Date(Date.now() - 45 * 60000).toISOString()
  }
];
