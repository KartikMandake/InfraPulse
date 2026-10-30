/**
 * Holdout Evaluation Dataset for InfraPulse RCA Engine
 *
 * CRITICAL METHODOLOGICAL RULE:
 * This dataset was NOT used during scoring weight calibration.
 * It serves as an independent, untouched validation set across 8 edge-case conditions:
 *
 * 1. Upstream latency anomaly without an alert (search-mesh GC pause with no active alert)
 * 2. Downstream symptom with healthy upstream telemetry (caller times out due to client misconfig, backend healthy)
 * 3. Multiple simultaneous anomalies (two services spiking, one caused by deployment)
 * 4. Conflicting deployment and trace evidence (deploy on A, but trace error originated on B)
 * 5. Stale telemetry (incident started now, but telemetry stopped updating 4 hours ago)
 * 6. Missing baseline (new microservice with 0ms baseline)
 * 7. No plausible root cause (healthy telemetry across all services)
 * 8. Two plausible competing causes (both upstream dependencies failing)
 */

import { initialServices } from '../../backend/src/data/services.js';
import { initialIncidents } from '../../backend/src/data/incidents.js';
import { initialAlerts } from '../../backend/src/data/alerts.js';
import { initialDeployments } from '../../backend/src/data/deployments.js';
import { initialLogs, initialTraces } from '../../backend/src/data/telemetry.js';

