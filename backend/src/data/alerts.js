export const initialAlerts = [
  {
    id: 'ALT-1092',
    ruleId: 'RULE-LAT-01',
    title: 'HikariCP Connection Pool Exhaustion (>95% active)',
    severity: 'critical',
    status: 'active',
    state: 'firing', // backward compatibility
    serviceId: 'payment-service',
    serviceName: 'payment-service',
    region: 'us-east-1',
    metric: 'hikaricp.active_connections / max_connections',
    operator: '>=',
    threshold: '0.95',
    currentValue: '1.00 (100/100)',
    observedValue: 1.0,
    firedAt: '14:32:00 UTC',
    triggeredAt: new Date(Date.now() - 35 * 60000).toISOString(),
    acknowledgedAt: null,
    resolvedAt: null,
    incidentId: 'INC-4921',
    occurrenceCount: 3,
    source: 'rule_evaluator',
    evidenceRefs: [
      { type: 'log', id: 'log-1', description: 'Connection timeout after 5002ms' },
      { type: 'trace', id: 'span-004', description: 'AuthorizePaymentCharge stalled on DB acquire' }
    ]
  },
  {
    id: 'ALT-1093',
    ruleId: 'RULE-ERR-01',
    title: 'HTTP 504 Gateway Timeout Rate Spike (>2.0%)',
    severity: 'critical',
    status: 'active',
    state: 'firing',
    serviceId: 'checkout-api',
    serviceName: 'checkout-api',
    region: 'us-east-1',
    metric: 'http.server.requests.rate(status=504)',
    operator: '>',
    threshold: '0.02',
    currentValue: '0.0412 (4.12%)',
    observedValue: 0.0412,
    firedAt: '14:33:18 UTC',
    triggeredAt: new Date(Date.now() - 33 * 60000).toISOString(),
    acknowledgedAt: null,
    resolvedAt: null,
    incidentId: 'INC-4921',
    occurrenceCount: 2,
    source: 'rule_evaluator',
    evidenceRefs: [
      { type: 'log', id: 'log-2', description: 'Upstream gRPC invocation failed status=DEADLINE_EXCEEDED' }
    ]
  },
  {
    id: 'ALT-1088',
    ruleId: 'RULE-LAT-01',
    title: 'JWT Token Validation Latency Elevation (p99 > 250ms)',
    severity: 'warning',
    status: 'active',
    state: 'firing',
    serviceId: 'auth-gateway-v2',
    serviceName: 'auth-gateway-v2',
    region: 'us-east-1',
    metric: 'auth.jwt.validation.duration_ms(p99)',
    operator: '>',
    threshold: '250',
    currentValue: '285ms',
    observedValue: 285,
    firedAt: '14:26:40 UTC',
    triggeredAt: new Date(Date.now() - 40 * 60000).toISOString(),
    acknowledgedAt: null,
    resolvedAt: null,
    incidentId: null,
    occurrenceCount: 1,
    source: 'rule_evaluator',
    evidenceRefs: [
      { type: 'log', id: 'log-3', description: 'JWT public key rotation timeout against vault-cluster' }
    ]
  },
  {
    id: 'ALT-1075',
    ruleId: 'RULE-ERR-01',
    title: 'Kafka Consumer Lag High (Topic: checkout.orders)',
    severity: 'warning',
    status: 'acknowledged',
    state: 'acknowledged',
    serviceId: 'notification-worker',
    serviceName: 'notification-worker',
    region: 'us-east-1',
    metric: 'kafka.consumer.lag_records',
    operator: '>',
    threshold: '100000',
    currentValue: '254820',
    observedValue: 254820,
    firedAt: '13:10:05 UTC',
    triggeredAt: new Date(Date.now() - 110 * 60000).toISOString(),
    acknowledgedAt: new Date(Date.now() - 90 * 60000).toISOString(),
    resolvedAt: null,
    incidentId: 'INC-4919',
    occurrenceCount: 4,
    source: 'rule_evaluator',
    evidenceRefs: []
  },
  {
    id: 'ALT-1050',
    ruleId: 'RULE-HLTH-01',
    title: 'Kubernetes Memory Limit Pressure (>85% limit)',
    severity: 'info',
    status: 'active',
    state: 'silenced',
    serviceId: 'inventory-mesh',
    serviceName: 'inventory-mesh',
    region: 'us-east-1',
    metric: 'container.memory.usage / limit',
    operator: '>',
    threshold: '0.85',
    currentValue: '0.862',
    observedValue: 0.862,
    firedAt: '12:00:10 UTC',
    triggeredAt: new Date(Date.now() - 180 * 60000).toISOString(),
    acknowledgedAt: null,
    resolvedAt: null,
    silenceDuration: '2h remaining',
    incidentId: null,
    occurrenceCount: 1,
    source: 'rule_evaluator',
    evidenceRefs: []
  }
];

