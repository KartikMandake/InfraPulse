import * as sloRepo from '../repositories/slo.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import {
  calculateSliValue,
  calculateErrorBudget,
  calculateBurnRate,
  detectBurnRateAlerts,
  SLI_TYPES,
  SLO_STATUSES,
  DATA_QUALITIES
} from '../engine/sloEngine.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAuditEvent } from './audit.service.js';

export async function listSlos(filters = {}) {
  const slos = await sloRepo.findAllSlos(filters);

  // Augment with latest evaluation and service details
  const augmented = await Promise.all(
    slos.map(async (s) => {
      const evaluation = await sloRepo.findLatestEvaluationBySloId(s.id);
      const service = await servicesRepo.findServiceById(s.serviceId).catch(() => null);

      return {
        ...s,
        serviceName: service?.name || s.serviceId,
        evaluation: evaluation || null,
        currentPercent: evaluation?.sliValue ?? null,
        remainingBudgetPercent: evaluation?.remainingBudgetPercent ?? 100,
        budgetConsumedPercent: evaluation?.budgetConsumedPercent ?? 0,
        burnRateMultiplier: evaluation?.burnRate1h ?? 0,
        status: evaluation?.status ?? SLO_STATUSES.NOMINAL,
        dataQuality: evaluation?.dataQuality ?? DATA_QUALITIES.GOOD
      };
    })
  );

  return augmented;
}

export async function getSloById(sloId) {
  const slo = await sloRepo.findSloById(sloId);
  if (!slo) throw ApiError.notFound(`SLO "${sloId}" was not found.`);

  const [evaluation, history, policy, activeAlerts, service] = await Promise.all([
    sloRepo.findLatestEvaluationBySloId(sloId),
    sloRepo.findErrorBudgetHistory(sloId, 30),
    sloRepo.findAlertPolicyBySloId(sloId),
    sloRepo.findActiveAlertEvents(sloId),
    servicesRepo.findServiceById(slo.serviceId).catch(() => null)
  ]);

  return {
    ...slo,
    serviceName: service?.name || slo.serviceId,
    evaluation,
    budgetHistory: history,
    alertPolicy: policy,
    activeAlerts,
    currentPercent: evaluation?.sliValue ?? null,
    remainingBudgetPercent: evaluation?.remainingBudgetPercent ?? 100,
    budgetConsumedPercent: evaluation?.budgetConsumedPercent ?? 0,
    burnRateMultiplier: evaluation?.burnRate1h ?? 0,
    status: evaluation?.status ?? SLO_STATUSES.NOMINAL,
    dataQuality: evaluation?.dataQuality ?? DATA_QUALITIES.GOOD
  };
}

export async function createSlo(data, user) {
  if (!data.name || !data.serviceId || !data.sliType || !data.sliDefinition || data.targetPercent === undefined) {
    throw ApiError.badRequest('name, serviceId, sliType, sliDefinition, and targetPercent are required.');
  }

  const target = Number(data.targetPercent);
  if (isNaN(target) || target <= 0 || target >= 100) {
    throw ApiError.badRequest(`Target percentage must be between 0 and 100 (received: ${data.targetPercent}).`);
  }

  if (data.sliType === SLI_TYPES.LATENCY && (!data.latencyThresholdMs || data.latencyThresholdMs <= 0)) {
    throw ApiError.badRequest('latencyThresholdMs is required and must be > 0 for latency SLIs.');
  }

  const id = data.id || `slo-${data.serviceId}-${data.sliType}-${Date.now().toString(36)}`;
  const created = await sloRepo.createSlo({
    ...data,
    id,
    targetPercent: target
  });

  // Create default alert policy
  await sloRepo.createAlertPolicy({
    sloId: created.id,
    fastBurnThreshold: 14.4,
    slowBurnThreshold: 3.0,
    exhaustionThreshold: 1.0,
    minEventsRequired: 50,
    cooldownMinutes: 30
  });

  // Perform initial baseline evaluation
  await evaluateSlo(created.id);

  await recordAuditEvent({
    actor: user,
    action: 'SLO_CREATED',
    resourceType: 'slo',
    resourceId: created.id,
    outcome: 'success',
    metadata: { name: created.name, targetPercent: created.targetPercent, sliType: created.sliType }
  }).catch(() => {});

  return getSloById(created.id);
}

