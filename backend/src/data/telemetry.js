export const initialLogs = [
  { id: 'log-1', timestamp: '14:41:59.204', level: 'ERROR', service: 'payment-service', serviceId: 'payment-service', message: 'HikariPool-1 - Connection is not available, request timed out after 5002ms (active=100, idle=0, waiting=48)', traceId: '9f81a72049b1', pod: 'payment-service-canary-88a2' },
  { id: 'log-2', timestamp: '14:41:58.891', level: 'ERROR', service: 'checkout-api', serviceId: 'checkout-api', message: 'Upstream gRPC invocation failed status=DEADLINE_EXCEEDED (method=AuthorizePaymentCharge target=payment-service:8080)', traceId: '9f81a72049b1', pod: 'checkout-api-7db94f-0' },
  { id: 'log-3', timestamp: '14:41:57.410', level: 'WARN', service: 'auth-gateway-v2', serviceId: 'auth-gateway-v2', message: 'JWT public key rotation timeout against vault-cluster. Falling back to cached jwks key-set (age: 4m12s)', traceId: '4b12c88401e9', pod: 'auth-gateway-v2-55a1-0' },
  { id: 'log-4', timestamp: '14:41:56.980', level: 'INFO', service: 'telemetry-otlp', serviceId: 'telemetry-otlp', message: 'Flushed batch 89419 spans to ClickHouse storage tier (12ms execution time, 0 dropped)', traceId: '3d901844fa00', pod: 'otel-collector-agent-0' },
  { id: 'log-5', timestamp: '14:41:55.112', level: 'ERROR', service: 'ledger-db-proxy', serviceId: 'ledger-db-proxy', message: 'POOL_EXHAUSTED: client pool max active connections 100/100 reached. Enqueuing caller thread', traceId: '9f81a72049b1', pod: 'ledger-db-proxy-0' }
];

export const initialTraces = [
  {
    id: 'span-001',
    traceId: '9f81a72049b1',
    service: 'checkout-api',
    operation: 'POST /v2/orders/checkout',
    durationMs: 412,
    offsetMs: 0,
    status: 'error',
    httpStatus: 504,
    attributes: {
      'http.method': 'POST',
      'user.tier': 'enterprise',
      'cart.items': 3
    },
    isCriticalPath: true
  },
  {
    id: 'span-002',
    traceId: '9f81a72049b1',
    parentId: 'span-001',
    service: 'auth-gateway-v2',
    operation: 'ValidateToken (JWT RS256)',
    durationMs: 14,
    offsetMs: 5,
    status: 'ok',
    attributes: {
      'jwt.alg': 'RS256',
      'cache.hit': 'true'
    }
  },
  {
    id: 'span-003',
    traceId: '9f81a72049b1',
    parentId: 'span-001',
    service: 'inventory-mesh',
    operation: 'ReserveInventoryReservation',
    durationMs: 22,
    offsetMs: 21,
    status: 'ok',
    attributes: {
      'grpc.status': 'OK',
      'warehouse': 'us-east'
    }
  },
  {
    id: 'span-004',
    traceId: '9f81a72049b1',
    parentId: 'span-001',
    service: 'payment-service',
    operation: 'AuthorizePaymentCharge(txn_77921)',
    durationMs: 365,
    offsetMs: 47,
    status: 'error',
    httpStatus: 504,
    attributes: {
      'canary.pod': 'payment-service-canary-88a2',
      'error.type': 'HikariCP: ConnectionTimeoutException'
    },
    isCriticalPath: true
  },
  {
    id: 'span-005',
    traceId: '9f81a72049b1',
    parentId: 'span-004',
    service: 'ledger-db-proxy',
    operation: 'AcquireConnection & BeginTransaction',
    durationMs: 320,
    offsetMs: 92,
    status: 'error',
    attributes: {
      'pool.active': 100,
      'pool.idle': 0,
      'pool.wait_queue': 44
    },
    isCriticalPath: true
  }
];

export let telemetryLogs = [...initialLogs];
export let telemetryTraces = [...initialTraces];

export function getTelemetryLogs() {
  return telemetryLogs;
}

export function getTelemetryTraces() {
  return telemetryTraces;
}

// Aliases for convenience
export const getLogs = getTelemetryLogs;
export const getTraces = getTelemetryTraces;

export function resetTelemetry() {
  telemetryLogs = [...initialLogs];
  telemetryTraces = [...initialTraces];
  return { logs: telemetryLogs, traces: telemetryTraces };
}

