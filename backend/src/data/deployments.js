export const initialDeployments = [
  {
    id: 'dep-1094',
    serviceName: 'payment-service',
    version: 'v1.8.3',
    environment: 'canary',
    author: 'alex.ross@infrapulse.io',
    commitSha: '7f4a29c',
    commitMessage: 'feat(payments): add idempotency token check with distributed cache lock',
    timestamp: '14:22:04 UTC (35m ago)',
    status: 'unhealthy',
    acaScore: 42,
    canaryTrafficPercent: 10,
    p99CanaryVsStable: { canary: 412, stable: 24 },
    errorRateCanaryVsStable: { canary: 4.12, stable: 0.02 }
  },
  {
    id: 'dep-1093',
    serviceName: 'auth-gateway-v2',
    version: 'v2.4.1',
    environment: 'production',
    author: 'sarah.chen@infrapulse.io',
    commitSha: '9e12bf4',
    commitMessage: 'chore(security): bump jose to v5.9.1 and enable key cache eviction',
    timestamp: '11:15:30 UTC (3h ago)',
    status: 'healthy',
    acaScore: 98,
    canaryTrafficPercent: 100,
    p99CanaryVsStable: { canary: 18, stable: 19 },
    errorRateCanaryVsStable: { canary: 0.01, stable: 0.01 }
  },
  {
    id: 'dep-1092',
    serviceName: 'checkout-api',
    version: 'v3.2.0',
    environment: 'production',
    author: 'marcus.v@infrapulse.io',
    commitSha: '2d8819a',
    commitMessage: 'refactor: streamline checkout payload compression',
    timestamp: 'Yesterday 18:40 UTC',
    status: 'healthy',
    acaScore: 95,
    canaryTrafficPercent: 100,
    p99CanaryVsStable: { canary: 45, stable: 44 },
    errorRateCanaryVsStable: { canary: 0.02, stable: 0.02 }
  }
];

export let deployments = [...initialDeployments];

export function getDeployments() {
  return deployments;
}

export function updateDeployment(id, updates) {
  const index = deployments.findIndex(d => d.id === id);
  if (index !== -1) {
    deployments[index] = { ...deployments[index], ...updates };
    return deployments[index];
  }
  return null;
}

export function resetDeployments() {
  deployments = [...initialDeployments];
  return deployments;
}

