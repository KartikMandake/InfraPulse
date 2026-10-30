export const initialIncidents = [
  {
    id: 'INC-4921',
    title: 'Cascading 504 Gateway Timeouts in Order & Payment Flow following Deployment v1.8.3',
    summary: 'Payment Service HTTP 504 Timeout Surge correlated with deployment v1.8.3 (35m ago). Connection pool exhaustion at 98.4% causing cascading timeouts in checkout API.',
    severity: 'SEV-1',
    status: 'investigating',
    serviceId: 'payment-service',
    serviceName: 'payment-service',
    lead: 'Sarah Chen',
    leadRole: 'Principal SRE',
    channel: '#inc-4921-pool-exhaustion',
    startedAt: '14:34:12 UTC',
    durationMinutes: 42,
    dropRatePercent: 4.12,
    estimatedCostPerMin: 14200,
    sloBreached: true,
    sloCurrent: 95.88,
    sloTarget: 99.90,
    aiConfidencePercent: 88,
    aiHypothesis: 'The sudden p99 latency spike (24ms → 412ms) immediately followed Canary Deploy #1094 (v1.8.3). Distributed tracing confirms 88% of slow traces stall inside the JWT signature validation middleware and HikariCP connection pool lock acquisition.',
    aiRemediationRecommendation: 'Execute Instant Canary Depromotion (depromote canary-88a2 to stable-9c12) and run Runbook RB-209 to expand PostgreSQL connection pool ceiling.',
    canaryVersion: 'v1.8.3-canary',
    stableVersion: 'v1.8.2-stable',
    timeline: [
      { time: '14:22:04 UTC', title: 'Canary Deployment #1094 Triggered', description: 'Argo Rollouts initiated canary rollout for payment-service (v1.8.3, tag @sha256:7f4a). Traffic set to 10%.', source: 'deploy_bot' },
      { time: '14:28:15 UTC', title: 'P99 Latency Anomaly Detected', description: 'Telemetry pipeline recorded p99 jump from 24ms to 184ms on pod payment-service-canary-88a2.', source: 'telemetry_anomaly' },
      { time: '14:32:00 UTC', title: 'HikariCP Pool Saturation Alert Fired', description: 'Active database connections 100/100 reached. Connection acquisition timeout exceeded (5000ms threshold).', source: 'telemetry_anomaly', isKeyMilestone: true },
      { time: '14:34:12 UTC', title: 'Incident INC-4921 Declared (P1 Critical)', description: 'Automatic incident declaration by InfraPulse Copilot after SLO error budget burn rate exceeded 14.4x.', source: 'ai_engine', isKeyMilestone: true },
      { time: '14:36:50 UTC', title: 'AI Root-Cause Attribution Formulated', description: 'Correlation confidence 88%: Thread pool exhaustion correlated with unindexed SQL query in v1.8.3 idempotency layer.', source: 'ai_engine' },
      { time: '14:41:20 UTC', title: 'Engineer Triage & Runbook Activated', description: 'Sarah Chen claimed lead role and initialized Runbook RB-402 (Canary Depromotion).', source: 'engineer_action' },
    ]
  },
  {
    id: 'INC-4919',
    title: 'Kafka Consumer Lag Breach on order-events-pipeline',
    summary: 'Consumer group analytics-worker lag exceeded 250,000 offsets during peak traffic interval in us-east-1.',
    severity: 'SEV-2',
    status: 'mitigating',
    serviceId: 'notification-worker',
    serviceName: 'notification-worker',
    lead: 'Marcus Vance',
    leadRole: 'Staff SRE',
    channel: '#inc-4919-kafka-lag',
    startedAt: '13:10:05 UTC',
    durationMinutes: 126,
    dropRatePercent: 0.15,
    estimatedCostPerMin: 1200,
    sloBreached: false,
    sloCurrent: 99.82,
    sloTarget: 99.90,
    aiConfidencePercent: 92,
    aiHypothesis: 'Worker thread partition unbalance caused by hot seller SKU partition 14.',
    aiRemediationRecommendation: 'Rebalance partition concurrency and scale worker pods from 6 to 12 via Runbook RB-104.',
    timeline: [
      { time: '13:02:10 UTC', title: 'Batch Producer Spike Detected', description: 'Flash sale campaign initiated 24,000 events/sec onto topic checkout.orders.', source: 'telemetry_anomaly' },
      { time: '13:10:05 UTC', title: 'Incident INC-4919 Declared', description: 'Consumer group analytics-worker lag exceeded 250k threshold.', source: 'telemetry_anomaly', isKeyMilestone: true },
      { time: '13:18:40 UTC', title: 'Runbook RB-104 Executed', description: 'Scaled deployment notification-worker to 12 replicas.', source: 'engineer_action' },
    ]
  },
  {
    id: 'INC-4912',
    title: 'Redis Cluster Memory Fragmentation Warning (Node 03)',
    summary: 'Memory fragmentation ratio reached 1.82 on session cache shard 3.',
    severity: 'SEV-3',
    status: 'resolved',
    serviceId: 'auth-gateway-v2',
    serviceName: 'auth-gateway-v2',
    lead: 'David Kim',
    leadRole: 'Platform Lead',
    channel: '#inc-4912-redis-defrag',
    startedAt: '09:45:00 UTC',
    durationMinutes: 35,
    dropRatePercent: 0.00,
    estimatedCostPerMin: 0,
    sloBreached: false,
    sloCurrent: 99.99,
    sloTarget: 99.95,
    aiConfidencePercent: 99,
    aiHypothesis: 'Active defragmentation schedule was deferred during morning peak.',
    aiRemediationRecommendation: 'Run active defragmentation during low-traffic window.',
    timeline: [
      { time: '09:40:00 UTC', title: 'Memory Fragmentation Warning', description: 'Memory frag ratio exceeded 1.80 on Redis shard 3.', source: 'telemetry_anomaly' },
      { time: '09:45:00 UTC', title: 'Incident INC-4912 Declared', description: 'Low priority maintenance ticket created.', source: 'engineer_action' },
      { time: '10:20:00 UTC', title: 'Defrag Completed & Incident Resolved', description: 'Memory compaction completed cleanly. Memory ratio returned to 1.08.', source: 'engineer_action', isKeyMilestone: true },
    ]
  }
];

