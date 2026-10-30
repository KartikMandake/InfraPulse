/**
 * Statistical Anomaly Analysis Module for InfraPulse RCA Engine
 *
 * Evaluates telemetry signals independently of whether an alert was fired:
 * - Latency deviation relative to baseline (with safe handling of missing, zero, or stale baselines)
 * - Error rate surge relative to nominal baseline
 * - CPU / Memory saturation
 * - Pod degradation / crashlooping
 * - Statistical thresholding and anomaly scoring
 */

export function analyzeServiceAnomalies(service, serviceAlerts = []) {
  const anomalies = [];
  let anomalyScore = 0;

  // 1. Latency Analysis (Relative Deviation from Baseline)
  const baseline = Number(service.latencyBaseline);
  const p99 = Number(service.latencyP99);

  let latencyRatio = null;
  let hasValidBaseline = !isNaN(baseline) && baseline > 0;
  let hasValidP99 = !isNaN(p99) && p99 >= 0;

  if (hasValidBaseline && hasValidP99) {
    latencyRatio = p99 / baseline;

    if (latencyRatio >= 10.0) {
      // Extreme latency surge (10x+ baseline, e.g. GC pauses, deadlock, severe queuing)
      anomalyScore += 45;
      anomalies.push({
        id: `anom-lat-ext-${service.id}`,
        dimension: 'latency',
        severity: 'critical',
        ratio: Math.round(latencyRatio * 10) / 10,
        currentValue: `${p99}ms`,
        baselineValue: `${baseline}ms`,
        title: `Extreme Latency Surge (${latencyRatio.toFixed(1)}x baseline)`,
        description: `P99 latency surged to ${p99}ms against nominal baseline of ${baseline}ms.`
      });
    } else if (latencyRatio >= 4.0) {
      // Significant latency surge (4x - 10x)
      anomalyScore += 30;
      anomalies.push({
        id: `anom-lat-sig-${service.id}`,
        dimension: 'latency',
        severity: 'high',
        ratio: Math.round(latencyRatio * 10) / 10,
        currentValue: `${p99}ms`,
        baselineValue: `${baseline}ms`,
        title: `Significant Latency Surge (${latencyRatio.toFixed(1)}x baseline)`,
        description: `P99 latency reached ${p99}ms against baseline of ${baseline}ms.`
      });
    } else if (latencyRatio >= 2.0) {
      // Moderate latency elevation (2x - 4x)
      anomalyScore += 15;
      anomalies.push({
        id: `anom-lat-mod-${service.id}`,
        dimension: 'latency',
        severity: 'medium',
        ratio: Math.round(latencyRatio * 10) / 10,
        currentValue: `${p99}ms`,
        baselineValue: `${baseline}ms`,
        title: `Elevated Latency (${latencyRatio.toFixed(1)}x baseline)`,
        description: `P99 latency is ${p99}ms compared to baseline ${baseline}ms.`
      });
    }
  } else if (!hasValidBaseline && hasValidP99 && p99 > 500) {
    // Missing baseline but high absolute latency fallback
    anomalyScore += 20;
    anomalies.push({
      id: `anom-lat-nobase-${service.id}`,
      dimension: 'latency',
      severity: 'medium',
      ratio: null,
      currentValue: `${p99}ms`,
      baselineValue: 'unknown',
      title: `High Absolute Latency (${p99}ms, No Baseline)`,
      description: `Observed P99 latency of ${p99}ms exceeds 500ms safety threshold without baseline reference.`
    });
  }

  // 2. Error Rate Analysis
  const errorRate = Number(service.errorRate) || 0;
  if (errorRate >= 15.0) {
    anomalyScore += 35;
    anomalies.push({
      id: `anom-err-crit-${service.id}`,
      dimension: 'error_rate',
      severity: 'critical',
      currentValue: `${errorRate}%`,
      title: `Critical Error Rate Spike (${errorRate}%)`,
      description: `Service error rate is ${errorRate}%, indicating severe endpoint failure.`
    });
  } else if (errorRate >= 3.0) {
    anomalyScore += 20;
    anomalies.push({
      id: `anom-err-high-${service.id}`,
      dimension: 'error_rate',
      severity: 'high',
      currentValue: `${errorRate}%`,
      title: `Elevated Error Rate (${errorRate}%)`,
      description: `Service error rate is ${errorRate}%, exceeding nominal 0.05% threshold.`
    });
  } else if (errorRate >= 0.5) {
    anomalyScore += 10;
  }

  // 3. Resource Saturation (CPU / Memory)
  const cpu = Number(service.cpuPercent) || 0;
  const mem = Number(service.memoryPercent) || 0;
  if (cpu >= 90.0 || mem >= 90.0) {
    anomalyScore += 15;
    anomalies.push({
      id: `anom-res-${service.id}`,
      dimension: 'resources',
      severity: 'high',
      currentValue: `CPU ${cpu}%, Mem ${mem}%`,
      title: `Severe Resource Saturation (CPU: ${cpu}%, Mem: ${mem}%)`,
      description: `Compute capacity saturated on service pods.`
    });
  }

  // 4. Pod Health & Infrastructure State
  const pods = Array.isArray(service.pods) ? service.pods : [];
  const failingPods = pods.filter(p => p.status === 'CrashLoopBackOff' || p.status === 'Degraded');
  if (failingPods.length > 0) {
    anomalyScore += 20;
    anomalies.push({
      id: `anom-pods-${service.id}`,
      dimension: 'infrastructure',
      severity: 'critical',
      currentValue: `${failingPods.length} failing`,
      title: `${failingPods.length} Failing Pod(s)`,
      description: `Pods in abnormal state: ${failingPods.map(p => p.name).join(', ')}`
    });
  }

  // 5. Active Firing Alerts Correlation (Consolidated to avoid double counting)
  const firingCriticals = (serviceAlerts || []).filter(a => a.severity === 'critical' && (a.state === 'firing' || a.status === 'active'));
  const firingWarnings = (serviceAlerts || []).filter(a => a.severity === 'warning' && (a.state === 'firing' || a.status === 'active'));

  if (firingCriticals.length > 0) {
    anomalyScore += 25; // Bounded alert boost
    for (const alt of firingCriticals) {
      anomalies.push({
        id: `anom-alt-${alt.id}`,
        dimension: 'alert',
        severity: 'critical',
        currentValue: String(alt.currentValue || alt.threshold),
        title: `Critical Alert: ${alt.title}`,
        description: `Alert active: ${alt.metric} ${alt.operator} ${alt.threshold}.`
      });
    }
  } else if (firingWarnings.length > 0) {
    anomalyScore += 10;
  }

  // 6. Service Reported Status Bonus
  if (service.status === 'critical') {
    anomalyScore += 15;
  } else if (service.status === 'degraded') {
    anomalyScore += 10;
  }

  return {
    score: Math.min(100, Math.round(anomalyScore)),
    anomalies,
    hasValidBaseline,
    latencyRatio
  };
}