export async function updateSlo(sloId, updates, user) {
  const existing = await sloRepo.findSloById(sloId);
  if (!existing) throw ApiError.notFound(`SLO "${sloId}" was not found.`);

  if (updates.targetPercent !== undefined) {
    const target = Number(updates.targetPercent);
    if (isNaN(target) || target <= 0 || target >= 100) {
      throw ApiError.badRequest('targetPercent must be between 0 and 100.');
    }
    updates.targetPercent = target;
  }

  const updated = await sloRepo.updateSlo(sloId, updates);

  // If target or parameters changed, re-evaluate
  await evaluateSlo(sloId);

  await recordAuditEvent({
    actor: user,
    action: 'SLO_UPDATED',
    resourceType: 'slo',
    resourceId: sloId,
    outcome: 'success',
    metadata: { updates: Object.keys(updates) }
  }).catch(() => {});

  return getSloById(sloId);
}

export async function deleteSlo(sloId, user) {
  const existing = await sloRepo.findSloById(sloId);
  if (!existing) throw ApiError.notFound(`SLO "${sloId}" was not found.`);

  await sloRepo.deleteSlo(sloId);

  await recordAuditEvent({
    actor: user,
    action: 'SLO_DELETED',
    resourceType: 'slo',
    resourceId: sloId,
    outcome: 'success',
    metadata: { name: existing.name }
  }).catch(() => {});

  return { success: true, id: sloId };
}

export async function evaluateSlo(sloId, options = {}) {
  const slo = await sloRepo.findSloById(sloId);
  if (!slo) throw ApiError.notFound(`SLO "${sloId}" was not found.`);

  const now = new Date();
  const windowDays = Number(slo.rollingWindowDays) || 30;
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // Fetch service telemetry metrics
  const service = await servicesRepo.findServiceById(slo.serviceId).catch(() => null);

  let totalEvents = options.totalEvents;
  let goodEvents = options.goodEvents;
  let badEvents = options.badEvents;
  let dataQuality = DATA_QUALITIES.GOOD;
  let isSimulated = true;

  if (totalEvents === undefined) {
    // Generate realistic telemetry metrics based on service profile
    const rps = service?.rps || 100;
    // Rolling 30d request volume approximation
    totalEvents = Math.max(100, Math.round(rps * 60 * 60 * 24 * Math.min(windowDays, 30)));

    if (slo.sliType === SLI_TYPES.AVAILABILITY) {
      const errorRate = Number(service?.errorRate) || 0.1;
      badEvents = Math.round(totalEvents * (errorRate / 100));
      goodEvents = totalEvents - badEvents;
    } else if (slo.sliType === SLI_TYPES.LATENCY) {
      const p99 = Number(service?.latencyP99) || 45;
      const threshold = Number(slo.latencyThresholdMs) || 150;
      const ratioOver = p99 > threshold ? Math.min(0.20, (p99 - threshold) / (threshold * 2)) : 0.001;
      badEvents = Math.round(totalEvents * ratioOver);
      goodEvents = totalEvents - badEvents;
    } else if (slo.sliType === SLI_TYPES.ERROR_RATE) {
      const errorRate = Number(service?.errorRate) || 0.05;
      badEvents = Math.round(totalEvents * (errorRate / 100));
      goodEvents = totalEvents - badEvents;
    } else {
      // Throughput
      goodEvents = Math.round(totalEvents * 0.999);
      badEvents = totalEvents - goodEvents;
    }
  }

  // 1. Calculate SLI Value
  const sliResult = calculateSliValue(slo.sliType, {
    totalEvents,
    goodEvents,
    badEvents
  });

  // 2. Calculate Error Budget
  const budgetResult = calculateErrorBudget({
    targetPercent: slo.targetPercent,
    totalEvents,
    goodEvents,
    badEvents
  });

  // 3. Multi-window Burn Rates (1h, 6h, 24h)
  const burnRate1h = calculateBurnRate({
    totalEvents,
    badEvents: Math.round(badEvents * 1.5), // weighted for recent peak
    targetPercent: slo.targetPercent
  });
  const burnRate6h = calculateBurnRate({
    totalEvents,
    badEvents: Math.round(badEvents * 1.1),
    targetPercent: slo.targetPercent
  });
  const burnRate24h = calculateBurnRate({
    totalEvents,
    badEvents,
    targetPercent: slo.targetPercent
  });

  // 4. Persist Evaluation
  const evaluation = await sloRepo.createEvaluation({
    sloId: slo.id,
    evaluatedAt: now.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    totalEvents,
    goodEvents,
    badEvents,
    sliValue: sliResult.sliValue,
    targetPercent: slo.targetPercent,
    errorBudgetPercent: budgetResult.errorBudgetPercent,
    allowedBadEvents: budgetResult.allowedBadEvents,
    remainingBudgetPercent: budgetResult.remainingBudgetPercent,
    budgetConsumedPercent: budgetResult.budgetConsumedPercent,
    burnRate1h,
    burnRate6h,
    burnRate24h,
    status: budgetResult.status,
    dataQuality: options.dataQuality || budgetResult.dataQuality,
    isSimulated,
    telemetrySource: 'demo_adapter'
  });

  // 5. Persist History Point
  await sloRepo.createErrorBudgetHistory({
    sloId: slo.id,
    timestamp: now.toISOString(),
    budgetRemainingPercent: budgetResult.remainingBudgetPercent,
    burnRate: burnRate1h,
    badEventsDelta: badEvents
  });

  // 6. Evaluate Burn-Rate Alert Triggers
  const policy = await sloRepo.findAlertPolicyBySloId(slo.id);
  const activeAlerts = await sloRepo.findActiveAlertEvents(slo.id);

  if (policy && policy.enabled) {
    const triggeredAlerts = detectBurnRateAlerts({
      slo,
      evaluation,
      policy,
      activeAlerts
    });

    for (const alt of triggeredAlerts) {
      await sloRepo.createAlertEvent(alt);
    }
  }

  return evaluation;
}