export const RCA_HOLDOUT_DATASET = [
  // 1. Upstream latency anomaly without an alert
  {
    id: 'holdout-01-latency-without-alert',
    name: 'Upstream Latency Anomaly Without Alert',
    type: 'no_alert_latency',
    groundTruth: {
      expectedRootCauseServiceId: 'search-mesh',
      sufficientEvidence: true,
      minScore: 40
    },
    evidence: {
      incident: {
        id: 'INC-H01',
        title: 'Catalog Query Latency Spike',
        serviceId: 'checkout-api',
        startedAt: '12:00:00 UTC'
      },
      services: [
        ...initialServices.map(s => {
          if (s.id === 'checkout-api') {
            return { ...s, dependencies: ['search-mesh', 'payment-service'] };
          }
          return s;
        }),
        {
          id: 'search-mesh',
          name: 'search-mesh',
          status: 'degraded',
          latencyP99: 900,
          latencyBaseline: 45, // 20x surge!
          errorRate: 0.1,
          rps: 3000,
          dependencies: []
        }
      ],
      alerts: [], // ZERO ALERTS! Must be detected purely via telemetry anomaly analysis
      deployments: [],
      logs: [],
      traces: []
    }
  },

  // 2. Downstream symptom with healthy upstream telemetry
  {
    id: 'holdout-02-downstream-symptom-upstream-healthy',
    name: 'Downstream Symptom with Healthy Upstream Telemetry',
    type: 'downstream_symptom',
    groundTruth: {
      expectedRootCauseServiceId: 'checkout-api',
      sufficientEvidence: true,
      minScore: 50
    },
    evidence: {
      incident: {
        id: 'INC-H02',
        title: 'Checkout API Connection Leaks to Payment Service',
        serviceId: 'checkout-api',
        startedAt: '10:30:00 UTC'
      },
      services: initialServices.map(s => {
        if (s.id === 'checkout-api') {
          return { ...s, status: 'critical', latencyP99: 800, latencyBaseline: 45, errorRate: 12.0 };
        }
        if (s.id === 'payment-service') {
          // Healthy upstream callee!
          return { ...s, status: 'nominal', latencyP99: 25, latencyBaseline: 24, errorRate: 0.01 };
        }
        return s;
      }),
      alerts: [
        {
          id: 'ALT-H02-CHK',
          title: 'Checkout API Client Pool Starvation',
          severity: 'critical',
          state: 'firing',
          serviceId: 'checkout-api',
          serviceName: 'checkout-api',
          metric: 'http.504_rate',
          operator: '>',
          currentValue: '12.0'
        }
      ],
      deployments: [],
      logs: [],
      traces: []
    }
  },

  // 3. Multiple simultaneous anomalies (Deployment on payment-service causes it to outrank background noise on cart-service)
  {
    id: 'holdout-03-simultaneous-anomalies',
    name: 'Multiple Simultaneous Anomalies with Deployment Discriminator',
    type: 'multi_anomaly',
    groundTruth: {
      expectedRootCauseServiceId: 'payment-service',
      sufficientEvidence: true,
      minScore: 65
    },
    evidence: {
      incident: initialIncidents[0],
      services: initialServices.map(s => {
        if (s.id === 'cart-service') {
          return { ...s, status: 'degraded', latencyP99: 100, latencyBaseline: 15 };
        }
        return s;
      }),
      alerts: initialAlerts,
      deployments: initialDeployments,
      logs: initialLogs,
      traces: initialTraces
    }
  },

  // 4. Conflicting deployment and trace evidence (deploy on checkout-api, but trace failure is at ledger-db-proxy)
  {
    id: 'holdout-04-conflicting-deploy-trace',
    name: 'Conflicting Deployment and Trace Evidence',
    type: 'conflicting_evidence',
    groundTruth: {
      expectedRootCauseServiceId: 'ledger-db-proxy',
      sufficientEvidence: true,
      minScore: 50
    },
    evidence: {
      incident: {
        id: 'INC-H04',
        title: 'Checkout DB Timeouts',
        serviceId: 'checkout-api',
        startedAt: '14:00:00 UTC'
      },
      services: initialServices,
      alerts: [
        {
          id: 'ALT-H04-DB',
          title: 'Ledger DB Proxy Deadlocks',
          severity: 'critical',
          state: 'firing',
          serviceId: 'ledger-db-proxy',
          serviceName: 'ledger-db-proxy',
          metric: 'deadlocks',
          operator: '>',
          currentValue: '5'
        }
      ],
      deployments: [
        {
          id: 'dep-chk-v3',
          serviceName: 'checkout-api',
          version: 'v3.2.1',
          timestamp: '13:58:00 UTC',
          status: 'healthy',
          acaScore: 95
        }
      ],
      logs: [
        {
          id: 'log-h04',
          serviceId: 'ledger-db-proxy',
          level: 'ERROR',
          message: 'Deadlock detected in transaction thread #12'
        }
      ],
      traces: [
        {
          traceId: 'tr-h04',
          service: 'checkout-api',
          durationMs: 1200,
          error: true,
          spans: [
            { service: 'payment-service', durationMs: 1100, error: true },
            { service: 'ledger-db-proxy', durationMs: 1050, error: true, errorDetails: 'Deadlock' }
          ]
        }
      ]
    }
  },

  // 5. Stale telemetry (telemetry records 4 hours old)
  {
    id: 'holdout-05-stale-telemetry',
    name: 'Stale Telemetry Window',
    type: 'stale_telemetry',
    groundTruth: {
      expectedRootCauseServiceId: 'payment-service',
      sufficientEvidence: false, // Must report weak/insufficient due to staleness
      maxScore: 60
    },
    evidence: {
      incident: {
        id: 'INC-H05',
        title: 'Fresh Incident with Stale Observability Data',
        serviceId: 'payment-service',
        startedAt: '22:00:00 UTC'
      },
      services: initialServices,
      alerts: [],
      deployments: [
        {
          id: 'dep-old',
          serviceName: 'payment-service',
          version: 'v1.7.0',
          timestamp: '14:00:00 UTC', // 8 hours ago
          status: 'healthy',
          acaScore: 100
        }
      ],
      logs: [],
      traces: []
    }
  },

  // 6. Missing baseline (new service with latencyBaseline = 0)
  {
    id: 'holdout-06-missing-baseline',
    name: 'New Service with Missing Baseline (Zero Value)',
    type: 'missing_baseline',
    groundTruth: {
      expectedRootCauseServiceId: 'new-microservice',
      sufficientEvidence: true,
      minScore: 40
    },
    evidence: {
      incident: {
        id: 'INC-H06',
        title: 'New Microservice Failure',
        serviceId: 'checkout-api',
        startedAt: '15:00:00 UTC'
      },
      services: [
        ...initialServices.map(s => {
          if (s.id === 'checkout-api') {
            return { ...s, dependencies: ['new-microservice'] };
          }
          return s;
        }),
        {
          id: 'new-microservice',
          name: 'new-microservice',
          status: 'critical',
          latencyP99: 1500,
          latencyBaseline: 0, // Missing baseline!
          errorRate: 25.0,
          rps: 1200,
          dependencies: []
        }
      ],
      alerts: [],
      deployments: [],
      logs: [],
      traces: []
    }
  },

  // 7. No plausible root cause (completely healthy mesh)
  {
    id: 'holdout-07-no-plausible-cause',
    name: 'No Plausible Root Cause (Nominal System)',
    type: 'false_alarm',
    groundTruth: {
      expectedRootCauseServiceId: null,
      sufficientEvidence: false,
      maxScore: 35
    },
    evidence: {
      incident: {
        id: 'INC-H07',
        title: 'Spurious Ticket Created by Flapping Monitor',
        serviceId: 'checkout-api',
        startedAt: '04:00:00 UTC'
      },
      services: initialServices.map(s => ({
        ...s,
        status: 'nominal',
        latencyP99: s.latencyBaseline,
        errorRate: 0.01,
        cpuPercent: 25
      })),
      alerts: [],
      deployments: [],
      logs: [],
      traces: []
    }
  },

  // 8. Two plausible competing causes (both upstream dependencies showing anomalies)
  {
    id: 'holdout-08-competing-causes',
    name: 'Two Plausible Competing Upstream Causes',
    type: 'competing_causes',
    groundTruth: {
      expectedRootCauseServiceId: 'ledger-db-proxy', // Higher anomaly severity should win
      sufficientEvidence: true,
      minScore: 50
    },
    evidence: {
      incident: {
        id: 'INC-H08',
        title: 'Payment Authorization Dual-Dependency Degradation',
        serviceId: 'payment-service',
        startedAt: '16:00:00 UTC'
      },
      services: initialServices.map(s => {
        if (s.id === 'ledger-db-proxy') {
          return { ...s, status: 'critical', latencyP99: 800, latencyBaseline: 8, errorRate: 15.0 };
        }
        if (s.id === 'fraud-evaluator') {
          return { ...s, status: 'degraded', latencyP99: 90, latencyBaseline: 35, errorRate: 2.0 };
        }
        return s;
      }),
      alerts: [
        {
          id: 'ALT-H08-LED',
          title: 'Ledger DB Proxy Deadlocks',
          severity: 'critical',
          state: 'firing',
          serviceId: 'ledger-db-proxy',
          serviceName: 'ledger-db-proxy',
          metric: 'deadlocks',
          operator: '>',
          currentValue: '12'
        }
      ],
      deployments: [],
      logs: [],
      traces: []
    }
  }
];

