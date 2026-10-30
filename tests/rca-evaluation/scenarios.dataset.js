/**
 * Labeled RCA Evaluation Dataset
 *
 * CRITICAL ARCHITECTURAL RULE:
 * Ground truth annotations (expectedRootCauseServiceId, expectedDownstream, minExpectedScore, type)
 * are strictly segregated into metadata objects and NEVER supplied to the RCA engine as evidence.
 *
 * Includes:
 * 1. Deployment-related failure
 * 2. Upstream dependency outage
 * 3. Database latency / pool lockup
 * 4. Network timeout
 * 5. High error rate
 * 6. Isolated latency anomaly
 * 7. Incomplete telemetry
 * 8. Ambiguous incident with no convincing cause (False Alarm)
 */

import { initialServices } from '../../backend/src/data/services.js';
import { initialIncidents } from '../../backend/src/data/incidents.js';
import { initialAlerts } from '../../backend/src/data/alerts.js';
import { initialDeployments } from '../../backend/src/data/deployments.js';
import { initialLogs, initialTraces } from '../../backend/src/data/telemetry.js';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export const RCA_EVALUATION_DATASET = [
  // 1. Deployment-related failure
  {
    id: 'eval-01-deployment-regression',
    name: 'Canary Deployment Regression',
    type: 'deployment_failure',
    groundTruth: {
      expectedRootCauseServiceId: 'payment-service',
      sufficientEvidence: true,
      minScore: 70
    },
    evidence: {
      incident: initialIncidents[0],
      services: initialServices,
      alerts: initialAlerts,
      deployments: initialDeployments,
      logs: initialLogs,
      traces: initialTraces
    }
  },

  // 2. Upstream dependency outage
  {
    id: 'eval-02-upstream-dependency-outage',
    name: 'Upstream Dependency Outage (Fraud Evaluator Crash)',
    type: 'dependency_outage',
    groundTruth: {
      expectedRootCauseServiceId: 'fraud-evaluator',
      sufficientEvidence: true,
      minScore: 65
    },
    evidence: {
      incident: {
        id: 'INC-EVAL-02',
        title: 'Checkout Failure: Fraud Evaluator gRPC UNAVAILABLE',
        summary: 'payment-service and checkout-api receiving connection refused from fraud-evaluator.',
        serviceId: 'payment-service',
        startedAt: '16:00:00 UTC'
      },
      services: initialServices.map(s => {
        if (s.id === 'fraud-evaluator') {
          return { ...s, status: 'critical', latencyP99: 2500, errorRate: 42.0, cpuPercent: 95.0 };
        }
        if (s.id === 'payment-service') {
          return { ...s, status: 'degraded', latencyP99: 800, errorRate: 15.0 };
        }
        return s;
      }),
      alerts: [
        {
          id: 'ALT-FE-01',
          title: 'Fraud Evaluator CrashLoop / Connection Refused',
          severity: 'critical',
          state: 'firing',
          serviceId: 'fraud-evaluator',
          serviceName: 'fraud-evaluator',
          metric: 'process.status',
          operator: '==',
          currentValue: 'crashed'
        },
        {
          id: 'ALT-PAY-02',
          title: 'Payment Service Upstream Timeout',
          severity: 'warning',
          state: 'firing',
          serviceId: 'payment-service',
          serviceName: 'payment-service',
          metric: 'http.504_rate',
          operator: '>',
          currentValue: '12.5'
        }
      ],
      deployments: [],
      logs: [
        {
          id: 'log-fe-01',
          service: 'fraud-evaluator',
          level: 'FATAL',
          message: 'Process terminated with SIGSEGV in model evaluation thread',
          timestamp: '15:58:30 UTC'
        }
      ],
      traces: [
        {
          traceId: 'tr-fe-01',
          service: 'checkout-api',
          operation: 'POST /v1/checkout',
          durationMs: 2550,
          error: true,
          spans: [
            { service: 'payment-service', durationMs: 2500, error: true },
            { service: 'fraud-evaluator', durationMs: 2450, error: true, errorDetails: 'gRPC status UNAVAILABLE' }
          ]
        }
      ]
    }
  },

  // 3. Database latency
  {
    id: 'eval-03-database-latency',
    name: 'Database Proxy Connection Pool Deadlock',
    type: 'database_latency',
    groundTruth: {
      expectedRootCauseServiceId: 'ledger-db-proxy',
      sufficientEvidence: true,
      minScore: 60
    },
    evidence: {
      incident: {
        id: 'INC-EVAL-03',
        title: 'Ledger Query Queue Exhaustion',
        summary: 'Transactions timing out waiting for database connection pool.',
        serviceId: 'payment-service',
        startedAt: '14:20:00 UTC'
      },
      services: initialServices.map(s => {
        if (s.id === 'ledger-db-proxy') {
          return { ...s, status: 'critical', latencyP99: 1200, errorRate: 8.5, cpuPercent: 99.0 };
        }
        return s;
      }),
      alerts: [
        {
          id: 'ALT-DB-01',
          title: 'Ledger DB Proxy Connection Pool Saturation',
          severity: 'critical',
          state: 'firing',
          serviceId: 'ledger-db-proxy',
          serviceName: 'ledger-db-proxy',
          metric: 'pool.active_connections',
          operator: '>=',
          currentValue: '100'
        }
      ],
      deployments: [],
      logs: [],
      traces: []
    }
  },

  // 4. Network timeout
  {
    id: 'eval-04-network-timeout',
    name: 'Cross-AZ Network Partition / Gateway Timeout',
    type: 'network_timeout',
    groundTruth: {
      expectedRootCauseServiceId: 'inventory-mesh',
      sufficientEvidence: true,
      minScore: 55
    },
    evidence: {
      incident: {
        id: 'INC-EVAL-04',
        title: 'Inventory Mesh gRPC Deadline Exceeded',
        summary: 'Checkout calls timing out on inventory reservation.',
        serviceId: 'checkout-api',
        startedAt: '11:00:00 UTC'
      },
      services: initialServices.map(s => {
        if (s.id === 'inventory-mesh') {
          return { ...s, status: 'critical', latencyP99: 3000, errorRate: 22.0 };
        }
        return s;
      }),
      alerts: [
        {
          id: 'ALT-NET-01',
          title: 'Inventory Mesh Network Timeout',
          severity: 'critical',
          state: 'firing',
          serviceId: 'inventory-mesh',
          serviceName: 'inventory-mesh',
          metric: 'network.timeout_count',
          operator: '>',
          currentValue: '45'
        }
      ],
      deployments: [],
      logs: [],
      traces: []
    }
  },

  // 5. High error rate
  {
    id: 'eval-05-high-error-rate',
    name: 'Auth Gateway JWKS Validation HTTP 500 Surge',
    type: 'high_error_rate',
    groundTruth: {
      expectedRootCauseServiceId: 'auth-gateway-v2',
      sufficientEvidence: true,
      minScore: 60
    },
    evidence: {
      incident: {
        id: 'INC-EVAL-05',
        title: 'Auth Gateway Spike in HTTP 500 Responses',
        summary: 'Tokens failing validation at ingress.',
        serviceId: 'auth-gateway-v2',
        startedAt: '09:15:00 UTC'
      },
      services: initialServices.map(s => {
        if (s.id === 'auth-gateway-v2') {
          return { ...s, status: 'critical', errorRate: 28.5, latencyP99: 450 };
        }
        return s;
      }),
      alerts: [
        {
          id: 'ALT-ERR-01',
          title: 'Elevated HTTP 5xx Error Rate',
          severity: 'critical',
          state: 'firing',
          serviceId: 'auth-gateway-v2',
          serviceName: 'auth-gateway-v2',
          metric: 'http.5xx_rate',
          operator: '>',
          currentValue: '28.5'
        }
      ],
      deployments: [],
      logs: [],
      traces: []
    }
  },

  // 6. Isolated latency anomaly
  {
    id: 'eval-06-isolated-latency',
    name: 'Search Mesh GC Pause Latency Spike',
    type: 'isolated_latency',
    groundTruth: {
      expectedRootCauseServiceId: 'search-mesh',
      sufficientEvidence: true,
      minScore: 50
    },
    evidence: {
      incident: {
        id: 'INC-EVAL-06',
        title: 'Search Mesh Latency Degradation',
        summary: 'Long GC pauses causing p99 spikes on search queries.',
        serviceId: 'search-mesh',
        startedAt: '13:00:00 UTC'
      },
      services: [
        ...initialServices,
        {
          id: 'search-mesh',
          name: 'search-mesh',
          tier: 1,
          protocol: 'gRPC',
          status: 'degraded',
          latencyP99: 850,
          latencyBaseline: 40,
          errorRate: 0.05,
          rps: 5400,
          dependencies: []
        }
      ],
      alerts: [
        {
          id: 'ALT-LAT-06',
          title: 'Search Mesh p99 Latency Anomaly',
          severity: 'warning',
          state: 'firing',
          serviceId: 'search-mesh',
          serviceName: 'search-mesh',
          metric: 'latency_p99',
          operator: '>',
          currentValue: '850'
        }
      ],
      deployments: [],
      logs: [],
      traces: []
    }
  },

  // 7. Incomplete telemetry
  {
    id: 'eval-07-incomplete-telemetry',
    name: 'Incomplete Telemetry Coverage',
    type: 'incomplete_telemetry',
    groundTruth: {
      expectedRootCauseServiceId: 'payment-service',
      sufficientEvidence: false, // Must be recognized as low-confidence/insufficient
      maxScore: 60
    },
    evidence: {
      incident: {
        id: 'INC-EVAL-07',
        title: 'Intermittent Payment Gateway Errors',
        summary: 'No deployments recorded, traces missing, logs unavailable.',
        serviceId: 'payment-service',
        startedAt: '18:00:00 UTC'
      },
      services: initialServices,
      alerts: [],
      deployments: [],
      logs: [],
      traces: []
    }
  },

  // 8. Ambiguous incident with no convincing cause (False Alarm)
  {
    id: 'eval-08-ambiguous-false-alarm',
    name: 'Ambiguous Incident With No Convincing Cause',
    type: 'false_alarm',
    groundTruth: {
      expectedRootCauseServiceId: null,
      sufficientEvidence: false,
      maxScore: 35
    },
    evidence: {
      incident: {
        id: 'INC-EVAL-08',
        title: 'Synthetic Monitor Latency Jitter',
        summary: 'Single synthetic ping exceeded threshold by 12ms during scheduled network maintenance.',
        serviceId: 'checkout-api',
        startedAt: '03:15:00 UTC'
      },
      services: initialServices.map(s => ({
        ...s,
        status: 'nominal',
        latencyP99: s.latencyBaseline,
        errorRate: 0.01,
        cpuPercent: 20
      })),
      alerts: [],
      deployments: [],
      logs: [],
      traces: []
    }
  }
];

