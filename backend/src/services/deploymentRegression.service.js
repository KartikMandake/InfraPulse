import crypto from 'node:crypto';
import {tenantContext} from '../security/tenantContext.js';
import * as changeRepo from '../repositories/change.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import * as sloRepo from '../repositories/slo.repository.js';
import * as alertsRepo from '../repositories/alerts.repository.js';
import * as incidentsRepo from '../repositories/incidents.repository.js';
import { initialServices } from '../data/services.js';
import { ApiError } from '../utils/ApiError.js';

export async function evaluateDeploymentRegressions(changeId, options = {}) {
  const changeEvent = await changeRepo.findChangeEventById(changeId);
  if (!changeEvent) throw ApiError.notFound(`Change event "${changeId}" not found.`);

  const serviceId = changeEvent.service_id;
  const observationWindowMinutes = options.observationWindowMinutes || 30;

  // 1. Fetch current service telemetry
  let service = null;
  try {
    service = await servicesRepo.findServiceById(serviceId);
  } catch (error) {
    if(tenantContext())throw error;
    service = initialServices.find(s => s.id === serviceId);
  }
  if (!service) service = tenantContext()?null:initialServices.find(s => s.id === serviceId);
  if(!service&&tenantContext())throw ApiError.notFound('Deployment service not found.');

  // Fallback metric values from service or initial data
  const currentLatency = Number(options.currentLatency ?? service?.latencyP99 ?? service?.latency_p99 ?? 24);
  const baselineLatency = Number(options.baselineLatency ?? service?.latencyBaseline ?? service?.latency_baseline ?? 20);

  const currentErrorRate = Number(options.currentErrorRate ?? service?.errorRate ?? service?.error_rate ?? 0.02);
  const baselineErrorRate = Number(options.baselineErrorRate ?? 0.02);

  const currentRps = Number(options.currentRps ?? service?.rps ?? 1000);
  const baselineRps = Number(options.baselineRps ?? 1000);

  // 2. Fetch SLO burn rate if applicable
  let sloBurnRate = 0;
  try {
    const slos = await sloRepo.findAllSlos({ serviceId, enabled: true });
    if (slos.length > 0) {
      const latestEval = await sloRepo.findLatestEvaluationBySloId(slos[0].id);
      if (latestEval) {
        sloBurnRate = Number(latestEval.burnRate1h || latestEval.burn_rate_1h || 0);
      }
    }
  } catch {
    sloBurnRate = 0;
  }

  // 3. Fetch related alerts & incidents
  let relatedAlerts = [];
  try {
    const allAlerts = await alertsRepo.findAllAlerts({ serviceId, status: 'active' }).catch(() => []);
    relatedAlerts = (allAlerts || []).map(a => a.id || a.title);
  } catch {
    relatedAlerts = [];
  }

  let relatedIncidents = [];
  try {
    const allIncidents = await incidentsRepo.findAllIncidents().catch(() => []);
    relatedIncidents = (allIncidents || [])
      .filter(i => (i.serviceId === serviceId || i.service_id === serviceId) && i.status !== 'resolved')
      .map(i => i.id);
  } catch {
    relatedIncidents = [];
  }

  const detectedRegressions = [];

  // Latency Evaluation
  const latencyDelta = currentLatency - baselineLatency;
  const latencyDeltaPercent = baselineLatency > 0 ? (latencyDelta / baselineLatency) * 100 : 0;
  if (latencyDeltaPercent >= 25 || latencyDelta >= 50) {
    const isCritical = latencyDeltaPercent >= 100 || latencyDelta >= 150;
    detectedRegressions.push({
      metricName: 'latency_p99',
      baselineValue: baselineLatency,
      currentValue: currentLatency,
      deltaPercent: Number(latencyDeltaPercent.toFixed(2)),
      regressionSeverity: isCritical ? 'critical' : 'warning',
      observationWindowMinutes,
      temporalAssociation: true,
      causalityStatus: 'correlated_temporal',
      evidenceQuality: 'good',
      relatedIncidents,
      relatedAlerts,
      explanation: `Observed p99 latency regression (${baselineLatency}ms -> ${currentLatency}ms, +${latencyDeltaPercent.toFixed(1)}%) in "${service?.name || serviceId}" within ${observationWindowMinutes}m post-deployment. Represents temporal correlation; causal attribution requires tracing error logs and execution stack traces.`
    });
  }

  // Error Rate Evaluation
  const errorRateDelta = currentErrorRate - baselineErrorRate;
  const errorRateDeltaPercent = baselineErrorRate > 0 ? (errorRateDelta / baselineErrorRate) * 100 : 0;
  if (currentErrorRate >= 1.0 || errorRateDeltaPercent >= 100) {
    const isCritical = currentErrorRate >= 3.0;
    detectedRegressions.push({
      metricName: 'error_rate',
      baselineValue: baselineErrorRate,
      currentValue: currentErrorRate,
      deltaPercent: Number(errorRateDeltaPercent.toFixed(2)),
      regressionSeverity: isCritical ? 'critical' : 'warning',
      observationWindowMinutes,
      temporalAssociation: true,
      causalityStatus: 'correlated_temporal',
      evidenceQuality: 'good',
      relatedIncidents,
      relatedAlerts,
      explanation: `Observed error rate spike (${baselineErrorRate}% -> ${currentErrorRate}%, +${errorRateDeltaPercent.toFixed(1)}%) post-deployment. Correlated with deployment timestamp, not yet proven causal.`
    });
  }

  // Throughput Drop Evaluation
  if (baselineRps > 200 && currentRps < baselineRps * 0.7) {
    const rpsDropPercent = ((baselineRps - currentRps) / baselineRps) * 100;
    detectedRegressions.push({
      metricName: 'throughput_rps',
      baselineValue: baselineRps,
      currentValue: currentRps,
      deltaPercent: Number((-rpsDropPercent).toFixed(2)),
      regressionSeverity: 'warning',
      observationWindowMinutes,
      temporalAssociation: true,
      causalityStatus: 'correlated_temporal',
      evidenceQuality: 'good',
      relatedIncidents,
      relatedAlerts,
      explanation: `Observed ${rpsDropPercent.toFixed(1)}% drop in RPS (${baselineRps} -> ${currentRps}) post-deployment. Possible connection pool exhaustion or ingress routing anomaly.`
    });
  }

  // SLO Burn Rate Increase
  if (sloBurnRate >= 3.0) {
    const isCritical = sloBurnRate >= 14.4;
    detectedRegressions.push({
      metricName: 'slo_burn_rate_1h',
      baselineValue: 1.0,
      currentValue: sloBurnRate,
      deltaPercent: Number(((sloBurnRate - 1.0) * 100).toFixed(2)),
      regressionSeverity: isCritical ? 'critical' : 'warning',
      observationWindowMinutes,
      temporalAssociation: true,
      causalityStatus: 'correlated_temporal',
      evidenceQuality: 'good',
      relatedIncidents,
      relatedAlerts,
      explanation: `Post-deployment 1h SLO burn rate accelerated to ${sloBurnRate}x normal consumption (${isCritical ? 'FAST BURN 14.4x' : 'SLOW BURN 3.0x'}).`
    });
  }

  // Persist into database
  const savedRegressions = [];
  for (const reg of detectedRegressions) {
    const regId = `reg-${crypto.randomUUID().substring(0, 8)}`;
    try {
      const saved = await changeRepo.createDeploymentRegression({
        id: regId,
        changeId,
        serviceId,
        metricName: reg.metricName,
        baselineValue: reg.baselineValue,
        currentValue: reg.currentValue,
        deltaPercent: reg.deltaPercent,
        regressionSeverity: reg.regressionSeverity,
        observationWindowMinutes: reg.observationWindowMinutes,
        temporalAssociation: reg.temporalAssociation,
        causalityStatus: reg.causalityStatus,
        evidenceQuality: reg.evidenceQuality,
        relatedIncidents: reg.relatedIncidents,
        relatedAlerts: reg.relatedAlerts,
        explanation: reg.explanation,
        detectedAt: new Date().toISOString()
      });
      savedRegressions.push(saved);
    } catch (err) {
      console.warn('[DeploymentRegressionService] DB save regression fallback:', err.message);
      savedRegressions.push({ id: regId, ...reg });
    }
  }

  return {
    changeId,
    serviceId,
    observationWindowMinutes,
    regressionsDetectedCount: savedRegressions.length,
    hasRegressions: savedRegressions.length > 0,
    regressions: savedRegressions
  };
}

export async function getRegressionsForChange(changeId) {
  return changeRepo.findRegressionsByChangeId(changeId);
}
