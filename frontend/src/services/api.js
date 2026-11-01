const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, {
      credentials: 'include',
      ...options,
      headers
    });

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data?.message || data?.error?.message || `Request failed with status ${res.status}`;
      const error = new Error(errorMsg);
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  } catch (err) {
    console.error(`[API Error] ${options.method || 'GET'} ${url}:`, err.message);
    throw err;
  }
}

export const api = {
  // Authentication & RBAC
  login: (credentials) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  }),
  register: (userData) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData)
  }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  getUsers: () => request('/auth/users'),
  updateUserRole: (userId, role) => request(`/auth/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role })
  }),

  // Audit Logs (Admin only)
  getAuditLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/audit-logs${query ? `?${query}` : ''}`);
  },

  // Notifications & Incident Response (Phase 9)
  getNotifications: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/notifications${query ? `?${query}` : ''}`);
  },
  getNotificationById: (id) => request(`/notifications/${id}`),
  retryNotification: (id) => request(`/notifications/${id}/retry`, { method: 'POST' }),
  getNotificationSettings: () => request('/notification-settings'),
  updateNotificationSettings: (updates) => request('/notification-settings', {
    method: 'PATCH',
    body: JSON.stringify(updates)
  }),
  sendTestNotification: (payload) => request('/notifications/test', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Health
  getHealth: () => request('/health'),

  // Services
  getServices: () => request('/services'),
  getServiceById: (id) => request(`/services/${id}`),
  updateService: (id, updates) => request(`/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  }),

  // Incidents
  getIncidents: () => request('/incidents'),
  getIncidentById: (id) => request(`/incidents/${id}`),
  createIncident: (incident) => request('/incidents', {
    method: 'POST',
    body: JSON.stringify(incident)
  }),
  updateIncident: (id, updates) => request(`/incidents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  }),

  // Alerts & Intelligent Rules
  getAlerts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/alerts${query ? `?${query}` : ''}`);
  },
  getAlertById: (id) => request(`/alerts/${id}`),
  acknowledgeAlert: (id) => request(`/alerts/${id}/acknowledge`, { method: 'PATCH' }),
  resolveAlert: (id) => request(`/alerts/${id}/resolve`, { method: 'PATCH' }),
  evaluateAlerts: (payload = {}) => request('/alerts/evaluate', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updateAlert: (id, updates) => request(`/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  }),
  getAlertRules: () => request('/alert-rules'),
  createAlertRule: (rule) => request('/alert-rules', {
    method: 'POST',
    body: JSON.stringify(rule)
  }),
  updateAlertRule: (ruleId, updates) => request(`/alert-rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  }),

  // Telemetry & OpenTelemetry Datasources
  getTelemetry: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/telemetry${query ? `?${query}` : ''}`);
  },
  getTelemetryStatus: () => request('/telemetry/status'),
  setTelemetryMode: (mode) => request('/telemetry/mode', {
    method: 'POST',
    body: JSON.stringify({ mode })
  }),
  getTelemetryMetrics: (query) => request(`/telemetry/metrics${query ? `?query=${encodeURIComponent(query)}` : ''}`),
  getTelemetryTraces: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/telemetry/traces${query ? `?${query}` : ''}`);
  },
  getTelemetryLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/telemetry/logs${query ? `?${query}` : ''}`);
  },

  // Deployments
  getDeployments: () => request('/deployments'),
  updateDeployment: (id, updates) => request(`/deployments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  }),

  // Investigation & RCA
  getInvestigation: (incidentId) => request(`/incidents/${incidentId}/investigation`),
  runInvestigation: (incidentId, payload = {}) => request(`/incidents/${incidentId}/investigation/run`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getIncidentTimeline: (incidentId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/incidents/${incidentId}/timeline${query ? `?${query}` : ''}`);
  },

  // Fault Injection Lab & Benchmark Suite
  getFaultScenarios: () => request('/fault-lab/scenarios'),
  createFaultSimulation: (payload) => request('/fault-lab/simulations', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getFaultSimulation: (simulationId) => request(`/fault-lab/simulations/${simulationId}`),
  investigateFaultSimulation: (simulationId, payload = {}) => request(`/fault-lab/simulations/${simulationId}/investigate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  resetFaultSimulation: (simulationId) => request(`/fault-lab/simulations/${simulationId}/reset`, {
    method: 'POST'
  }),

  // AI Investigation Assistant (Phase 13)
  askAssistant: (incidentId, payload) => request(`/incidents/${incidentId}/assistant/chat`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getAssistantConversations: (incidentId) => request(`/incidents/${incidentId}/assistant/conversations`),
  getConversationById: (conversationId) => request(`/assistant/conversations/${conversationId}`),
  deleteConversation: (conversationId) => request(`/assistant/conversations/${conversationId}`, {
    method: 'DELETE'
  }),

  // Safe Automated Remediation & Runbook Orchestration (Phase 14)
  getRunbooks: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/runbooks${query ? `?${query}` : ''}`);
  },
  getRunbookById: (runbookId) => request(`/runbooks/${runbookId}`),
  getIncidentRunbooks: (incidentId) => request(`/incidents/${incidentId}/runbooks`),
  dryRunIncidentRunbook: (incidentId, runbookId, payload = {}) => request(`/incidents/${incidentId}/runbooks/${runbookId}/dry-run`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  createIncidentExecution: (incidentId, runbookId, payload = {}) => request(`/incidents/${incidentId}/runbooks/${runbookId}/executions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getExecutionById: (executionId) => request(`/runbook-executions/${executionId}`),
  requestApproval: (executionId) => request(`/runbook-executions/${executionId}/request-approval`, {
    method: 'POST'
  }),
  approveExecution: (executionId, payload = {}) => request(`/runbook-executions/${executionId}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  rejectExecution: (executionId, payload = {}) => request(`/runbook-executions/${executionId}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  executeRunbook: (executionId) => request(`/runbook-executions/${executionId}/execute`, {
    method: 'POST'
  }),
  cancelExecution: (executionId, payload = {}) => request(`/runbook-executions/${executionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getExecutionLogs: (executionId) => request(`/runbook-executions/${executionId}/logs`),

  // SLO-Driven Reliability Intelligence (Phase 15)
  getSlos: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/slos${query ? `?${query}` : ''}`);
  },
  getSloById: (sloId) => request(`/slos/${sloId}`),
  createSlo: (payload) => request('/slos', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updateSlo: (sloId, payload) => request(`/slos/${sloId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  deleteSlo: (sloId) => request(`/slos/${sloId}`, {
    method: 'DELETE'
  }),
  evaluateSlo: (sloId, payload = {}) => request(`/slos/${sloId}/evaluate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getSloErrorBudget: (sloId) => request(`/slos/${sloId}/error-budget`),
  getSloBurnRate: (sloId) => request(`/slos/${sloId}/burn-rate`),
  getServiceReliability: (serviceId) => request(`/services/${serviceId}/reliability`),
  getReliabilityOverview: () => request('/reliability/overview'),
  getIncidentSloImpact: (incidentId) => request(`/incidents/${incidentId}/slo-impact`),

  // Deployment Risk & Change Intelligence (Phase 16)
  getChanges: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/changes${query ? `?${query}` : ''}`);
  },
  getChangeById: (changeId) => request(`/changes/${changeId}`),
  createChange: (payload) => request('/changes', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  assessChange: (payload) => request('/changes/assess', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getChangeAssessment: (changeId) => request(`/changes/${changeId}/assessment`),
  getChangeBlastRadius: (changeId) => request(`/changes/${changeId}/blast-radius`),
  getChangeRegressions: (changeId) => request(`/changes/${changeId}/regressions`),
  evaluateChangeRegression: (changeId, payload = {}) => request(`/changes/${changeId}/evaluate-regression`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getServiceChangeHistory: (serviceId) => request(`/services/${serviceId}/change-history`),
  getChangeIntelligenceOverview: () => request('/reliability/change-intelligence'),

  // Unified Observability & Event Correlation (Phase 17)
  getEvents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/events${query ? `?${query}` : ''}`);
  },
  getEventById: (eventId) => request(`/events/${eventId}`),
  ingestEvent: (payload) => request('/events/ingest', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getEventCorrelations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/events/correlations${query ? `?${query}` : ''}`);
  },
  getIncidentUnifiedTimeline: (incidentId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/incidents/${incidentId}/unified-timeline${query ? `?${query}` : ''}`);
  },
  getIncidentInvestigationGraph: (incidentId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/incidents/${incidentId}/investigation-graph${query ? `?${query}` : ''}`);
  },
  getIncidentCorrelationSummary: (incidentId) => request(`/incidents/${incidentId}/correlation-summary`),
  getIncidentEvidence: (incidentId) => request(`/incidents/${incidentId}/evidence`),
  getServiceEventHistory: (serviceId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/services/${serviceId}/event-history${query ? `?${query}` : ''}`);
  },

  // Operational Intelligence & Predictive Incident Prevention (Phase 18)
  getOperationalOverview: () => request('/operations/intelligence/overview'),
  getOperationalPatterns: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/operations/intelligence/patterns${query ? `?${query}` : ''}`);
  },
  getOperationalPatternById: (id) => request(`/operations/intelligence/patterns/${id}`),
  syncOperationalPatterns: () => request('/operations/intelligence/patterns/sync', { method: 'POST' }),
  getServiceRiskProfiles: () => request('/operations/intelligence/service-risks'),
  getServiceRiskProfile: (serviceId) => request(`/operations/intelligence/service-risks/${serviceId}`),
  evaluateServiceRiskProfiles: () => request('/operations/intelligence/service-risks/evaluate', { method: 'POST' }),
  getEarlyWarnings: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/operations/intelligence/early-warnings${query ? `?${query}` : ''}`);
  },
  syncEarlyWarnings: () => request('/operations/intelligence/early-warnings/sync', { method: 'POST' }),
  getPreventiveRecommendations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/operations/intelligence/recommendations${query ? `?${query}` : ''}`);
  },
  getPreventiveRecommendationById: (id) => request(`/operations/intelligence/recommendations/${id}`),
  createPreventiveRecommendation: (payload) => request('/operations/intelligence/recommendations', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  transitionPreventiveRecommendation: (id, payload) => request(`/operations/intelligence/recommendations/${id}/transition`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  getOperationalTrends: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/operations/intelligence/trends${query ? `?${query}` : ''}`);
  },
  captureOperationalTrendSnapshot: (payload = {}) => request('/operations/intelligence/trends/snapshot', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Enterprise Integrations & Platform Ecosystem (Phase 19)
  getIntegrationCatalog: () => request('/integrations/catalog'),
  getIntegrations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/integrations${query ? `?${query}` : ''}`);
  },
  getIntegration: (id) => request(`/integrations/${id}`),
  createIntegration: (payload) => request('/integrations', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updateIntegration: (id, payload) => request(`/integrations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  deleteIntegration: (id) => request(`/integrations/${id}`, { method: 'DELETE' }),
  testIntegration: (id) => request(`/integrations/${id}/test`, { method: 'POST' }),
  getIntegrationHealth: (id) => request(`/integrations/${id}/health`),
  rotateIntegrationCredentials: (id, payload) => request(`/integrations/${id}/rotate-credentials`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getIntegrationDeliveries: (id) => request(`/integrations/${id}/deliveries`),
  retryIntegrationDelivery: (id, deliveryId) => request(`/integrations/${id}/retry/${deliveryId}`, {
    method: 'POST'
  })
,
  // Cloud Resource Lifecycle & Cost Governance (Phase 23C)
  getCloudResources: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/resources${query ? `?${query}` : ''}`);
  },
  getCloudResource: (id) => request(`/cloud/resources/${id}`),
  probeCloudResourceHealth: (id) => request(`/cloud/resources/${id}/health`, { method: 'POST' }),
  getCloudCostEstimate: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/costs/estimate${query ? `?${query}` : ''}`);
  },
  getCloudOperations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/operations${query ? `?${query}` : ''}`);
  },
  dryRunCloudOperation: (payload) => request('/cloud/operations/dry-run', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  requestCloudOperation: (payload) => request('/cloud/operations', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  approveCloudOperation: (id) => request(`/cloud/operations/${id}/approve`, { method: 'POST' }),
  executeCloudOperation: (id, payload = {}) => request(`/cloud/operations/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  checkEc2Eligibility: (id, action = 'stop') => request(`/cloud/resources/${id}/eligibility?action=${action}`),
  checkWorkloadEligibility: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/workloads/${id}/eligibility${query ? `?${query}` : ''}`);
  },
  getDockerContainers: () => request('/cloud/docker/containers'),
  getDockerContainerHealth: (id) => request(`/cloud/docker/containers/${id}/health`),
  getKubernetesWorkloads: () => request('/cloud/kubernetes/workloads'),
  getKubernetesWorkloadHealth: (namespace, name) => request(`/cloud/kubernetes/workloads/${namespace}/${name}/health`),
  cancelCloudOperation: (id, payload = {}) => request(`/cloud/operations/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getCloudSchedules: () => request('/cloud/schedules'),
  createCloudSchedule: (payload) => request('/cloud/schedules', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updateCloudSchedule: (id, payload) => request(`/cloud/schedules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  getCloudKillSwitch: () => request('/cloud/kill-switch'),
  toggleCloudKillSwitch: (payload) => request('/cloud/kill-switch', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getCloudAuditTrail: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/audit${query ? `?${query}` : ''}`);
  },
  getAwsStatus: (region = 'ap-south-1') => request(`/cloud/aws/status?region=${region}`),
  discoverAwsResources: (region = 'ap-south-1') => request('/cloud/aws/discover', {
    method: 'POST',
    body: JSON.stringify({ region })
  }),
  getAwsFreeTierGuidelines: () => request('/cloud/aws/free-tier'),

  // Phase 23G: Infrastructure Drift & Reconciliation
  getDriftEvents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/drifts${query ? `?${query}` : ''}`);
  },
  getDriftStats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/drifts/stats${query ? `?${query}` : ''}`);
  },
  getDriftDetails: (id) => request(`/cloud/drifts/${id}`),
  acknowledgeOrIgnoreDrift: (id, payload) => request(`/cloud/drifts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  triggerDriftDetection: (payload = {}) => request('/cloud/drifts/detect', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getSnapshots: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/snapshots${query ? `?${query}` : ''}`);
  },
  getResourceSnapshots: (resourceId) => request(`/cloud/snapshots/${resourceId}`),
  getActiveBaseline: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/baselines/active${query ? `?${query}` : ''}`);
  },
  getBaselineHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/cloud/baselines/history${query ? `?${query}` : ''}`);
  },
  createBaseline: (payload) => request('/cloud/baselines', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  initializeBaselineFromInventory: (payload = {}) => request('/cloud/baselines/init-inventory', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  previewReconciliationPlan: (payload) => request('/cloud/reconciliations/preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  submitReconciliationRequest: (payload) => request('/cloud/reconciliations/submit', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getReconciliationPlan: (id) => request(`/cloud/reconciliations/${id}`),

  // Phase 23J: Governed Automated Remediation Intelligence
  generateRemediationRecommendations: (incidentId) => request(`/remediation/incidents/${incidentId}/recommendations`, {
    method: 'POST'
  }),
  getRemediationRecommendations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/remediation/recommendations${query ? `?${query}` : ''}`);
  },
  getRemediationRecommendationById: (id) => request(`/remediation/recommendations/${id}`),
  dryRunRemediationPlan: (planId) => request(`/remediation/plans/${planId}/dry-run`, {
    method: 'POST'
  }),
  requestRemediationApproval: (planId, payload = {}) => request(`/remediation/plans/${planId}/request-approval`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  approveRemediationPlan: (approvalId, payload = {}) => request(`/remediation/approvals/${approvalId}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  rejectRemediationPlan: (approvalId, payload = {}) => request(`/remediation/approvals/${approvalId}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  executeRemediationPlan: (planId, payload = {}) => request(`/remediation/plans/${planId}/execute`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getRemediationExecutions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/remediation/executions${query ? `?${query}` : ''}`);
  },
  getRemediationExecutionById: (id) => request(`/remediation/executions/${id}`),
  getRemediationPolicies: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/remediation/policies${query ? `?${query}` : ''}`);
  },
  createRemediationPolicy: (payload) => request('/remediation/policies', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Phase 23K: Autonomous SRE Intelligence
  getSreOverview: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sre-intelligence/overview${query ? `?${query}` : ''}`);
  },
  getSreHealth: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sre-intelligence/health${query ? `?${query}` : ''}`);
  },
  getSrePredictiveRisks: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sre-intelligence/predictive-risks${query ? `?${query}` : ''}`);
  },
  getSreSloSummary: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sre-intelligence/slo-summary${query ? `?${query}` : ''}`);
  },
  getSreCapacityOptimization: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sre-intelligence/capacity-optimization${query ? `?${query}` : ''}`);
  },
  getSreRecommendations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sre-intelligence/recommendations${query ? `?${query}` : ''}`);
  },
  updateSreRecommendationStatus: (id, payload) => request(`/sre-intelligence/recommendations/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),

  // Phase 26: Production Observability & Self-Monitoring
  getSelfMonitoringOverview: () => request('/self-monitoring/overview'),
  getSelfMonitoringAlerts: () => request('/self-monitoring/alerts'),
  getSelfMonitoringSlos: () => request('/self-monitoring/slos'),
};

export default api;
