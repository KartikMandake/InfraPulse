export const initialServices = [
  {
    id: 'payment-service',
    name: 'payment-service',
    tier: 0,
    protocol: 'gRPC',
    status: 'critical',
    latencyP99: 412,
    latencyBaseline: 24,
    errorRate: 4.12,
    rps: 18450,
    podCount: 16,
    region: 'us-east-1',
    namespace: 'payments-core',
    cpuPercent: 88.4,
    memoryPercent: 94.2,
    dependencies: ['ledger-db-proxy', 'fraud-evaluator', 'stripe-bridge'],
    tags: ['env:prod', 'tier:0', 'pci-dss', 'team:fintech'],
    endpoints: [
      { id: 'ep-pay-1', method: 'POST', path: '/v2/payments/authorize', rps: 12400, p50Ms: 48, p99Ms: 412, errorRatePercent: 8.42, status: 'failing' },
      { id: 'ep-pay-2', method: 'POST', path: '/v2/payments/capture', rps: 4200, p50Ms: 22, p99Ms: 38, errorRatePercent: 0.01, status: 'healthy' },
      { id: 'ep-pay-3', method: 'POST', path: '/v2/payments/refund', rps: 420, p50Ms: 18, p99Ms: 24, errorRatePercent: 0.00, status: 'healthy' },
      { id: 'ep-pay-4', method: 'GET', path: '/v2/payments/:id/status', rps: 1430, p50Ms: 8, p99Ms: 14, errorRatePercent: 0.00, status: 'healthy' },
    ],
    pods: [
      { id: 'pod-pay-canary', name: 'payment-service-canary-88a2', status: 'Degraded', cpuPercent: 94, memoryPercent: 98, restarts: 2, version: 'v1.8.3', node: 'ip-10-240-1-12', age: '35m' },
      { id: 'pod-pay-0', name: 'payment-service-stable-9c12-0', status: 'Running', cpuPercent: 62, memoryPercent: 68, restarts: 0, version: 'v1.8.2', node: 'ip-10-240-1-14', age: '4d' },
      { id: 'pod-pay-1', name: 'payment-service-stable-9c12-1', status: 'Running', cpuPercent: 58, memoryPercent: 65, restarts: 0, version: 'v1.8.2', node: 'ip-10-240-1-15', age: '4d' },
      { id: 'pod-pay-2', name: 'payment-service-stable-9c12-2', status: 'Running', cpuPercent: 64, memoryPercent: 71, restarts: 0, version: 'v1.8.2', node: 'ip-10-240-1-16', age: '4d' },
    ]
  },
  {
    id: 'auth-gateway-v2',
    name: 'auth-gateway-v2',
    tier: 0,
    protocol: 'HTTP',
    status: 'degraded',
    latencyP99: 285,
    latencyBaseline: 18,
    errorRate: 2.45,
    rps: 42100,
    podCount: 24,
    region: 'us-east-1',
    namespace: 'security-edge',
    cpuPercent: 91.0,
    memoryPercent: 82.5,
    dependencies: ['redis-session-cache', 'vault-cluster'],
    tags: ['env:prod', 'tier:0', 'edge-gateway'],
    endpoints: [
      { id: 'ep-auth-1', method: 'POST', path: '/oauth/v2/token', rps: 22000, p50Ms: 14, p99Ms: 285, errorRatePercent: 2.45, status: 'degraded' },
      { id: 'ep-auth-2', method: 'GET', path: '/oauth/v2/introspect', rps: 18000, p50Ms: 6, p99Ms: 18, errorRatePercent: 0.01, status: 'healthy' },
      { id: 'ep-auth-3', method: 'GET', path: '/.well-known/jwks.json', rps: 2100, p50Ms: 3, p99Ms: 8, errorRatePercent: 0.00, status: 'healthy' },
    ],
    pods: [
      { id: 'pod-auth-0', name: 'auth-gateway-v2-55a1-0', status: 'Running', cpuPercent: 89, memoryPercent: 81, restarts: 0, version: 'v2.4.1', node: 'ip-10-240-2-10', age: '6d' },
      { id: 'pod-auth-1', name: 'auth-gateway-v2-55a1-1', status: 'Running', cpuPercent: 93, memoryPercent: 84, restarts: 1, version: 'v2.4.1', node: 'ip-10-240-2-11', age: '6d' },
    ]
  },
  {
    id: 'checkout-api',
    name: 'checkout-api',
    tier: 0,
    protocol: 'gRPC',
    status: 'degraded',
    latencyP99: 340,
    latencyBaseline: 45,
    errorRate: 3.10,
    rps: 12200,
    podCount: 14,
    region: 'us-east-1',
    namespace: 'commerce',
    cpuPercent: 74.2,
    memoryPercent: 68.0,
    dependencies: ['payment-service', 'inventory-mesh', 'cart-service'],
    tags: ['env:prod', 'tier:0', 'customer-facing'],
    endpoints: [
      { id: 'ep-chk-1', method: 'POST', path: '/v2/orders/checkout', rps: 8400, p50Ms: 92, p99Ms: 340, errorRatePercent: 3.10, status: 'degraded' },
      { id: 'ep-chk-2', method: 'POST', path: '/v2/orders/preview', rps: 3800, p50Ms: 35, p99Ms: 62, errorRatePercent: 0.02, status: 'healthy' },
    ],
    pods: [
      { id: 'pod-chk-0', name: 'checkout-api-7db94f-0', status: 'Running', cpuPercent: 72, memoryPercent: 67, restarts: 0, version: 'v3.2.0', node: 'ip-10-240-3-10', age: '2d' },
      { id: 'pod-chk-1', name: 'checkout-api-7db94f-1', status: 'Running', cpuPercent: 76, memoryPercent: 69, restarts: 0, version: 'v3.2.0', node: 'ip-10-240-3-11', age: '2d' },
    ]
  },
  {
    id: 'inventory-mesh',
    name: 'inventory-mesh',
    tier: 1,
    protocol: 'gRPC',
    status: 'nominal',
    latencyP99: 22,
    latencyBaseline: 20,
    errorRate: 0.01,
    rps: 8900,
    podCount: 10,
    region: 'us-east-1',
    namespace: 'commerce',
    cpuPercent: 44.0,
    memoryPercent: 55.0,
    dependencies: ['redis-session-cache'],
    tags: ['env:prod', 'tier:1'],
    endpoints: [
      { id: 'ep-inv-1', method: 'gRPC', path: 'inventory.Mesh/CheckStock', rps: 8900, p50Ms: 12, p99Ms: 22, errorRatePercent: 0.01, status: 'healthy' },
    ],
    pods: [
      { id: 'pod-inv-0', name: 'inventory-mesh-44bb-0', status: 'Running', cpuPercent: 42, memoryPercent: 54, restarts: 0, version: 'v1.4.2', node: 'ip-10-240-4-01', age: '12d' },
    ]
  },
  {
    id: 'ledger-db-proxy',
    name: 'ledger-db-proxy',
    tier: 1,
    protocol: 'gRPC',
    status: 'critical',
    latencyP99: 395,
    latencyBaseline: 8,
    errorRate: 5.80,
    rps: 9200,
    podCount: 8,
    region: 'us-east-1',
    namespace: 'finance-data',
    cpuPercent: 96.5,
    memoryPercent: 92.0,
    dependencies: ['aurora-pg-primary'],
    tags: ['env:prod', 'tier:1', 'database-proxy'],
    endpoints: [
      { id: 'ep-led-1', method: 'gRPC', path: 'ledger.Proxy/ExecuteTxn', rps: 9200, p50Ms: 140, p99Ms: 395, errorRatePercent: 5.80, status: 'failing' },
    ],
    pods: [
      { id: 'pod-led-0', name: 'ledger-db-proxy-0', status: 'Degraded', cpuPercent: 96, memoryPercent: 92, restarts: 3, version: 'v2.0.1', node: 'ip-10-240-5-01', age: '1d' },
    ]
  },
  {
    id: 'cart-service',
    name: 'cart-service',
    tier: 1,
    protocol: 'HTTP',
    status: 'nominal',
    latencyP99: 18,
    latencyBaseline: 15,
    errorRate: 0.02,
    rps: 14300,
    podCount: 12,
    region: 'us-east-1',
    namespace: 'commerce',
    cpuPercent: 38.0,
    memoryPercent: 48.0,
    dependencies: ['redis-session-cache'],
    tags: ['env:prod', 'tier:1'],
    endpoints: [
      { id: 'ep-cart-1', method: 'GET', path: '/v1/cart/:userId', rps: 9200, p50Ms: 7, p99Ms: 16, errorRatePercent: 0.01, status: 'healthy' },
      { id: 'ep-cart-2', method: 'POST', path: '/v1/cart/items', rps: 5100, p50Ms: 11, p99Ms: 18, errorRatePercent: 0.02, status: 'healthy' },
    ],
    pods: [
      { id: 'pod-cart-0', name: 'cart-service-99aa-0', status: 'Running', cpuPercent: 36, memoryPercent: 47, restarts: 0, version: 'v2.1.0', node: 'ip-10-240-6-01', age: '14d' },
    ]
  },
  {
    id: 'notification-worker',
    name: 'notification-worker',
    tier: 2,
    protocol: 'Kafka',
    status: 'nominal',
    latencyP99: 14,
    latencyBaseline: 14,
    errorRate: 0.00,
    rps: 6500,
    podCount: 6,
    region: 'us-east-1',
    namespace: 'messaging',
    cpuPercent: 28.0,
    memoryPercent: 41.0,
    dependencies: ['kafka-cluster'],
    tags: ['env:prod', 'tier:2'],
    endpoints: [
      { id: 'ep-notif-1', method: 'gRPC', path: 'notification.Dispatch/SendEmailReceipt', rps: 4500, p50Ms: 8, p99Ms: 14, errorRatePercent: 0.00, status: 'healthy' },
      { id: 'ep-notif-2', method: 'gRPC', path: 'notification.Dispatch/SendPushNotification', rps: 2000, p50Ms: 6, p99Ms: 12, errorRatePercent: 0.00, status: 'healthy' },
    ],
    pods: [
      { id: 'pod-notif-0', name: 'notification-worker-55b-0', status: 'Running', cpuPercent: 27, memoryPercent: 40, restarts: 0, version: 'v1.1.4', node: 'ip-10-240-7-01', age: '20d' },
    ]
  },
  {
    id: 'fraud-evaluator',
    name: 'fraud-evaluator',
    tier: 1,
    protocol: 'gRPC',
    status: 'nominal',
    latencyP99: 38,
    latencyBaseline: 35,
    errorRate: 0.04,
    rps: 7800,
    podCount: 8,
    region: 'us-east-1',
    namespace: 'risk-engine',
    cpuPercent: 52.0,
    memoryPercent: 62.0,
    dependencies: ['risk-model-serving'],
    tags: ['env:prod', 'tier:1', 'ml-inference'],
    endpoints: [
      { id: 'ep-fraud-1', method: 'gRPC', path: 'risk.Evaluator/ScoreTransaction', rps: 7800, p50Ms: 24, p99Ms: 38, errorRatePercent: 0.04, status: 'healthy' },
    ],
    pods: [
      { id: 'pod-fraud-0', name: 'fraud-evaluator-12c-0', status: 'Running', cpuPercent: 51, memoryPercent: 61, restarts: 0, version: 'v3.0.1', node: 'ip-10-240-8-01', age: '8d' },
    ]
  }
];

export let services = [...initialServices];

export function getServices() {
  return services;
}

export function getServiceById(id) {
  return services.find(s => s.id === id);
}

export function updateService(id, updates) {
  const index = services.findIndex(s => s.id === id);
  if (index !== -1) {
    services[index] = { ...services[index], ...updates };
    return services[index];
  }
  return null;
}

export function resetServices() {
  services = [...initialServices];
  return services;
}

