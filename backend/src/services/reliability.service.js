import * as sloRepo from '../repositories/slo.repository.js';
import * as servicesRepo from '../repositories/services.repository.js';
import * as incidentsRepo from '../repositories/incidents.repository.js';
import {
  calculateServiceReliabilityScore,
  analyzeIncidentSloImpact,
  SLO_STATUSES
} from '../engine/sloEngine.js';
import { ApiError } from '../utils/ApiError.js';

export async function getServiceReliability(serviceId) {
  const service = await servicesRepo.findServiceById(serviceId);
  if (!service) throw ApiError.notFound(`Service "${serviceId}" not found.`);

  // 1. Fetch all SLOs for this service
  const slos = await sloRepo.findAllSlos({ serviceId, enabled: true });

  // 2. Fetch latest evaluations for each SLO
  const evaluations = await Promise.all(
    slos.map(s => sloRepo.findLatestEvaluationBySloId(s.id))
  );
  const validEvaluations = evaluations.filter(Boolean);

  // 3. Fetch active incidents for this service
  const allIncidents = await incidentsRepo.findAllIncidents().catch(() => []);
  const activeIncidents = allIncidents.filter(
    inc => (inc.serviceId === serviceId || inc.serviceId === '*') && inc.status !== 'resolved'
  );

  // 4. Calculate deterministic reliability score
  const scoreResult = calculateServiceReliabilityScore({
    slos,
    evaluations: validEvaluations,
    activeIncidents,
    telemetryComplete: true
  });

  const breachedCount = validEvaluations.filter(e => e.status === SLO_STATUSES.BREACHED).length;
  const totalBudgetConsumed = validEvaluations.length > 0
    ? validEvaluations.reduce((sum, e) => sum + Number(e.budgetConsumedPercent), 0) / validEvaluations.length
    : 0;

  // 5. Persist Snapshot
  const snapshot = await sloRepo.createReliabilitySnapshot({
    serviceId,
    reliabilityScore: scoreResult.score,
    status: scoreResult.status,
    trendDirection: scoreResult.trendDirection,
    contributingFactors: scoreResult.contributingFactors,
    recommendations: scoreResult.recommendations,
    dataQuality: scoreResult.dataQuality,
    slosEvaluatedCount: slos.length,
    slosBreachedCount: breachedCount,
    totalBudgetConsumedPercent: Math.round(totalBudgetConsumed * 100) / 100
  });

  return {
    ...snapshot,
    serviceName: service.name,
    slos: slos.map(s => {
      const ev = validEvaluations.find(e => e.sloId === s.id);
      return {
        id: s.id,
        name: s.name,
        targetPercent: s.targetPercent,
        currentPercent: ev?.sliValue ?? null,
        remainingBudgetPercent: ev?.remainingBudgetPercent ?? 100,
        status: ev?.status || SLO_STATUSES.NOMINAL
      };
    })
  };
}

export async function getReliabilityOverview() {
  const [slos, services, incidents, snapshots] = await Promise.all([
    sloRepo.findAllSlos({ enabled: true }),
    servicesRepo.findAllServices().catch(() => []),
    incidentsRepo.findAllIncidents().catch(() => []),
    sloRepo.findAllReliabilitySnapshots()
  ]);

  // Augment with evaluations
  const evaluations = await Promise.all(
    slos.map(s => sloRepo.findLatestEvaluationBySloId(s.id))
  );
  const validEvaluations = evaluations.filter(Boolean);

  const breachedSlos = validEvaluations.filter(e => e.status === SLO_STATUSES.BREACHED);
  const burnWarningSlos = validEvaluations.filter(e => e.status === SLO_STATUSES.BURN_WARNING);
  const nominalSlos = validEvaluations.filter(e => e.status === SLO_STATUSES.NOMINAL);

  let peakBurnRate = 0;
  let totalEvaluatedRequests = 0;
  for (const e of validEvaluations) {
    const b = Math.max(e.burnRate1h || 0, e.burnRate6h || 0);
    if (b > peakBurnRate) peakBurnRate = b;
    totalEvaluatedRequests += Number(e.totalEvents || 0);
  }

  // Calculate average reliability score
  const avgScore = snapshots.length > 0
    ? Math.round(snapshots.reduce((sum, s) => sum + s.reliabilityScore, 0) / snapshots.length)
    : 88;

  // Format total requests nicely (e.g. 209.6M)
  const formatTotalRequests = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return String(num);
  };

  return {
    summary: {
      averageReliabilityScore: avgScore,
      totalSlosConfigured: slos.length,
      breachedSloCount: breachedSlos.length,
      burnWarningCount: burnWarningSlos.length,
      nominalSloCount: nominalSlos.length,
      peakBurnRateMultiplier: peakBurnRate,
      totalEvaluatedRequests: formatTotalRequests(totalEvaluatedRequests),
      activeIncidentsCount: incidents.filter(i => i.status !== 'resolved').length
    },
    servicesReliability: services.map(srv => {
      const snap = snapshots.find(s => s.serviceId === srv.id);
      return {
        serviceId: srv.id,
        serviceName: srv.name,
        score: snap ? snap.reliabilityScore : 90,
        status: snap ? snap.status : 'good',
        trendDirection: snap ? snap.trendDirection : 'stable',
        tier: srv.tier
      };
    })
  };
}

export async function getIncidentSloImpact(incidentId) {
  const incident = await incidentsRepo.findIncidentById(incidentId);
  if (!incident) throw ApiError.notFound(`Incident "${incidentId}" not found.`);

  const slos = await sloRepo.findAllSlos({ enabled: true });
  const evaluations = await Promise.all(
    slos.map(s => sloRepo.findLatestEvaluationBySloId(s.id))
  );

  return analyzeIncidentSloImpact({
    incident,
    slos,
    evaluations: evaluations.filter(Boolean)
  });
}

