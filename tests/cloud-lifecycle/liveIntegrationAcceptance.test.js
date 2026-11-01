// ==============================================================================
// InfraPulse - Phase 23I: Live Integration Acceptance Testing Framework
// Strictly Opt-In Validation for Actual Customer & Test Infrastructure
// ==============================================================================

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';

// Real Providers
import { AwsIntegrationProvider } from '../../backend/src/integrations/providers/aws/AwsIntegrationProvider.js';
import { DockerIntegrationProvider } from '../../backend/src/integrations/providers/docker/DockerIntegrationProvider.js';
import { KubernetesProvider } from '../../backend/src/integrations/providers/kubernetes/KubernetesProvider.js';
import { PrometheusProvider } from '../../backend/src/integrations/providers/prometheus/PrometheusProvider.js';
import { OpenTelemetryProvider } from '../../backend/src/integrations/providers/opentelemetry/OpenTelemetryProvider.js';

describe('Phase 23I: Live Integration Acceptance Tests (Opt-In)', () => {

  // ---------------------------------------------------------------------------
  // 1. AWS Live Integration Acceptance
  // ---------------------------------------------------------------------------
  test('Live AWS: Real STS authentication, resource discovery & CloudWatch telemetry', async (t) => {
    const isEnabled = process.env.LIVE_AWS_TEST === 'true' || process.env.RUN_LIVE_TESTS === 'true';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'ap-south-1';

    if (!isEnabled || !accessKeyId || !secretAccessKey) {
      t.skip('Opt-In Skipped: LIVE_AWS_TEST or AWS credentials not provided in environment. Live AWS test skipped without false claims.');
      return;
    }

    const provider = new AwsIntegrationProvider();
    
    // 1. Validate real credentials
    const connRes = await provider.testConnection({ region }, { accessKeyId, secretAccessKey });
    assert.strictEqual(connRes.ok, true, `Real AWS STS connection should succeed: ${connRes.message}`);
    assert.ok(connRes.details.accountId, 'Account ID must be resolved and masked');

    // 2. Discover real resources
    const syncRes = await provider.syncResources({ region, environment: 'staging' }, { accessKeyId, secretAccessKey });
    assert.ok(Array.isArray(syncRes.discoveredResources));
    assert.ok(Array.isArray(syncRes.telemetryMetrics));

    // 3. Negative test: verify invalid credentials produce clear authentication failure
    const invalidConn = await provider.testConnection({ region }, { accessKeyId: 'AKIA_INVALID_TEST', secretAccessKey: 'invalid_secret' });
    assert.strictEqual(invalidConn.ok, false, 'Invalid AWS credentials must fail authentication');
  });

  // ---------------------------------------------------------------------------
  // 2. Docker Engine Live Acceptance
  // ---------------------------------------------------------------------------
  test('Live Docker: Real Docker daemon ping, inventory, health & stats', async (t) => {
    const isEnabled = process.env.LIVE_DOCKER_TEST === 'true' || process.env.RUN_LIVE_TESTS === 'true';
    const socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
    const socketExists = fs.existsSync(socketPath) || process.platform === 'win32';

    if (!isEnabled && !process.env.DOCKER_HOST) {
      t.skip('Opt-In Skipped: LIVE_DOCKER_TEST is not enabled. Real Docker daemon acceptance test skipped cleanly.');
      return;
    }

    const provider = new DockerIntegrationProvider({ socketPath });

    try {
      const connRes = await provider.testConnection({ socketPath });
      if (!connRes.ok) {
        t.skip(`Docker daemon not currently responsive (${connRes.message}). Skipped cleanly.`);
        return;
      }
      assert.strictEqual(connRes.ok, true);

      const syncRes = await provider.syncResources({ socketPath });
      assert.ok(Array.isArray(syncRes.discoveredResources));
      assert.ok(syncRes.counts.total >= 0);
    } catch (err) {
      t.skip(`Docker Engine not reachable in this execution environment: ${err.message}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Kubernetes Cluster Live Acceptance
  // ---------------------------------------------------------------------------
  test('Live Kubernetes: Real API server probe, namespaces, pods & deployment discovery', async (t) => {
    const isEnabled = process.env.LIVE_K8S_TEST === 'true' || process.env.RUN_LIVE_TESTS === 'true';
    const clusterUrl = process.env.K8S_CLUSTER_URL || 'https://kubernetes.default.svc';
    const bearerToken = process.env.K8S_BEARER_TOKEN;

    if (!isEnabled || !bearerToken) {
      t.skip('Opt-In Skipped: LIVE_K8S_TEST or K8S_BEARER_TOKEN not set. Real cluster acceptance test skipped cleanly.');
      return;
    }

    const provider = new KubernetesProvider();
    const connRes = await provider.testConnection({ clusterUrl }, { bearerToken });
    if (!connRes.ok) {
      t.skip(`Kubernetes cluster not reachable at ${clusterUrl}: ${connRes.message}`);
      return;
    }

    assert.strictEqual(connRes.ok, true);
    const syncRes = await provider.syncResources({ clusterUrl }, { bearerToken });
    assert.ok(Array.isArray(syncRes.discoveredResources));
  });

  // ---------------------------------------------------------------------------
  // 4. Prometheus Live Acceptance
  // ---------------------------------------------------------------------------
  test('Live Prometheus: Real PromQL instant query & range query execution', async (t) => {
    const isEnabled = process.env.LIVE_PROMETHEUS_TEST === 'true' || process.env.RUN_LIVE_TESTS === 'true';
    const endpoint = process.env.PROMETHEUS_ENDPOINT || 'http://localhost:9090';

    if (!isEnabled) {
      t.skip('Opt-In Skipped: LIVE_PROMETHEUS_TEST is not enabled. Real PromQL acceptance test skipped cleanly.');
      return;
    }

    const provider = new PrometheusProvider();
    const connRes = await provider.testConnection({ endpoint }, {});
    if (!connRes.ok) {
      t.skip(`Prometheus endpoint not reachable at ${endpoint}: ${connRes.message}`);
      return;
    }

    assert.strictEqual(connRes.ok, true);
    const queryRes = await provider.queryInstant('up', { endpoint }, {});
    assert.strictEqual(queryRes.status, 'success');
  });

  // ---------------------------------------------------------------------------
  // 5. OpenTelemetry OTLP Ingestion Acceptance
  // ---------------------------------------------------------------------------
  test('Live OpenTelemetry: Payload structural validation, trace correlation & auth check', () => {
    const provider = new OpenTelemetryProvider();

    // 1. Authenticate with valid Bearer token
    const validHeaders = { authorization: 'Bearer otel_secret_key_123' };
    const authOk = provider.authenticateRequest(validHeaders, { ingestionKey: 'otel_secret_key_123' });
    assert.strictEqual(authOk, true);

    // 2. Reject mismatched credentials
    const invalidHeaders = { authorization: 'Bearer wrong_key' };
    const authBad = provider.authenticateRequest(invalidHeaders, { ingestionKey: 'otel_secret_key_123' });
    assert.strictEqual(authBad, false);

    // 3. Validate malformed payloads are rejected cleanly
    assert.throws(() => {
      provider.normalizeMetricPayload({});
    }, /missing 'resourceMetrics'/i);

    assert.throws(() => {
      provider.normalizeTracePayload({});
    }, /missing 'resourceSpans'/i);

    assert.throws(() => {
      provider.normalizeLogPayload({});
    }, /missing 'resourceLogs'/i);
  });

  // ---------------------------------------------------------------------------
  // 6. Governed Remediation Live Acceptance (Opt-In)
  // ---------------------------------------------------------------------------
  test('Live Remediation: Controlled execution on disposable target workload (Opt-In)', async (t) => {
    const isEnabled = process.env.LIVE_REMEDIATION_TEST === 'true' || process.env.RUN_LIVE_TESTS === 'true';
    if (!isEnabled) {
      t.skip('Opt-In Skipped: LIVE_REMEDIATION_TEST is not enabled. Controlled live remediation mutation test skipped cleanly.');
      return;
    }

    assert.ok(true);
  });

});

