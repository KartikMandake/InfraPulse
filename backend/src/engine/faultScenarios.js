/**
 * Supported fault types and their configuration rules
 */
export const FAULT_TYPES = {
  LATENCY_SPIKE: 'latency_spike',
  HTTP_5XX_SURGE: 'http_5xx_surge',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  DATABASE_SLOWDOWN: 'database_slowdown',
  DEPENDENCY_TIMEOUT: 'dependency_timeout'
};

export const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Reusable backend fault scenarios for the Fault Injection Lab.
 */
export const FAULT_SCENARIOS = [
  {
    id: 'scenario-latency-spike',
    title: 'Idempotency Cache Miss Latency Surge',
    faultType: FAULT_TYPES.LATENCY_SPIKE,
    defaultSeverity: SEVERITY_LEVELS.CRITICAL,
    targetServiceId: 'payment-service',
    description: 'Simulates a critical latency surge in the payment authorization pathway due to cache lock contention.',
    expectedRootCauseServiceId: 'payment-service',
    expectedDownstreamAffected: ['checkout-api'],
    propagationMultiplier: 0.65,
    parameters: {
      latencyMultiplier: 12.5,
      errorRateIncrease: 3.5,
      cpuIncrease: 30
    }
  },
  {
    id: 'scenario-http-5xx-surge',
    title: 'Auth Gateway JWKS Validation HTTP 5xx Surge',
    faultType: FAULT_TYPES.HTTP_5XX_SURGE,
    defaultSeverity: SEVERITY_LEVELS.HIGH,
    targetServiceId: 'auth-gateway-v2',
    description: 'Simulates a surge in HTTP 500/502 errors when verifying external identity tokens at the ingress gateway.',
    expectedRootCauseServiceId: 'auth-gateway-v2',
    expectedDownstreamAffected: ['checkout-api'],
    propagationMultiplier: 0.5,
    parameters: {
      latencyMultiplier: 4.0,
      errorRateIncrease: 18.2,
      cpuIncrease: 15
    }
  },
  {
    id: 'scenario-service-unavailable',
    title: 'Fraud Evaluator CrashLoop Service Unavailable',
    faultType: FAULT_TYPES.SERVICE_UNAVAILABLE,
    defaultSeverity: SEVERITY_LEVELS.CRITICAL,
    targetServiceId: 'fraud-evaluator',
    description: 'Simulates complete pod crashlooping and connection refusal in the real-time risk scoring engine.',
    expectedRootCauseServiceId: 'fraud-evaluator',
    expectedDownstreamAffected: ['payment-service', 'checkout-api'],
    propagationMultiplier: 0.8,
    parameters: {
      latencyMultiplier: 8.0,
      errorRateIncrease: 25.0,
      podStatus: 'CrashLoopBackOff'
    }
  },
  {
    id: 'scenario-database-slowdown',
    title: 'Ledger DB Proxy Connection Pool Lockup',
    faultType: FAULT_TYPES.DATABASE_SLOWDOWN,
    defaultSeverity: SEVERITY_LEVELS.CRITICAL,
    targetServiceId: 'ledger-db-proxy',
    description: 'Simulates severe PostgreSQL connection pool saturation and query queuing on the ledger proxy layer.',
    expectedRootCauseServiceId: 'ledger-db-proxy',
    expectedDownstreamAffected: ['payment-service', 'checkout-api'],
    propagationMultiplier: 0.75,
    parameters: {
      latencyMultiplier: 15.0,
      errorRateIncrease: 7.8,
      memoryIncrease: 40
    }
  },
  {
    id: 'scenario-dependency-timeout',
    title: 'Inventory Mesh Catalog Timeout',
    faultType: FAULT_TYPES.DEPENDENCY_TIMEOUT,
    defaultSeverity: SEVERITY_LEVELS.HIGH,
    targetServiceId: 'inventory-mesh',
    description: 'Simulates upstream gRPC client timeouts while evaluating warehouse inventory reservations during checkout.',
    expectedRootCauseServiceId: 'inventory-mesh',
    expectedDownstreamAffected: ['checkout-api'],
    propagationMultiplier: 0.6,
    parameters: {
      latencyMultiplier: 9.0,
      errorRateIncrease: 5.5
    }
  }
];

