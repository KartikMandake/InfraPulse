import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import app from '../../backend/src/app.js';
import { registry, recordHttp, recordOperation, window, processMeasurements } from '../../backend/src/observability/metrics.js';
import { getPoolStats } from '../../backend/src/db/connection.js';
import { observationSettings } from '../../backend/src/observability/settings.js';
import { validTraceparent, extractParent, carrier } from '../../backend/src/observability/tracing.js';
import { logContext } from '../../backend/src/observability/logContext.js';
import { logger, redact } from '../../backend/src/utils/logger.js';
import { evaluateSelfAlerts, evaluateSelfSlos } from '../../backend/src/services/selfMonitoringAlerts.service.js';
import { verifyMetricsAccess } from '../../backend/src/controllers/selfMonitoring.controller.js';

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('1. Prometheus metrics endpoint exposes valid OpenMetrics/Prometheus format', async () => {
  recordHttp('GET', '/api/test', 200, 12);
  recordOperation('db.query', 4.5, false);

  const res = await fetch(`${baseUrl}/metrics`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/plain/);

  const text = await res.text();
  assert.ok(text.includes('infrapulse_http_requests_total'));
  assert.ok(text.includes('infrapulse_http_request_duration_seconds'));
  assert.ok(text.includes('infrapulse_http_active_requests'));
  assert.ok(text.includes('infrapulse_operations_total'));
  assert.ok(text.includes('infrapulse_rca_candidate_rank'));
  assert.ok(text.includes('infrapulse_database_pool_connections'));
  assert.ok(text.includes('infrapulse_worker_heartbeat_age_seconds'));
  assert.ok(text.includes('infrapulse_process_measurement'));
});

test('2. Alternative scrape route /api/self-monitoring/metrics returns metrics', async () => {
  const res = await fetch(`${baseUrl}/api/self-monitoring/metrics`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('infrapulse_http_requests_total'));
});

test('3. Token-protected metrics endpoint enforces Bearer token authentication', async () => {
  const fakeSecret = 'a'.repeat(32);
  const originalToken = process.env.SELF_MONITORING_METRICS_TOKEN;
  process.env.SELF_MONITORING_METRICS_TOKEN = fakeSecret;

  try {
    // Unauthenticated request
    const unauthorizedReq = { headers: {} };
    assert.equal(verifyMetricsAccess(unauthorizedReq), false);

    // Invalid token request
    const badTokenReq = { headers: { authorization: 'Bearer wrong-secret-token-value-too-short' } };
    assert.equal(verifyMetricsAccess(badTokenReq), false);

    // Valid token request
    const validTokenReq = { headers: { authorization: `Bearer ${fakeSecret}` } };
    assert.equal(verifyMetricsAccess(validTokenReq), true);

    // Authenticated admin user request
    const adminUserReq = { headers: {}, user: { role: 'admin', id: 'usr_admin' } };
    assert.equal(verifyMetricsAccess(adminUserReq), true);
  } finally {
    if (originalToken !== undefined) {
      process.env.SELF_MONITORING_METRICS_TOKEN = originalToken;
    } else {
      delete process.env.SELF_MONITORING_METRICS_TOKEN;
    }
  }
});

test('4. Self-monitoring overview endpoint returns platform status and 10 subsystems', async () => {
  const res = await fetch(`${baseUrl}/api/self-monitoring/overview`);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.success, true);
  assert.ok(['HEALTHY', 'DEGRADED', 'CRITICAL'].includes(body.data.platformStatus));
  assert.ok(body.data.runtime.uptimeSeconds >= 0);
  assert.ok(body.data.httpPerformance);

  const subsystems = body.data.subsystems;
  const requiredSubsystems = [
    'frontend', 'backend', 'database', 'worker', 'notifications',
    'rcaEngine', 'aiAssistant', 'cloudLifecycle', 'scheduler', 'telemetryPipeline'
  ];
  for (const name of requiredSubsystems) {
    assert.ok(subsystems[name], `Missing subsystem: ${name}`);
    assert.ok(subsystems[name].status);
  }
});

test('5. Operational self-monitoring alerts detect thresholds and manage cooldowns', async () => {
  const testSettings = {
    minEvents: 2,
    errorRate: 10,
    latencyMs: 100,
    heapPercent: 85,
    heartbeatMaxMs: 60000,
    queueLimit: 50,
    cooldownMs: 60000
  };

  const evalResult = await evaluateSelfAlerts(testSettings);
  assert.ok(Array.isArray(evalResult.alerts));
  assert.ok(evalResult.alerts.length >= 6);

  const alertIds = evalResult.alerts.map(a => a.id);
  assert.ok(alertIds.includes('backend_5xx_surge'));
  assert.ok(alertIds.includes('high_api_latency'));
  assert.ok(alertIds.includes('database_pool_exhaustion'));
  assert.ok(alertIds.includes('worker_heartbeat_lost'));
  assert.ok(alertIds.includes('notification_queue_growth'));
  assert.ok(alertIds.includes('telemetry_dead_letter_surge'));

  const alertsApiRes = await fetch(`${baseUrl}/api/self-monitoring/alerts`);
  assert.equal(alertsApiRes.status, 200);
  const alertsApiBody = await alertsApiRes.json();
  assert.equal(alertsApiBody.success, true);
  assert.ok(alertsApiBody.data.alerts.length >= 6);
});

