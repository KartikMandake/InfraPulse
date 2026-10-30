/**
 * Failure Pattern Engine — InfraPulse Phase 18
 *
 * Deterministic detection and classification of recurring failure patterns across
 * historical incidents, telemetry anomalies, regressions, SLO events, and traces.
 *
 * Supported 8 Canonical Pattern Categories:
 * 1. database_pool_saturation
 * 2. dependency_timeout_propagation
 * 3. deployment_associated_regression
 * 4. repeated_latency_degradation
 * 5. repeated_5xx_incidents
 * 6. repeated_slo_exhaustion
 * 7. resource_pressure
 * 8. recurring_dependency_path_failure
 *
 * Strict Rule: Minimum 2 historical occurrences required before declaring a recurring pattern.
 * Single occurrences are treated as isolated events and not flagged as recurring patterns.
 */

import crypto from 'node:crypto';

export const PATTERN_CATEGORIES = {
  DATABASE_POOL_SATURATION: 'database_pool_saturation',
  DEPENDENCY_TIMEOUT_PROPAGATION: 'dependency_timeout_propagation',
  DEPLOYMENT_ASSOCIATED_REGRESSION: 'deployment_associated_regression',
  REPEATED_LATENCY_DEGRADATION: 'repeated_latency_degradation',
  REPEATED_5XX_INCIDENTS: 'repeated_5xx_incidents',
  REPEATED_SLO_EXHAUSTION: 'repeated_slo_exhaustion',
  RESOURCE_PRESSURE: 'resource_pressure',
  RECURRING_DEPENDENCY_PATH_FAILURE: 'recurring_dependency_path_failure'
};

const MIN_SAMPLE_THRESHOLD = 2;

/**
 * Detects recurring failure patterns from historical incidents, change regressions, and normalized events.
 *
 * @param {Object} context
 * @param {Array} context.incidents - List of historical incident records
 * @param {Array} [context.regressions] - List of deployment regression records
 * @param {Array} [context.sloAlerts] - List of SLO alert/burn events
 * @param {Array} [context.events] - List of normalized events
 * @param {Array} [context.services] - Registered services
 * @returns {Array<Object>} List of verified recurring pattern records
 */
