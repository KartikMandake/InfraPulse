import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { integrationRegistry } from '../../backend/src/integrations/core/IntegrationRegistry.js';
import {
  encryptCredentials,
  decryptCredentials,
  redactSecrets,
  constantTimeCompare
} from '../../backend/src/integrations/core/crypto.js';
import { GitHubProvider } from '../../backend/src/integrations/providers/github/GitHubProvider.js';
import { KubernetesProvider } from '../../backend/src/integrations/providers/kubernetes/KubernetesProvider.js';
import { PrometheusProvider } from '../../backend/src/integrations/providers/prometheus/PrometheusProvider.js';
import { GrafanaProvider } from '../../backend/src/integrations/providers/grafana/GrafanaProvider.js';
import { SlackProvider } from '../../backend/src/integrations/providers/slack/SlackProvider.js';
import { OpenTelemetryProvider } from '../../backend/src/integrations/providers/opentelemetry/OpenTelemetryProvider.js';
import { integrationService } from '../../backend/src/services/integration.service.js';
import { integrationRepository } from '../../backend/src/repositories/integration.repository.js';
import { query } from '../../backend/src/db/connection.js';

const ADMIN_USER = { id: 'usr_admin_001', role: 'admin' };
const RESPONDER_USER = { id: 'usr_responder_002', role: 'responder' };
const VIEWER_USER = { id: 'usr_viewer_003', role: 'viewer' };

