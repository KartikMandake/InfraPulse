import {tenantContext} from '../security/tenantContext.js';
/**
 * Alert Rules Management & Rule Evaluation Service
 */

import { ApiError } from '../utils/ApiError.js';
import * as alertRulesRepo from '../repositories/alertRules.repository.js';

export const RULE_TYPES = {
  LATENCY_SPIKE: 'latency_spike',
  ERROR_RATE: 'error_rate',
  HEALTH_CHECK: 'health_check',
  TRAFFIC_DROP: 'traffic_drop',
  DEPENDENCY_TIMEOUT: 'dependency_timeout'
};

export const COMPARISON_OPERATORS = ['>', '>=', '<', '<=', '==', '!='];

export const INITIAL_ALERT_RULES = [
  {
    id: 'RULE-LAT-01',
    name: 'Critical Request Latency Spike',
    description: 'Fires when service p99 latency exceeds 300ms over a 5-minute evaluation window.',
    type: RULE_TYPES.LATENCY_SPIKE,
    targetServiceId: '*',
    metric: 'latencyP99',
    operator: '>',
    threshold: 300,
    windowMinutes: 5,
    severity: 'critical',
    enabled: true,
    cooldownMinutes: 15
  },
  {
    id: 'RULE-ERR-01',
    name: 'Elevated HTTP 5xx Error Rate',
    description: 'Fires when service error rate exceeds 2.0% of total HTTP/gRPC requests.',
    type: RULE_TYPES.ERROR_RATE,
    targetServiceId: '*',
    metric: 'errorRate',
    operator: '>',
    threshold: 2.0,
    windowMinutes: 5,
    severity: 'critical',
    enabled: true,
    cooldownMinutes: 15
  },
  {
    id: 'RULE-HLTH-01',
    name: 'Service Health Status Failure',
    description: 'Fires when a tier-0 or tier-1 service health check reports critical or degraded.',
    type: RULE_TYPES.HEALTH_CHECK,
    targetServiceId: '*',
    metric: 'status',
    operator: '==',
    threshold: 'critical',
    windowMinutes: 3,
    severity: 'critical',
    enabled: true,
    cooldownMinutes: 10
  },
  {
    id: 'RULE-TRF-01',
    name: 'Sudden Traffic Drop (Tier-0)',
    description: 'Fires when throughput on active payment or checkout gateway drops below 1,000 rps.',
    type: RULE_TYPES.TRAFFIC_DROP,
    targetServiceId: 'payment-service',
    metric: 'rps',
    operator: '<',
    threshold: 1000,
    windowMinutes: 5,
    severity: 'warning',
    enabled: true,
    cooldownMinutes: 20
  },
  {
    id: 'RULE-DEP-01',
    name: 'Downstream Dependency Timeout',
    description: 'Fires when checkout API or upstream callers observe upstream timeouts (>250ms p99).',
    type: RULE_TYPES.DEPENDENCY_TIMEOUT,
    targetServiceId: 'checkout-api',
    metric: 'latencyP99',
    operator: '>=',
    threshold: 250,
    windowMinutes: 5,
    severity: 'warning',
    enabled: true,
    cooldownMinutes: 15
  }
];

let alertRulesMem = [...INITIAL_ALERT_RULES];

/**
 * Validates an alert rule schema.
 */
export function validateRule(rule) {
  if (!rule.name || typeof rule.name !== 'string') {
    throw ApiError.badRequest('Rule name is required and must be a string.');
  }
  if (!rule.metric || typeof rule.metric !== 'string') {
    throw ApiError.badRequest('Rule metric is required.');
  }
  if (!rule.operator || !COMPARISON_OPERATORS.includes(rule.operator)) {
    throw ApiError.badRequest(`Invalid operator "${rule.operator}". Allowed operators: ${COMPARISON_OPERATORS.join(', ')}`);
  }
  if (rule.threshold === undefined || rule.threshold === null) {
    throw ApiError.badRequest('Rule threshold is required.');
  }
  if (!['critical', 'warning', 'info'].includes(rule.severity)) {
    throw ApiError.badRequest('Rule severity must be one of: critical, warning, info.');
  }
  return true;
}

/**
 * Get all configured alert rules from DB with in-memory fallback.
 */