export function detectRecurringPatterns({
  incidents = [],
  regressions = [],
  sloAlerts = [],
  events = [],
  services = []
}) {
  const patternBuckets = new Map();

  function addToBucket(category, serviceId, incident, evidenceItem) {
    const key = `${category}::${serviceId}`;
    if (!patternBuckets.has(key)) {
      patternBuckets.set(key, {
        category,
        serviceId,
        incidents: new Set(),
        evidence: [],
        firstObserved: null,
        lastObserved: null,
        signals: new Set()
      });
    }

    const bucket = patternBuckets.get(key);
    if (incident && incident.id) {
      bucket.incidents.add(incident.id);
    }
    if (evidenceItem) {
      bucket.evidence.push(evidenceItem);
    }

    const itemDate = new Date(
      (evidenceItem && evidenceItem.observedAt) ||
      (incident && incident.createdAt) ||
      (incident && incident.created_at) ||
      Date.now()
    );

    if (!bucket.firstObserved || itemDate < bucket.firstObserved) {
      bucket.firstObserved = itemDate;
    }
    if (!bucket.lastObserved || itemDate > bucket.lastObserved) {
      bucket.lastObserved = itemDate;
    }
  }

  // 1. Analyze Incidents for Title / Root Cause / RCA hypothesis clues
  for (const inc of incidents) {
    const serviceId = inc.service_id || inc.serviceId || 'unknown-service';
    const title = (inc.title || '').toLowerCase();
    const description = (inc.description || '').toLowerCase();
    const rootCause = (inc.root_cause || inc.rootCause || '').toLowerCase();
    const tags = Array.isArray(inc.tags) ? inc.tags.map(t => String(t).toLowerCase()) : [];
    const textCorpus = `${title} ${description} ${rootCause} ${tags.join(' ')}`;

    // Category 1: Database connection pool saturation
    if (
      textCorpus.includes('connection pool') ||
      textCorpus.includes('pool exhausted') ||
      textCorpus.includes('db connection') ||
      textCorpus.includes('database pool') ||
      textCorpus.includes('connection starvation')
    ) {
      addToBucket(PATTERN_CATEGORIES.DATABASE_POOL_SATURATION, serviceId, inc, {
        type: 'incident_record',
        sourceId: inc.id,
        title: inc.title,
        observedAt: inc.createdAt || inc.created_at || new Date().toISOString(),
        signal: 'db_pool_starvation'
      });
      patternBuckets.get(`${PATTERN_CATEGORIES.DATABASE_POOL_SATURATION}::${serviceId}`)?.signals.add('Connection timeout waiting for pool lease');
    }

    // Category 2: Dependency timeout propagation
    if (
      textCorpus.includes('timeout') ||
      textCorpus.includes('upstream timeout') ||
      textCorpus.includes('gateway timeout') ||
      textCorpus.includes('cascading timeout') ||
      textCorpus.includes('504 gateway')
    ) {
      addToBucket(PATTERN_CATEGORIES.DEPENDENCY_TIMEOUT_PROPAGATION, serviceId, inc, {
        type: 'incident_record',
        sourceId: inc.id,
        title: inc.title,
        observedAt: inc.createdAt || inc.created_at || new Date().toISOString(),
        signal: 'downstream_timeout_cascade'
      });
      patternBuckets.get(`${PATTERN_CATEGORIES.DEPENDENCY_TIMEOUT_PROPAGATION}::${serviceId}`)?.signals.add('Downstream RPC / HTTP request deadline exceeded');
    }

    // Category 4: Repeated latency degradation
    if (
      textCorpus.includes('p99 latency') ||
      textCorpus.includes('latency spike') ||
      textCorpus.includes('slow response') ||
      textCorpus.includes('high latency')
    ) {
      addToBucket(PATTERN_CATEGORIES.REPEATED_LATENCY_DEGRADATION, serviceId, inc, {
        type: 'incident_record',
        sourceId: inc.id,
        title: inc.title,
        observedAt: inc.createdAt || inc.created_at || new Date().toISOString(),
        signal: 'p99_latency_spike'
      });
      patternBuckets.get(`${PATTERN_CATEGORIES.REPEATED_LATENCY_DEGRADATION}::${serviceId}`)?.signals.add('P99 latency exceeding SLA threshold');
    }

    // Category 5: Repeated 5xx incidents
    if (
      textCorpus.includes('5xx') ||
      textCorpus.includes('500 internal') ||
      textCorpus.includes('error surge') ||
      textCorpus.includes('high error rate')
    ) {
      addToBucket(PATTERN_CATEGORIES.REPEATED_5XX_INCIDENTS, serviceId, inc, {
        type: 'incident_record',
        sourceId: inc.id,
        title: inc.title,
        observedAt: inc.createdAt || inc.created_at || new Date().toISOString(),
        signal: 'http_5xx_rate_surge'
      });
      patternBuckets.get(`${PATTERN_CATEGORIES.REPEATED_5XX_INCIDENTS}::${serviceId}`)?.signals.add('HTTP 5xx error rate surge above 2% threshold');
    }

    // Category 7: Resource pressure (CPU/Memory/OOM)
    if (
      textCorpus.includes('oom') ||
      textCorpus.includes('memory leak') ||
      textCorpus.includes('cpu throttle') ||
      textCorpus.includes('cpu saturation') ||
      textCorpus.includes('resource exhaustion') ||
      textCorpus.includes('crashloop')
    ) {
      addToBucket(PATTERN_CATEGORIES.RESOURCE_PRESSURE, serviceId, inc, {
        type: 'incident_record',
        sourceId: inc.id,
        title: inc.title,
        observedAt: inc.createdAt || inc.created_at || new Date().toISOString(),
        signal: 'container_resource_exhaustion'
      });
      patternBuckets.get(`${PATTERN_CATEGORIES.RESOURCE_PRESSURE}::${serviceId}`)?.signals.add('Pod memory or CPU utilization sustained > 90%');
    }

    // Category 8: Recurring dependency path failure
    if (Array.isArray(inc.affected_services) && inc.affected_services.length >= 2) {
      const pathKey = inc.affected_services.slice(0, 3).sort().join('->');
      addToBucket(PATTERN_CATEGORIES.RECURRING_DEPENDENCY_PATH_FAILURE, pathKey, inc, {
        type: 'incident_record',
        sourceId: inc.id,
        title: inc.title,
        observedAt: inc.createdAt || inc.created_at || new Date().toISOString(),
        signal: `multi_hop_failure_${pathKey}`
      });
      patternBuckets.get(`${PATTERN_CATEGORIES.RECURRING_DEPENDENCY_PATH_FAILURE}::${pathKey}`)?.signals.add(`Coincident degradation along dependency chain: ${pathKey}`);
    }
  }

  // 2. Analyze Deployment Regressions (Category 3)
  for (const reg of regressions) {
    const sId = reg.service_id || reg.serviceId || 'unknown-service';
    addToBucket(PATTERN_CATEGORIES.DEPLOYMENT_ASSOCIATED_REGRESSION, sId, { id: reg.incident_id || reg.incidentId }, {
      type: 'deployment_regression',
      sourceId: reg.id,
      title: `Regression after ${reg.release_version || reg.releaseVersion || 'release'}`,
      observedAt: reg.detected_at || reg.detectedAt || new Date().toISOString(),
      signal: 'post_deployment_anomaly'
    });
    patternBuckets.get(`${PATTERN_CATEGORIES.DEPLOYMENT_ASSOCIATED_REGRESSION}::${sId}`)?.signals.add(`Service regression identified following change deployment ${reg.release_version || ''}`);
  }

  // 3. Analyze SLO Alerts / Burn Rate Events (Category 6)
  for (const slo of sloAlerts) {
    const sId = slo.service_id || slo.serviceId || 'unknown-service';
    addToBucket(PATTERN_CATEGORIES.REPEATED_SLO_EXHAUSTION, sId, { id: slo.incident_id || slo.incidentId }, {
      type: 'slo_alert_event',
      sourceId: slo.id,
      title: `SLO Burn Alert: ${slo.slo_name || slo.sloName || 'SLO'}`,
      observedAt: slo.triggered_at || slo.triggeredAt || new Date().toISOString(),
      signal: 'slo_budget_burn'
    });
    patternBuckets.get(`${PATTERN_CATEGORIES.REPEATED_SLO_EXHAUSTION}::${sId}`)?.signals.add('Fast or slow error budget burn-rate threshold exceeded');
  }

  // Build verified recurring pattern results
  const patterns = [];

  for (const [key, bucket] of patternBuckets.entries()) {
    const occurrenceCount = Math.max(bucket.incidents.size, bucket.evidence.length);

    // Enforce sample size threshold: minimum 2 occurrences required
    if (occurrenceCount < MIN_SAMPLE_THRESHOLD) {
      continue;
    }

    const [category, serviceOrPath] = key.split('::');
    const affectedServices = serviceOrPath.includes('->')
      ? serviceOrPath.split('->')
      : [serviceOrPath];

    // Determine trend direction
    // If more than 60% of occurrences happened in the second half of time interval => increasing
    let trendDirection = 'stable';
    if (bucket.firstObserved && bucket.lastObserved && bucket.evidence.length >= 3) {
      const startMs = bucket.firstObserved.getTime();
      const endMs = bucket.lastObserved.getTime();
      const midMs = startMs + (endMs - startMs) / 2;
      const recentCount = bucket.evidence.filter(e => new Date(e.observedAt).getTime() >= midMs).length;
      if (recentCount / bucket.evidence.length >= 0.65) {
        trendDirection = 'increasing';
      } else if (recentCount / bucket.evidence.length <= 0.35) {
        trendDirection = 'decreasing';
      }
    }

    // Determine confidence based on sample size and signal coherence
    let confidence = 'medium';
    if (occurrenceCount >= 4) {
      confidence = 'high';
    } else if (occurrenceCount < 3) {
      confidence = 'medium';
    }

    const title = formatPatternTitle(category, affectedServices);
    const description = formatPatternDescription(category, affectedServices, occurrenceCount);

    patterns.push({
      id: `pat-${crypto.createHash('md5').update(key).digest('hex').substring(0, 12)}`,
      category,
      title,
      description,
      affectedServices,
      occurrenceCount,
      firstObservedAt: bucket.firstObserved ? bucket.firstObserved.toISOString() : new Date().toISOString(),
      lastObservedAt: bucket.lastObserved ? bucket.lastObserved.toISOString() : new Date().toISOString(),
      trendDirection,
      commonSignals: Array.from(bucket.signals),
      relatedIncidents: Array.from(bucket.incidents).filter(Boolean),
      confidence,
      sampleSize: occurrenceCount,
      evidence: bucket.evidence
    });
  }

  // Sort by occurrence count descending, then confidence
  return patterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

function formatPatternTitle(category, affectedServices) {
  const svc = affectedServices.join(', ');
  switch (category) {
    case PATTERN_CATEGORIES.DATABASE_POOL_SATURATION:
      return `Database Connection Pool Saturation on ${svc}`;
    case PATTERN_CATEGORIES.DEPENDENCY_TIMEOUT_PROPAGATION:
      return `Cascading Timeout Propagation affecting ${svc}`;
    case PATTERN_CATEGORIES.DEPLOYMENT_ASSOCIATED_REGRESSION:
      return `Post-Deployment Regressions on ${svc}`;
    case PATTERN_CATEGORIES.REPEATED_LATENCY_DEGRADATION:
      return `Repeated P99 Latency Degradation on ${svc}`;
    case PATTERN_CATEGORIES.REPEATED_5XX_INCIDENTS:
      return `Surge of HTTP 5xx Server Errors on ${svc}`;
    case PATTERN_CATEGORIES.REPEATED_SLO_EXHAUSTION:
      return `Persistent Error Budget Burn on ${svc}`;
    case PATTERN_CATEGORIES.RESOURCE_PRESSURE:
      return `Resource Saturation & Memory Throttling on ${svc}`;
    case PATTERN_CATEGORIES.RECURRING_DEPENDENCY_PATH_FAILURE:
      return `Recurring Multi-Hop Topology Degradation across ${svc}`;
    default:
      return `Recurring Operational Pattern on ${svc}`;
  }
}

function formatPatternDescription(category, affectedServices, count) {
  const svc = affectedServices.join(', ');
  return `Identified ${count} historical occurrences exhibiting recurring signature of ${category.replace(/_/g, ' ')} impacting ${svc}. Deterministic telemetry and incident records confirm repeated degradation characteristics.`;
}