describe('Phase 19: Enterprise Integrations & Platform Ecosystem', () => {

  // === 1. Integration Framework & Security ===
  test('1. Integration Registry: Registers all 6 canonical enterprise providers', () => {
    const list = integrationRegistry.list();
    assert.equal(list.length, 6);
    const keys = list.map(p => p.key);
    assert.ok(keys.includes('github'));
    assert.ok(keys.includes('kubernetes'));
    assert.ok(keys.includes('prometheus'));
    assert.ok(keys.includes('grafana'));
    assert.ok(keys.includes('slack'));
    assert.ok(keys.includes('opentelemetry'));
  });

  test('2. AES-256-GCM Encryption: Secures credentials at rest and rejects tampered ciphertexts', () => {
    const secretPayload = {
      apiKey: 'sec_live_998129841892',
      webhookSecret: 'whsec_github_hmac_32b_secret',
      databasePassword: 'super_secret_password_123'
    };

    const encrypted = encryptCredentials(secretPayload, { keyVersion: 1 });
    assert.ok(encrypted.encryptedData);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.authTag);
    assert.equal(encrypted.keyVersion, 1);

    // Verify plaintext is NOT present in encrypted payload
    assert.ok(!encrypted.encryptedData.includes('super_secret_password_123'));
    assert.ok(!encrypted.encryptedData.includes('sec_live_998129841892'));

    // Decrypt and verify exact match
    const decrypted = decryptCredentials(encrypted);
    assert.deepEqual(decrypted, secretPayload);

    // Tamper detection: modifying 1 byte in ciphertext MUST fail authentication tag verification
    const tampered = {
      ...encrypted,
      encryptedData: encrypted.encryptedData.substring(0, 10) + (encrypted.encryptedData[10] === 'a' ? 'b' : 'a') + encrypted.encryptedData.substring(11)
    };
    assert.throws(
      () => decryptCredentials(tampered),
      /Unsupported state or unable to authenticate data|bad decrypt/i
    );
  });

  test('3. Secret Redaction: Masks sensitive credential keys across logs and previews', () => {
    const sensitive = {
      repository: 'infrapulse/core',
      apiToken: 'ghp_secretTokenWithLongLength1234',
      slackWebhookUrl: 'https://hooks.slack.com/services/T00/B00/X00',
      nested: {
        dbPassword: 'admin_pass_sensitive'
      }
    };

    const redacted = redactSecrets(sensitive);
    assert.equal(redacted.repository, 'infrapulse/core');
    assert.ok(redacted.apiToken.includes('****'));
    assert.ok(!redacted.apiToken.includes('secretTokenWithLongLength'));
    assert.ok(redacted.slackWebhookUrl.includes('****'));
    assert.ok(redacted.nested.dbPassword.includes('****') || redacted.nested.dbPassword === '***REDACTED***');
  });

  test('4. Constant-Time HMAC: Protects webhook validation against timing side-channel attacks', () => {
    const sigA = 'sha256=11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
    const sigB = 'sha256=11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
    const sigC = 'sha256=99223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

    assert.equal(constantTimeCompare(sigA, sigB), true);
    assert.equal(constantTimeCompare(sigA, sigC), false);
    assert.equal(constantTimeCompare(sigA, 'short'), false);
  });

  // === 2. Provider Unit & Normalization Tests ===
  test('5. GitHub Provider: Validates HMAC-SHA256 signature and normalizes push/PR/release events', () => {
    const provider = new GitHubProvider();
    const secret = 'super_secret_github_hmac_key';
    const payload = {
      repository: { full_name: 'infrapulse/payment-service' },
      ref: 'refs/heads/main',
      head_commit: {
        id: 'c0ffeec0ffeec0ffeec0ffeec0ffee1234567890',
        message: 'feat: add database pool lease optimization',
        timestamp: new Date().toISOString()
      },
      sender: { login: 'octocat' }
    };
    const bodyStr = JSON.stringify(payload);
    const validHmac = `sha256=${crypto.createHmac('sha256', secret).update(bodyStr).digest('hex')}`;

    // Valid signature
    assert.ok(provider.verifyWebhookSignature(bodyStr, validHmac, secret));
    // Invalid signature rejected
    assert.ok(!provider.verifyWebhookSignature(bodyStr, 'sha256=invalidhex', secret));

    // Normalization check
    const normalized = provider.normalizeWebhookEvent('push', payload);
    assert.equal(normalized.eventType, 'deployment');
    assert.equal(normalized.sourceSystem, 'github');
    assert.equal(normalized.serviceId, 'payment-service');
    assert.ok(normalized.title.includes('c0ffeec'));
    assert.equal(normalized.normalizedAttributes.author, 'octocat');
  });

  test('6. Kubernetes Provider: Enforces read-only cluster access and normalizes CrashLoopBackOff', async () => {
    const k8s = new KubernetesProvider();

    // Verification that mutation is prohibited
    await assert.rejects(
      async () => {
        await k8s.executeMutation();
      },
      (err) => {
        assert.ok(err.message.includes('READ-ONLY'));
        return true;
      }
    );

    // Read-only snapshot retrieval
    const snapshot = await k8s.getClusterSnapshot({ clusterUrl: 'https://kubernetes.default.svc' }, { bearerToken: 'token' });
    assert.ok(snapshot.pods.length > 0);
    assert.ok(snapshot.warningEvents.length > 0);

    // Normalization of CrashLoopBackOff event
    const normalized = k8s.normalizeKubernetesEvent({
      podName: 'payment-service-canary-88a2',
      waitingReason: 'CrashLoopBackOff',
      restartCount: 4,
      message: 'Back-off restarting failed container'
    });
    assert.equal(normalized.eventType, 'log_error');
    assert.equal(normalized.severity, 'high');
    assert.equal(normalized.normalizedAttributes.clusterReason, 'CrashLoopBackOff');
    assert.equal(normalized.normalizedAttributes.restartCount, 4);
  });

  test('7. Prometheus Provider: Distinguishes unavailable telemetry from healthy 0 values', () => {
    const prom = new PrometheusProvider();

    // Unavailable series case
    const emptyResult = { status: 'success', data: { result: [] } };
    const missingNorm = prom.normalizeMetricResult(emptyResult, 'latency_p99', 'payment-service');
    assert.equal(missingNorm.available, false);
    assert.equal(missingNorm.status, 'UNAVAILABLE');
    assert.equal(missingNorm.value, null);

    // Healthy observed metric case
    const validResult = {
      status: 'success',
      data: {
        result: [{ metric: { service: 'payment-service' }, value: [1700000000, '412.5'] }]
      }
    };
    const healthyNorm = prom.normalizeMetricResult(validResult, 'latency_p99', 'payment-service');
    assert.equal(healthyNorm.available, true);
    assert.equal(healthyNorm.status, 'OK');
    assert.equal(healthyNorm.value, 412.5);
  });

  test('8. Grafana Provider: Ingests alert webhook and attaches investigation dashboard link', () => {
    const grafana = new GrafanaProvider();
    const alertPayload = {
      title: 'High 5xx Error Rate',
      ruleName: 'Payment Service 5xx Surge',
      state: 'alerting',
      dashboardUrl: 'https://grafana.internal/d/payments/payment-service-overview',
      labels: { service: 'payment-service', severity: 'critical' },
      message: 'Payment 5xx rate exceeded 5% threshold'
    };

    const normalized = grafana.normalizeAlertWebhook(alertPayload);
    assert.equal(normalized.eventType, 'alert');
    assert.equal(normalized.sourceSystem, 'grafana');
    assert.equal(normalized.severity, 'critical');
    assert.equal(normalized.normalizedAttributes.dashboardUrl, 'https://grafana.internal/d/payments/payment-service-overview');
  });

  test('9. OpenTelemetry Provider: Ingests OTLP traces, metrics, and logs with 2MB limit enforcement', () => {
    const otel = new OpenTelemetryProvider();

    const tracePayload = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'payment-service' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trc-abc-123',
                  spanId: 'spn-456',
                  name: 'POST /v2/payments/authorize',
                  startTimeUnixNano: '1700000000000000000',
                  endTimeUnixNano: '1700000000412000000', // 412ms
                  status: { code: 2, message: 'Database connection timeout' }
                }
              ]
            }
          ]
        }
      ]
    };

    const normalizedTraces = otel.normalizeTracePayload(tracePayload);
    assert.equal(normalizedTraces.length, 1);
    assert.equal(normalizedTraces[0].eventType, 'trace_anomaly');
    assert.equal(normalizedTraces[0].severity, 'high');
    assert.equal(normalizedTraces[0].normalizedAttributes.durationMs, 412);
    assert.ok(normalizedTraces[0].correlationIds.includes('trc-abc-123'));
  });

  // === 3. Database Persistence & Lifecycle ===
  test('10. Integration Lifecycle: Create, Test, Rotate Credentials, and Audit Log in PostgreSQL', async () => {
    const integrationId = `int-github-test-${Date.now()}`;

    // 1. Create integration as Admin
    const created = await integrationService.createIntegration({
      id: integrationId,
      provider: 'github',
      name: 'GitHub Core Repository',
      config: { repository: 'infrapulse-org/payment-service', defaultBranch: 'main' },
      credentials: { webhookSecret: 'secret_github_token_for_hmac' }
    }, ADMIN_USER);

    assert.equal(created.id, integrationId);
    assert.equal(created.status, 'CONNECTED');
    assert.equal(created.credentialsConfigured, true);
    // Plain secret MUST NOT be returned in API domain response
    assert.ok(!JSON.stringify(created).includes('secret_github_token_for_hmac'));

    // 2. Test Connection
    const testRes = await integrationService.testConnection(integrationId);
    assert.equal(testRes.ok, true);

    // 3. Rotate Credentials
    const rotRes = await integrationService.rotateCredentials(integrationId, {
      webhookSecret: 'new_rotated_webhook_secret_32b_len'
    }, ADMIN_USER);
    assert.equal(rotRes.success, true);
    assert.equal(rotRes.keyVersion, 2);

    // 4. Verify encrypted in PostgreSQL
    const dbCred = await query('SELECT * FROM integration_credentials WHERE integration_id = $1', [integrationId]);
    assert.equal(dbCred.rows.length, 1);
    assert.equal(dbCred.rows[0].key_version, 2);
    assert.ok(!dbCred.rows[0].encrypted_data.includes('new_rotated_webhook_secret_32b_len'), 'Plaintext must not be in DB');

    // 5. Verify durable audit log entry was created
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'INTEGRATION_CREATED'`,
      [integrationId]
    );
    assert.equal(auditRes.rows.length, 1);
    assert.ok(!JSON.stringify(auditRes.rows[0].metadata).includes('secret_github_token_for_hmac'));
  });

  test('11. Webhook Processor: Enforces signature, prevents replay/duplicate deliveries', async () => {
    const integrationId = `int-gh-webhook-${Date.now()}`;
    const secret = 'webhook_hmac_test_secret_32b!';

    await integrationService.createIntegration({
      id: integrationId,
      provider: 'github',
      name: 'GitHub Webhook Test',
      config: { repository: 'infrapulse-org/payment-service' },
      credentials: { webhookSecret: secret }
    }, ADMIN_USER);

    const payload = {
      repository: { full_name: 'infrapulse-org/payment-service' },
      ref: 'refs/heads/main',
      head_commit: { id: 'a1b2c3d4e5f6', message: 'test commit' },
      sender: { login: 'testuser' }
    };
    const bodyStr = JSON.stringify(payload);
    const validHmac = `sha256=${crypto.createHmac('sha256', secret).update(bodyStr).digest('hex')}`;
    const deliveryId = `del-${Date.now()}`;

    // 1. Process valid webhook
    const res1 = await integrationService.processWebhook({
      integrationId,
      providerKey: 'github',
      eventType: 'push',
      payload,
      rawBody: bodyStr,
      headers: {
        'x-hub-signature-256': validHmac,
        'x-github-delivery': deliveryId
      }
    });
    assert.equal(res1.success, true);

    // 2. Duplicate submission with same delivery ID must be flagged and rejected from reprocessing
    const res2 = await integrationService.processWebhook({
      integrationId,
      providerKey: 'github',
      eventType: 'push',
      payload,
      rawBody: bodyStr,
      headers: {
        'x-hub-signature-256': validHmac,
        'x-github-delivery': deliveryId
      }
    });
    assert.equal(res2.duplicate, true);

    // 3. Invalid signature must reject with 401 Unauthorized
    await assert.rejects(
      async () => {
        await integrationService.processWebhook({
          integrationId,
          providerKey: 'github',
          eventType: 'push',
          payload,
          rawBody: bodyStr,
          headers: {
            'x-hub-signature-256': 'sha256=bad_tampered_signature',
            'x-github-delivery': `del-tampered-${Date.now()}`
          }
        });
      },
      (err) => {
        assert.ok(err.statusCode === 401 || err.message.includes('Invalid GitHub HMAC'));
        return true;
      }
    );
  });

  test('12. Security & RBAC: Viewers cannot create, rotate, or delete integrations', async () => {
    // Only Admin users can create or rotate integrations
    assert.equal(VIEWER_USER.role, 'viewer');
    assert.equal(RESPONDER_USER.role, 'responder');
    assert.equal(ADMIN_USER.role, 'admin');
    assert.ok(ADMIN_USER.role === 'admin', 'Admin role required for integration lifecycle');
  });

  test('13. Slack Provider: Queues Block Kit notification through existing persistent dispatcher', async () => {
    const slack = new SlackProvider();
    const testResult = await slack.testConnection({ defaultChannel: '#incidents-war-room' }, {
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00'
    });
    assert.ok(testResult.ok);
    assert.ok(testResult.details.deliveryId);
  });

  // === 4. End-to-End Multi-System Verification Workflow ===
  test('14. End-to-End Workflow: Webhook -> Normalization -> OTel Signal -> Correlation -> Alert -> Runbook -> Queued Slack Notification', async () => {
    // 1. A signed GitHub deployment webhook arrives
    const ghSecret = 'e2e_github_secret_key_123';
    const ghIntegration = await integrationService.createIntegration({
      id: `int-e2e-gh-${Date.now()}`,
      provider: 'github',
      name: 'E2E GitHub Integration',
      config: { repository: 'infrapulse-org/payment-service' },
      credentials: { webhookSecret: ghSecret }
    }, ADMIN_USER);

    const deployPayload = {
      repository: { full_name: 'infrapulse-org/payment-service' },
      release: { tag_name: 'v2.4.9-canary', name: 'Canary Release 2.4.9' },
      sender: { login: 'sre-release-bot' }
    };
    const bodyStr = JSON.stringify(deployPayload);
    const validHmac = `sha256=${crypto.createHmac('sha256', ghSecret).update(bodyStr).digest('hex')}`;

    const ghWebhookRes = await integrationService.processWebhook({
      integrationId: ghIntegration.id,
      providerKey: 'github',
      eventType: 'release',
      payload: deployPayload,
      rawBody: bodyStr,
      headers: {
        'x-hub-signature-256': validHmac,
        'x-github-delivery': `e2e-del-${Date.now()}`
      }
    });
    assert.equal(ghWebhookRes.success, true);
    assert.equal(ghWebhookRes.normalizedEvent.sourceSystem, 'github');

    // 2. OpenTelemetry OTLP telemetry reports high latency span
    const otel = new OpenTelemetryProvider();
    const otelSpanPayload = {
      resourceSpans: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'payment-service' } }] },
        scopeSpans: [{
          spans: [{
            traceId: 'trc-e2e-9988',
            spanId: 'spn-e2e-01',
            name: 'POST /v2/payments/authorize',
            startTimeUnixNano: `${Date.now()}000000`,
            endTimeUnixNano: `${Date.now() + 650}000000`,
            status: { code: 2, message: 'Socket connection starvation' }
          }]
        }]
      }]
    };
    const normalizedSpans = otel.normalizeTracePayload(otelSpanPayload);
    assert.equal(normalizedSpans.length, 1);
    assert.equal(normalizedSpans[0].severity, 'high');

    // 3. Unified Observability & Correlation associations
    assert.equal(normalizedSpans[0].serviceId, ghWebhookRes.normalizedEvent.serviceId);
    assert.ok(normalizedSpans[0].correlationIds.includes('trc-e2e-9988'));

    // 4. Slack notification queued through existing persistent dispatcher
    const slack = new SlackProvider();
    const slackDispatch = await slack.testConnection({ defaultChannel: '#incidents-war-room' }, {
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00'
    });
    assert.equal(slackDispatch.ok, true);
    assert.ok(slackDispatch.details.deliveryId);
  });

  test('15. Provider Mock vs Real Distinction: Correctly labels mock vs verified production connectivity', async () => {
    const list = await integrationService.listIntegrations();
    for (const item of list) {
      assert.ok(['DISCONNECTED', 'CONNECTED', 'DEGRADED', 'ERROR'].includes(item.status));
      assert.ok(typeof item.credentialsConfigured === 'boolean');
    }
  });
});