export let alerts = [...initialAlerts];

export function getAlerts(filters = {}) {
  let result = [...alerts];
  if (filters.status) {
    result = result.filter(a => a.status === filters.status || (filters.status === 'active' && a.state === 'firing'));
  }
  if (filters.state) {
    result = result.filter(a => a.state === filters.state || a.status === filters.state);
  }
  if (filters.severity) {
    result = result.filter(a => a.severity.toLowerCase() === filters.severity.toLowerCase());
  }
  if (filters.serviceId) {
    result = result.filter(a => a.serviceId === filters.serviceId);
  }
  if (filters.incidentId) {
    result = result.filter(a => a.incidentId === filters.incidentId);
  }
  return result;
}

export function getAlertById(id) {
  return alerts.find(a => a.id === id) || null;
}

export function addAlert(alertData) {
  const newAlert = {
    id: alertData.id || `ALT-${Math.floor(1000 + Math.random() * 9000)}`,
    ruleId: alertData.ruleId || 'RULE-CUSTOM',
    title: alertData.title || 'Untitled Alert',
    severity: alertData.severity || 'warning',
    status: alertData.status || 'active',
    state: alertData.status === 'active' ? 'firing' : (alertData.status || 'firing'),
    serviceId: alertData.serviceId,
    serviceName: alertData.serviceName || alertData.serviceId,
    region: alertData.region || 'us-east-1',
    metric: alertData.metric || 'unknown',
    operator: alertData.operator || '>',
    threshold: String(alertData.threshold || '0'),
    currentValue: String(alertData.currentValue || alertData.observedValue || '0'),
    observedValue: alertData.observedValue !== undefined ? alertData.observedValue : null,
    firedAt: alertData.firedAt || new Date().toISOString().substring(11, 19) + ' UTC',
    triggeredAt: alertData.triggeredAt || new Date().toISOString(),
    acknowledgedAt: alertData.acknowledgedAt || null,
    resolvedAt: alertData.resolvedAt || null,
    incidentId: alertData.incidentId || null,
    occurrenceCount: alertData.occurrenceCount || 1,
    source: alertData.source || 'rule_evaluator',
    evidenceRefs: alertData.evidenceRefs || []
  };
  alerts.unshift(newAlert);
  return newAlert;
}

export function updateAlert(id, updates) {
  const index = alerts.findIndex(a => a.id === id);
  if (index !== -1) {
    // Keep status and state synchronized
    let computedStatus = updates.status || alerts[index].status;
    let computedState = updates.state || alerts[index].state;

    if (updates.status && !updates.state) {
      computedState = updates.status === 'active' ? 'firing' : updates.status;
    } else if (updates.state && !updates.status) {
      computedStatus = updates.state === 'firing' ? 'active' : updates.state;
    }

    alerts[index] = {
      ...alerts[index],
      ...updates,
      status: computedStatus,
      state: computedState
    };
    return alerts[index];
  }
  return null;
}

export function resetAlerts() {
  alerts = [...initialAlerts];
  return alerts;
}