export async function getErrorBudget(sloId) {
  const slo = await sloRepo.findSloById(sloId);
  if (!slo) throw ApiError.notFound(`SLO "${sloId}" was not found.`);

  const [evaluation, history] = await Promise.all([
    sloRepo.findLatestEvaluationBySloId(sloId),
    sloRepo.findErrorBudgetHistory(sloId, 30)
  ]);

  return {
    sloId: slo.id,
    sloName: slo.name,
    targetPercent: slo.targetPercent,
    errorBudgetPercent: evaluation?.errorBudgetPercent || (100 - slo.targetPercent),
    allowedBadEvents: evaluation?.allowedBadEvents || 0,
    observedBadEvents: evaluation?.badEvents || 0,
    remainingBudgetPercent: evaluation?.remainingBudgetPercent ?? 100,
    budgetConsumedPercent: evaluation?.budgetConsumedPercent ?? 0,
    status: evaluation?.status || SLO_STATUSES.NOMINAL,
    history
  };
}

export async function getBurnRate(sloId) {
  const slo = await sloRepo.findSloById(sloId);
  if (!slo) throw ApiError.notFound(`SLO "${sloId}" was not found.`);

  const [evaluation, activeAlerts, policy] = await Promise.all([
    sloRepo.findLatestEvaluationBySloId(sloId),
    sloRepo.findActiveAlertEvents(sloId),
    sloRepo.findAlertPolicyBySloId(sloId)
  ]);

  return {
    sloId: slo.id,
    sloName: slo.name,
    multiWindowBurnRates: {
      burnRate1h: evaluation?.burnRate1h || 0,
      burnRate6h: evaluation?.burnRate6h || 0,
      burnRate24h: evaluation?.burnRate24h || 0
    },
    policy: policy || null,
    activeAlerts: activeAlerts || []
  };
}

