export const INITIAL_CHANGES = [
  {
    id: 'chg-1094',
    serviceId: 'payment-service',
    serviceName: 'payment-service',
    previousVersion: 'v1.8.2',
    newVersion: 'v1.8.3',
    environment: 'canary',
    deploymentStrategy: 'canary',
    commitSha: '7f4a29c',
    commitMessage: 'feat(payments): add idempotency token check with distributed cache lock',
    actor: 'alex.ross@infrapulse.io',
    status: 'failed',
    changeType: 'code_deployment',
    changedComponents: ['services/payment/idempotency.go', 'db/migrations/20261028_locks.sql'],
    idempotencyKey: 'idemp-chg-1094',
    telemetrySource: 'demo_adapter',
    isSimulated: true,
    evidenceQuality: 'good',
    deployedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    initialAssessment: {
      id: 'asmt-chg-1094',
      riskScore: 78,
      riskCategory: 'high',
      recommendation: 'HIGH_RISK',
      confidence: 'high',
      factorBreakdowns: {
        changeScope: { points: 10, max: 15, weight: '13.0%' },
        serviceCriticality: { points: 15, max: 15, weight: '13.0%' },
        blastRadius: { points: 16, max: 20, weight: '17.4%' },
        historicalFailureRate: { points: 5, max: 15, weight: '13.0%' },
        recentIncidents: { points: 10, max: 10, weight: '8.7%' },
        preDeploymentSlo: { points: 6, max: 10, weight: '8.7%' },
        errorBudget: { points: 7, max: 10, weight: '8.7%' },
        existingAlerts: { points: 5, max: 10, weight: '8.7%' },
        telemetryCompleteness: { points: 4, max: 10, weight: '8.7%' }
      },
      blastRadiusSummary: {
        totalImpactedCount: 3,
        directCount: 2,
        transitiveCount: 1,
        criticalDownstreamCount: 2,
        criticalServices: ['checkout-api', 'auth-gateway-v2'],
        sharedDependenciesCount: 1
      },
      supportingEvidence: [
        { factor: 'service_criticality', points: 15, description: 'Target service "payment-service" is Tier-0 (Mission-Critical).' },
        { factor: 'blast_radius_critical', points: 4, description: 'Direct caller "checkout-api" is in the blast path.' },
        { factor: 'schema_migration', points: 3, description: 'Change includes database schema migrations or stateful storage modifications.' }
      ],
      missingEvidence: [],
      recommendedVerifications: [
        'Observe canary telemetry for minimum 15 minutes before progressive rollout.',
        'Verify checkout-api p99 latency does not exceed 100ms threshold.'
      ]
    },
    initialRegressions: [
      {
        id: 'reg-chg-1094-lat',
        metricName: 'latency_p99',
        baselineValue: 24,
        currentValue: 412,
        deltaPercent: 1616.67,
        regressionSeverity: 'critical',
        observationWindowMinutes: 30,
        temporalAssociation: true,
        causalityStatus: 'correlated_temporal',
        evidenceQuality: 'good',
        relatedIncidents: ['INC-4921'],
        relatedAlerts: ['ALT-1092'],
        explanation: 'Observed p99 latency regression (24ms -> 412ms, +1616.7%) in "payment-service" 12m post-deployment. Represents strong temporal correlation.'
      },
      {
        id: 'reg-chg-1094-err',
        metricName: 'error_rate',
        baselineValue: 0.02,
        currentValue: 4.12,
        deltaPercent: 20500.0,
        regressionSeverity: 'critical',
        observationWindowMinutes: 30,
        temporalAssociation: true,
        causalityStatus: 'correlated_temporal',
        evidenceQuality: 'good',
        relatedIncidents: ['INC-4921'],
        relatedAlerts: ['ALT-1092'],
        explanation: 'Observed error rate spike (0.02% -> 4.12%, +20500.0%) post-deployment. Canary traffic failure rate elevated.'
      }
    ],
    initialOutcome: {
      id: 'outc-chg-1094',
      observedOutcome: 'degraded',
      incidentId: 'INC-4921',
      rollbackPerformed: false,
      timeToRecoveryMinutes: 25,
      postDeploymentNotes: 'Canary triggered latency regression and downstream checkout failures.'
    }
  },
  {
    id: 'chg-1093',
    serviceId: 'auth-gateway-v2',
    serviceName: 'auth-gateway-v2',
    previousVersion: 'v2.4.0',
    newVersion: 'v2.4.1',
    environment: 'production',
    deploymentStrategy: 'rolling',
    commitSha: '9e12bf4',
    commitMessage: 'chore(security): bump jose to v5.9.1 and enable key cache eviction',
    actor: 'sarah.chen@infrapulse.io',
    status: 'successful',
    changeType: 'code_deployment',
    changedComponents: ['package.json', 'src/auth/token.js'],
    idempotencyKey: 'idemp-chg-1093',
    telemetrySource: 'demo_adapter',
    isSimulated: true,
    evidenceQuality: 'good',
    deployedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    initialAssessment: {
      id: 'asmt-chg-1093',
      riskScore: 24,
      riskCategory: 'low',
      recommendation: 'LOW_RISK',
      confidence: 'high',
      factorBreakdowns: {
        changeScope: { points: 2, max: 15, weight: '13.0%' },
        serviceCriticality: { points: 15, max: 15, weight: '13.0%' },
        blastRadius: { points: 5, max: 20, weight: '17.4%' },
        historicalFailureRate: { points: 1, max: 15, weight: '13.0%' },
        recentIncidents: { points: 0, max: 10, weight: '8.7%' },
        preDeploymentSlo: { points: 0, max: 10, weight: '8.7%' },
        errorBudget: { points: 0, max: 10, weight: '8.7%' },
        existingAlerts: { points: 0, max: 10, weight: '8.7%' },
        telemetryCompleteness: { points: 1, max: 10, weight: '8.7%' }
      },
      blastRadiusSummary: {
        totalImpactedCount: 1,
        directCount: 1,
        transitiveCount: 0,
        criticalDownstreamCount: 0,
        criticalServices: [],
        sharedDependenciesCount: 0
      },
      supportingEvidence: [
        { factor: 'change_scope', points: 2, description: 'Patch security dependency upgrade.' },
        { factor: 'slo_status_nominal', points: 0, description: 'Target service SLO is compliant.' }
      ],
      missingEvidence: [],
      recommendedVerifications: ['Standard post-rollout health check.']
    },
    initialRegressions: [],
    initialOutcome: {
      id: 'outc-chg-1093',
      observedOutcome: 'healthy',
      incidentId: null,
      rollbackPerformed: false,
      timeToRecoveryMinutes: 0,
      postDeploymentNotes: 'Rollout succeeded without degradation.'
    }
  },
  {
    id: 'chg-1092',
    serviceId: 'checkout-api',
    serviceName: 'checkout-api',
    previousVersion: 'v3.1.9',
    newVersion: 'v3.2.0',
    environment: 'production',
    deploymentStrategy: 'rolling',
    commitSha: '2d8819a',
    commitMessage: 'refactor: streamline checkout payload compression',
    actor: 'marcus.v@infrapulse.io',
    status: 'successful',
    changeType: 'code_deployment',
    changedComponents: ['src/compression.js'],
    idempotencyKey: 'idemp-chg-1092',
    telemetrySource: 'demo_adapter',
    isSimulated: true,
    evidenceQuality: 'good',
    deployedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    initialAssessment: {
      id: 'asmt-chg-1092',
      riskScore: 28,
      riskCategory: 'low',
      recommendation: 'LOW_RISK',
      confidence: 'high',
      factorBreakdowns: {
        changeScope: { points: 5, max: 15, weight: '13.0%' },
        serviceCriticality: { points: 15, max: 15, weight: '13.0%' },
        blastRadius: { points: 5, max: 20, weight: '17.4%' },
        historicalFailureRate: { points: 1, max: 15, weight: '13.0%' },
        recentIncidents: { points: 0, max: 10, weight: '8.7%' },
        preDeploymentSlo: { points: 0, max: 10, weight: '8.7%' },
        errorBudget: { points: 0, max: 10, weight: '8.7%' },
        existingAlerts: { points: 0, max: 10, weight: '8.7%' },
        telemetryCompleteness: { points: 2, max: 10, weight: '8.7%' }
      },
      blastRadiusSummary: {
        totalImpactedCount: 0,
        directCount: 0,
        transitiveCount: 0,
        criticalDownstreamCount: 0,
        criticalServices: [],
        sharedDependenciesCount: 0
      },
      supportingEvidence: [
        { factor: 'change_scope', points: 5, description: 'Minor version optimization.' }
      ],
      missingEvidence: [],
      recommendedVerifications: ['Check payload decompression cpu overhead.']
    },
    initialRegressions: [],
    initialOutcome: {
      id: 'outc-chg-1092',
      observedOutcome: 'healthy',
      incidentId: null,
      rollbackPerformed: false,
      timeToRecoveryMinutes: 0,
      postDeploymentNotes: 'Rollout succeeded without degradation.'
    }
  }
];