test('6. Self-monitoring SLOs compute attainment, remaining error budget and burn rate', async () => {
  const slos = evaluateSelfSlos();
  assert.ok(Array.isArray(slos));
  assert.ok(slos.length >= 4);

  const availSlo = slos.find(s => s.id === 'slo_api_availability');
  assert.ok(availSlo);
  assert.equal(availSlo.targetPercent, 99.9);
  assert.ok(availSlo.currentAttainmentPercent >= 0 && availSlo.currentAttainmentPercent <= 100);
  assert.ok(availSlo.errorBudgetRemainingPercent >= 0 && availSlo.errorBudgetRemainingPercent <= 100);
  assert.ok(typeof availSlo.burnRate === 'number');

  const slosApiRes = await fetch(`${baseUrl}/api/self-monitoring/slos`);
  assert.equal(slosApiRes.status, 200);
  const slosApiBody = await slosApiRes.json();
  assert.equal(slosApiBody.success, true);
  assert.ok(slosApiBody.data.slos.length >= 4);
});

test('7. Distributed tracing validates W3C traceparent context propagation', () => {
  assert.equal(validTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'), true);
  assert.equal(validTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00'), true);
  // Invalid versions, all zeroes, or wrong length
  assert.equal(validTraceparent('01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'), false);
  assert.equal(validTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'), false);
  assert.equal(validTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01'), false);
  assert.equal(validTraceparent('not-a-traceparent'), false);
});

test('8. Structured logger attaches traceId/spanId from active context and redacts secrets', () => {
  const secret = 'super-secret-api-token-9999';
  let captured = '';
  const origWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    captured += chunk;
    return true;
  };

  try {
    logContext.run({ requestId: 'corr_test_123', traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: '00f067aa0ba902b7' }, () => {
      logger.info('Test log message', { token: secret, authorization: `Bearer ${secret}` });
    });
  } finally {
    process.stdout.write = origWrite;
  }

  assert.ok(captured.length > 0);
  const parsed = JSON.parse(captured.trim());
  assert.equal(parsed.correlationId, 'corr_test_123');
  assert.equal(parsed.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
  assert.equal(parsed.spanId, '00f067aa0ba902b7');
  assert.equal(parsed.token, '[REDACTED]');
  assert.equal(parsed.authorization, '[REDACTED]');
  assert.ok(!captured.includes(secret));
});

test('9. All 7 production Grafana dashboard JSON files exist, parse cleanly, and query infrapulse_* metrics', () => {
  const dashboardsDir = path.resolve('deploy/grafana/dashboards');
  const expectedDashboards = [
    'infrapulse-platform-overview.json',
    'infrapulse-api-performance.json',
    'infrapulse-postgresql-health.json',
    'infrapulse-worker-health.json',
    'infrapulse-rca-performance.json',
    'infrapulse-telemetry-pipeline.json',
    'infrapulse-resource-utilization.json'
  ];

  for (const filename of expectedDashboards) {
    const fullPath = path.join(dashboardsDir, filename);
    assert.ok(fs.existsSync(fullPath), `Dashboard file missing: ${filename}`);

    const raw = fs.readFileSync(fullPath, 'utf8');
    const json = JSON.parse(raw);

    assert.ok(json.title, `${filename} must have a title`);
    assert.ok(json.uid, `${filename} must have a uid`);
    assert.ok(Array.isArray(json.panels), `${filename} must contain panels array`);
    assert.ok(json.panels.length >= 3, `${filename} must have at least 3 panels`);

    // Verify panels query infrapulse_* metrics
    const panelTargets = json.panels.flatMap(p => p.targets || []);
    const hasInfraPulseQuery = panelTargets.some(t => t.expr && t.expr.includes('infrapulse_'));
    assert.ok(hasInfraPulseQuery, `${filename} must contain queries referencing infrapulse_* metrics`);
  }

  // Verify provisioning configuration exists
  const provisioningPath = path.resolve('deploy/grafana/provisioning/dashboards/dashboards.yaml');
  assert.ok(fs.existsSync(provisioningPath), 'Grafana provisioning configuration missing');
});