export let incidents = [...initialIncidents];

export function getIncidents() {
  return incidents;
}

export function getIncidentById(id) {
  return incidents.find(i => i.id === id);
}

export function updateIncident(id, updates) {
  const index = incidents.findIndex(i => i.id === id);
  if (index !== -1) {
    incidents[index] = { ...incidents[index], ...updates };
    return incidents[index];
  }
  return null;
}

export function createIncident(incidentData) {
  const newIncident = {
    id: incidentData.id || `INC-${Math.floor(1000 + Math.random() * 9000)}`,
    title: incidentData.title || 'Untitled Incident',
    summary: incidentData.summary || 'Incident declared manually.',
    severity: incidentData.severity || 'SEV-2',
    status: incidentData.status || 'investigating',
    serviceId: incidentData.serviceId || 'payment-service',
    serviceName: incidentData.serviceName || 'payment-service',
    lead: incidentData.lead || 'On-Call SRE',
    leadRole: incidentData.leadRole || 'Incident Commander',
    channel: incidentData.channel || `#inc-${Math.floor(1000 + Math.random() * 9000)}`,
    startedAt: incidentData.startedAt || new Date().toISOString().substring(11, 19) + ' UTC',
    durationMinutes: incidentData.durationMinutes || 1,
    dropRatePercent: incidentData.dropRatePercent || 0.5,
    estimatedCostPerMin: incidentData.estimatedCostPerMin || 1000,
    sloBreached: incidentData.sloBreached || false,
    sloCurrent: incidentData.sloCurrent || 99.0,
    sloTarget: incidentData.sloTarget || 99.9,
    aiConfidencePercent: 75,
    aiHypothesis: 'Telemetry signals under evaluation.',
    aiRemediationRecommendation: 'Monitor metrics and verify health.',
    timeline: incidentData.timeline || [
      { time: new Date().toISOString().substring(11, 19) + ' UTC', title: 'Incident Declared', description: 'Manual incident declaration.', source: 'engineer_action' }
    ]
  };
  incidents.unshift(newIncident);
  return newIncident;
}

export function resetIncidents() {
  incidents = [...initialIncidents];
  return incidents;
}