export async function getAlertRules() {
  try {
    const rules = await alertRulesRepo.findAllAlertRules();
    if (rules && (rules.length > 0 || tenantContext())) return rules;
  } catch (err) {
    if(tenantContext())throw err;
    console.warn('[AlertRulesService] DB fallback to memory:', err.message);
  }
  return tenantContext()?[]:alertRulesMem;
}

/**
 * Synchronous variant for tests/internal pure functions.
 */
export function getAlertRulesSync() {
  return tenantContext()?[]:alertRulesMem;
}

/**
 * Get single rule by ID.
 */
export async function getAlertRuleById(ruleId) {
  try {
    const rule = await alertRulesRepo.findAlertRuleById(ruleId);
    if (rule) return rule;
  } catch (err) {
    if(tenantContext())throw err;
    console.warn('[AlertRulesService] DB fallback to memory:', err.message);
  }
  return tenantContext()?null:alertRulesMem.find(r => r.id === ruleId) || null;
}

/**
 * Add a new alert rule to DB and memory.
 */
export async function createAlertRule(ruleData) {
  validateRule(ruleData);
  const newRule = {
    id: ruleData.id || `RULE-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
    name: ruleData.name,
    description: ruleData.description || '',
    type: ruleData.type || RULE_TYPES.LATENCY_SPIKE,
    targetServiceId: ruleData.targetServiceId || '*',
    metric: ruleData.metric,
    operator: ruleData.operator,
    threshold: ruleData.threshold,
    windowMinutes: Number(ruleData.windowMinutes) || 5,
    severity: ruleData.severity || 'warning',
    enabled: ruleData.enabled !== undefined ? Boolean(ruleData.enabled) : true,
    cooldownMinutes: Number(ruleData.cooldownMinutes) || 15
  };

  try {
    const saved = await alertRulesRepo.createAlertRuleRecord(newRule);
    if (saved) {
      if(!tenantContext())alertRulesMem.push(saved);
      return saved;
    }
  } catch (err) {
    if(tenantContext())throw err;
    console.warn('[AlertRulesService] DB save fallback:', err.message);
  }

  if(tenantContext())throw new ApiError(503,'Alert rule could not be persisted.');
  alertRulesMem.push(newRule);
  return newRule;
}

/**
 * Update existing alert rule in DB and memory.
 */
export async function updateAlertRule(ruleId, updates) {
  try {
    const updated = await alertRulesRepo.updateAlertRuleRecord(ruleId, updates);
    if (updated) {
      const idx = tenantContext()?-1:alertRulesMem.findIndex(r => r.id === ruleId);
      if (idx !== -1) alertRulesMem[idx] = updated;
      return updated;
    }
  } catch (err) {
    if(tenantContext())throw err;
    console.warn('[AlertRulesService] DB update fallback:', err.message);
  }

  if(tenantContext())throw ApiError.notFound(`Alert rule "${ruleId}" not found.`);
  const index = alertRulesMem.findIndex(r => r.id === ruleId);
  if (index === -1) {
    throw ApiError.notFound(`Alert rule "${ruleId}" not found.`);
  }

  const updatedMem = {
    ...alertRulesMem[index],
    ...updates,
    id: alertRulesMem[index].id
  };
  validateRule(updatedMem);
  alertRulesMem[index] = updatedMem;
  return updatedMem;
}

/**
 * Reset rules in memory.
 */
export function resetAlertRules() {
  alertRulesMem = [...INITIAL_ALERT_RULES];
  return tenantContext()?[]:alertRulesMem;
}

/**
 * Compare observed value against threshold using operator.
 */
export function evaluateCondition(observed, operator, threshold) {
  if (observed === undefined || observed === null) return false;

  const numObs = Number(observed);
  const numThr = Number(threshold);
  const isNumeric = !isNaN(numObs) && !isNaN(numThr);

  switch (operator) {
    case '>':
      return isNumeric ? numObs > numThr : String(observed) > String(threshold);
    case '>=':
      return isNumeric ? numObs >= numThr : String(observed) >= String(threshold);
    case '<':
      return isNumeric ? numObs < numThr : String(observed) < String(threshold);
    case '<=':
      return isNumeric ? numObs <= numThr : String(observed) <= String(threshold);
    case '==':
      return isNumeric ? numObs === numThr : String(observed).toLowerCase() === String(threshold).toLowerCase();
    case '!=':
      return isNumeric ? numObs !== numThr : String(observed).toLowerCase() !== String(threshold).toLowerCase();
    default:
      return false;
  }
}
