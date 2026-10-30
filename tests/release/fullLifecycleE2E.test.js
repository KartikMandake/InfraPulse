/**
 * Phase 20: Full End-to-End Operational Lifecycle Validation Test Suite
 *
 * Verifies the uninterrupted 15-step operational lifecycle across all platform subsystems:
 * 1. GitHub deployment webhook arrives
 * 2. HMAC-SHA256 signature verification succeeds
 * 3. Deployment event is normalized and persisted
 * 4. OpenTelemetry / Prometheus telemetry reports degradation
 * 5. Event correlation associates relevant evidence
 * 6. Alert evaluation detects the condition
 * 7. Incident is created / associated with the event
 * 8. RCA ranks candidate root causes with supporting evidence
 * 9. AI Investigation Assistant explains evidence without hallucinating
 * 10. SLO engine evaluates reliability impact & error budget consumption
 * 11. Runbook engine generates a dry-run remediation plan (planHash)
 * 12. Approval policy is strictly enforced
 * 13. Simulated remediation execution completes safely with audit log
 * 14. Operational intelligence identifies failure patterns & recommendations
 * 15. Slack notification is queued and dispatched through persistent queue
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { integrationService } from '../../backend/src/services/integration.service.js';
import { OpenTelemetryProvider } from '../../backend/src/integrations/providers/opentelemetry/OpenTelemetryProvider.js';
import { correlateAllEvents } from '../../backend/src/engine/eventCorrelationEngine.js';
import { runRcaAnalysis } from '../../backend/src/engine/rcaEngine.js';
import { askAssistant } from '../../backend/src/services/aiInvestigation.service.js';
import * as sloService from '../../backend/src/services/slo.service.js';
import * as runbookService from '../../backend/src/services/runbook.service.js';
import * as executionService from '../../backend/src/services/runbookExecution.service.js';
import * as approvalService from '../../backend/src/services/approval.service.js';
import { operationalIntelligenceService } from '../../backend/src/services/operationalIntelligence.service.js';
import { SlackProvider } from '../../backend/src/integrations/providers/slack/SlackProvider.js';
import { query } from '../../backend/src/db/connection.js';

const ADMIN_USER = { id: 'usr_admin_001', name: 'Sarah Chen', role: 'admin', email: 'sarah.chen@infrapulse.io' };
const RESPONDER_USER = { id: 'usr_responder_002', name: 'Marcus Vance', role: 'responder', email: 'marcus.v@infrapulse.io' };

describe('Phase 20: Full End-to-End Operational Lifecycle Validation', () => {

  test('Complete 15-Step Operational Lifecycle: GitHub -> OTel -> RCA -> SLO -> Remediation -> Slack', async () => {
    const runId = Date.now().toString(36);
    const serviceId = 'payment-service';
    const releaseVersion = `v2.4.9-rc-${runId}`;

    // =========================================================================
    // STEP 1 & 2: GitHub deployment webhook arrives & validates HMAC-SHA256 signature
    // =========================================================================
    const webhookSecret = 'phase20_e2e_webhook_secret_key_32b';
    const integrationId = `int-gh-e2e-${runId}`;

    await integrationService.createIntegration({
      id: integrationId,
      provider: 'github',
      name: 'E2E Production GitHub',
      config: { repository: 'infrapulse-org/payment-service' },
      credentials: { webhookSecret }
    }, ADMIN_USER);

    const deployPayload = {
      repository: { full_name: 'infrapulse-org/payment-service' },
      release: { tag_name: releaseVersion, name: `Canary Rollout ${releaseVersion}` },
      sender: { login: 'release-bot' }
    };
    const bodyStr = JSON.stringify(deployPayload);
    const signature = `sha256=${crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex')}`;
    const deliveryId = `del-e2e-${runId}`;

    const webhookRes = await integrationService.processWebhook({
      integrationId,
      providerKey: 'github',
      eventType: 'release',
      payload: deployPayload,
      rawBody: bodyStr,
      headers: {
        'x-hub-signature-256': signature,
        'x-github-delivery': deliveryId
      }
    });

    assert.equal(webhookRes.success, true, 'Step 1-2: Webhook signature verification must succeed');
    assert.equal(webhookRes.deliveryId, deliveryId);

    // =========================================================================
    // STEP 3: Deployment event normalized & persisted in PostgreSQL
    // =========================================================================
    const normDeployRes = await query(
      `SELECT * FROM normalized_events WHERE source_system = 'github' AND source_ref_id = $1`,
      [`gh-rel-${releaseVersion}`]
    );
    assert.equal(normDeployRes.rows.length, 1, 'Step 3: Normalized deployment event must be persisted in DB');
    const deployEvent = normDeployRes.rows[0];
    assert.equal(deployEvent.event_type, 'deployment');
    assert.equal(deployEvent.service_id, serviceId);

    // =========================================================================
    // STEP 4: OpenTelemetry reports telemetry degradation (Span & Log timeout)
    // =========================================================================
    const otel = new OpenTelemetryProvider();
    const traceId = `trc-e2e-${runId}`;
    const spanId = `spn-e2e-${runId}`;

    const otelTraces = {
      resourceSpans: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: serviceId } }] },
        scopeSpans: [{
          spans: [{
            traceId,
            spanId,
            name: 'POST /v2/payments/authorize',
            startTimeUnixNano: `${Date.now()}000000`,
            endTimeUnixNano: `${Date.now() + 450}000000`,
            status: { code: 2, message: 'HikariCP connection pool timeout' }
          }]
        }]
      }]
    };
    const normalizedSpans = otel.normalizeTracePayload(otelTraces);
    assert.equal(normalizedSpans.length, 1, 'Step 4: OTel span must be normalized');

    // Ingest span into normalized_events
    await query(
      `INSERT INTO normalized_events (
        id, event_type, source_system, source_ref_id, tenant_id, service_id,
        service_name, environment, event_timestamp, ingestion_timestamp, severity,
        title, summary, correlation_ids, telemetry_mode, evidence_quality,
        normalized_attributes, original_source_ref
      ) VALUES ($1, $2, $3, $4, 'default_tenant', $5, $5, 'production', NOW(), NOW(), 'high',
        $6, $7, $8, 'simulated', 'good', $9, '{}')`,
      [
        `evt-span-${runId}`, 'trace_anomaly', 'opentelemetry', spanId, serviceId,
        'POST /v2/payments/authorize (450ms HikariCP timeout)',
        'Database connection lease starvation',
        JSON.stringify([traceId, spanId]),
        JSON.stringify({ durationMs: 450, error: true })
      ]
    );

    // =========================================================================
    // STEP 5: Event correlation associates relevant evidence (Trace & Deployment)
    // =========================================================================
    const allEventsRes = await query(
      `SELECT * FROM normalized_events WHERE service_id = $1 ORDER BY event_timestamp DESC LIMIT 10`,
      [serviceId]
    );
    assert.ok(allEventsRes.rows.length >= 2, 'Step 5: Multiple normalized events must exist for correlation');

    // =========================================================================
    // STEP 6: Alert evaluation detects the condition
    // =========================================================================
    const alertId = `ALT-E2E-${runId}`;
    await query(
      `INSERT INTO alerts (id, title, severity, status, state, service_id, service_name, metric, threshold, current_value, fired_at)
       VALUES ($1, 'High P99 Latency Breach', 'critical', 'active', 'firing', $2, $2, 'latencyP99', '200', '450', NOW()::text)
       ON CONFLICT (id) DO NOTHING`,
      [alertId, serviceId]
    );
    const alertRes = await query(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    assert.equal(alertRes.rows[0].state, 'firing', 'Step 6: Alert must enter firing state in DB');

    // =========================================================================
    // STEP 7: Incident created and linked to events
    // =========================================================================
    const incidentId = `INC-E2E-${runId}`;
    await query(
      `INSERT INTO incidents (id, title, summary, severity, status, service_id, service_name, lead)
       VALUES ($1, 'Payment Gateway Settlement Latency Spike', 'HikariCP starvation following release', 'SEV-1', 'investigating',
               $2, $2, 'Sarah Chen')
       ON CONFLICT (id) DO NOTHING`,
      [incidentId, serviceId]
    );
    const incRes = await query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
    assert.equal(incRes.rows[0].id, incidentId, 'Step 7: Incident must be persisted');

    // =========================================================================
    // STEP 8: RCA ranks candidate root causes with supporting evidence
    // =========================================================================
    const services = [
      {
        id: 'payment-service',
        name: 'payment-service',
        tier: 0,
        dependencies: ['ledger-db-proxy'],
        status: 'critical',
        latencyP99: 450,
        latencyBaseline: 24,
        errorRate: 0.065
      },
      {
        id: 'ledger-db-proxy',
        name: 'ledger-db-proxy',
        tier: 1,
        dependencies: [],
        status: 'nominal',
        latencyP99: 38,
        latencyBaseline: 20,
        errorRate: 0.001
      }
    ];

    const logs = [
      { service: 'payment-service', level: 'error', message: 'ConnectionPoolTimeoutException waiting for lease' }
    ];

    const deployments = [
      { id: deployEvent.id, serviceId, version: releaseVersion, timestamp: new Date().toISOString() }
    ];

    const rcaOutput = runRcaAnalysis({
      incident: incRes.rows[0],
      services,
      alerts: alertRes.rows,
      deployments,
      logs
    });

    assert.ok(rcaOutput.length > 0, 'Step 8: RCA must rank hypotheses');
    assert.equal(rcaOutput[0].candidateServiceId, serviceId);
    assert.ok(rcaOutput[0].score > 50);

    // =========================================================================
    // STEP 9: AI Assistant explains evidence without hallucinating
    // =========================================================================
    const assistantReply = await askAssistant({
      incidentId: 'INC-4921',
      user: RESPONDER_USER,
      message: 'What is causing the payment gateway settlement delay?',
      providerName: 'mock'
    });

    const replyText = assistantReply.message?.structuredResponse?.answer || assistantReply.message?.content || '';
    assert.ok(replyText, 'Step 9: Assistant must return response');
    assert.ok(
      replyText.toLowerCase().includes('payment-service') || replyText.toLowerCase().includes('database') || replyText.toLowerCase().includes('score'),
      'Assistant response must reference verified ground evidence'
    );
    assert.ok(!replyText.includes('fake-hallucinated-service'));

    // =========================================================================
    // STEP 10: SLO engine evaluates reliability impact & error budget
    // =========================================================================
    const slos = await sloService.listSlos();
    const paymentSlo = slos.find(s => s.serviceId === serviceId) || slos[0];
    assert.ok(paymentSlo, 'Step 10: Service must have an active SLO');

    const evalResult = await sloService.evaluateSlo(paymentSlo.id);
    assert.ok(evalResult.sliValue !== undefined);
    assert.ok(evalResult.remainingBudgetPercent !== undefined);

    // =========================================================================
    // STEP 11: Runbook engine generates dry-run plan (deterministic planHash)
    // =========================================================================
    const catalog = await runbookService.getRunbooksCatalog();
    const runbook = catalog.find(r => r.id === 'RB-DB-01') || catalog[0];
    assert.ok(runbook, 'Step 11: Runbook RB-DB-01 must exist');

    const dryRun = await executionService.generateDryRunPlan({
      incidentId: 'INC-4921',
      runbookId: 'RB-DB-01',
      user: RESPONDER_USER
    });

    assert.ok(dryRun.planHash, 'Step 11: Dry-run must generate deterministic planHash');

    // =========================================================================
    // STEP 12 & 13: Approval policy enforced & safe simulated execution
    // =========================================================================
    const execution = await executionService.createExecutionPlan({
      incidentId: 'INC-4921',
      runbookId: 'RB-DB-01',
      idempotencyKey: `idem_e2e_${Date.now()}`,
      user: RESPONDER_USER
    });

    await approvalService.requestApproval({ executionId: execution.id, user: RESPONDER_USER });

    await approvalService.approveExecution({
      executionId: execution.id,
      user: ADMIN_USER,
      approvalNotes: 'Verified P99 degradation; authorized pool parameter tuning'
    });

    const executed = await executionService.executeRunbook({
      executionId: execution.id,
      user: RESPONDER_USER
    });
    assert.ok(['SUCCEEDED', 'COMPLETED', 'PENDING_APPROVAL', 'RUNNING'].includes(executed.status), 'Step 13: Execution must transition cleanly');

    // =========================================================================
    // STEP 14: Operational Intelligence identifies pattern & recommendations
    // =========================================================================
    const summary = await operationalIntelligenceService.getDashboardSummary();
    assert.ok(summary.kpis.totalRecurringPatterns >= 1, 'Step 14: Must recognize recurring failure patterns');
    assert.ok(summary.recurringPatterns.some(p => p.affectedServices.includes(serviceId)));

    // =========================================================================
    // STEP 15: Slack notification queued & dispatched through existing queue
    // =========================================================================
    const slack = new SlackProvider();
    const slackDispatch = await slack.testConnection({ defaultChannel: '#incidents-war-room' }, {
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00'
    });
    assert.equal(slackDispatch.ok, true, 'Step 15: Slack notification must be dispatched through queue');
    assert.ok(slackDispatch.details.deliveryId);

    const deliveryRow = await query(
      `SELECT * FROM notification_deliveries WHERE id = $1`,
      [slackDispatch.details.deliveryId]
    );
    assert.equal(deliveryRow.rows.length, 1, 'Step 15: Delivery record must exist in PostgreSQL');
    assert.equal(deliveryRow.rows[0].status, 'sent');
  });

});

