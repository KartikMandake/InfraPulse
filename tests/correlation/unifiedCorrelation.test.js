import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMetricEvent } from '../../backend/src/engine/normalizers/metricEventNormalizer.js';
import { normalizeLogEvent } from '../../backend/src/engine/normalizers/logEventNormalizer.js';
import { normalizeTraceEvent } from '../../backend/src/engine/normalizers/traceEventNormalizer.js';
import { normalizeAlertEvent } from '../../backend/src/engine/normalizers/alertEventNormalizer.js';
import { normalizeIncidentEvent } from '../../backend/src/engine/normalizers/incidentEventNormalizer.js';
import { normalizeDeploymentEvent } from '../../backend/src/engine/normalizers/deploymentEventNormalizer.js';
import { normalizeSloEvent } from '../../backend/src/engine/normalizers/sloEventNormalizer.js';
import { normalizeRunbookEvent } from '../../backend/src/engine/normalizers/runbookEventNormalizer.js';
import { normalizeEventPayload, ingestEvent } from '../../backend/src/services/eventNormalizer.service.js';
import { correlateEventPair, correlateAllEvents } from '../../backend/src/engine/eventCorrelationEngine.js';
import { buildInvestigationGraph } from '../../backend/src/engine/investigationGraphEngine.js';
import * as eventsRepo from '../../backend/src/repositories/events.repository.js';

const MOCK_TOPOLOGY = [
  { id: 'payment-service', name: 'payment-service', tier: 0, dependencies: ['ledger-db-proxy'] },
  { id: 'checkout-api', name: 'checkout-api', tier: 0, dependencies: ['payment-service'] },
  { id: 'ledger-db-proxy', name: 'ledger-db-proxy', tier: 1, dependencies: [] },
  { id: 'analytics-worker', name: 'analytics-worker', tier: 2, dependencies: [] }
];

describe('Phase 17: Unified Observability Intelligence & Event Correlation', () => {

  test('1. Event Normalizers: Correctly normalizes all 8 canonical event types', () => {
    const now = new Date().toISOString();

    const metric = normalizeMetricEvent({
      metric: 'latency_p99',
      currentValue: 412,
      baselineValue: 24,
      serviceId: 'payment-service',
      timestamp: now
    });
    assert.equal(metric.eventType, 'metric_anomaly');
    assert.equal(metric.severity, 'critical');
    assert.equal(metric.normalizedAttributes.currentValue, 412);

    const log = normalizeLogEvent({
      message: 'ConnectionPoolTimeoutException: 100/100 active connections',
      serviceId: 'payment-service',
      level: 'ERROR',
      timestamp: now
    });
    assert.equal(log.eventType, 'log_error');
    assert.equal(log.severity, 'high');

    const trace = normalizeTraceEvent({
      traceId: 'trc-abc-123',
      serviceId: 'payment-service',
      durationMs: 412,
      status: 'ERROR',
      timestamp: now
    });
    assert.equal(trace.eventType, 'trace_anomaly');
    assert.ok(trace.correlationIds.includes('trc-abc-123'));

    const alert = normalizeAlertEvent({
      id: 'ALT-1092',
      serviceId: 'payment-service',
      severity: 'critical',
      firedAt: now
    });
    assert.equal(alert.eventType, 'alert_transition');
    assert.equal(alert.sourceRefId, 'ALT-1092');

    const inc = normalizeIncidentEvent({
      id: 'INC-4921',
      serviceId: 'payment-service',
      severity: 'SEV-1',
      startedAt: now
    });
    assert.equal(inc.eventType, 'incident_transition');
    assert.equal(inc.severity, 'critical');

    const dep = normalizeDeploymentEvent({
      id: 'chg-1094',
      serviceId: 'payment-service',
      newVersion: 'v1.8.3',
      deployedAt: now,
      status: 'failed'
    });
    assert.equal(dep.eventType, 'deployment_change');
    assert.equal(dep.severity, 'critical');

    const slo = normalizeSloEvent({
      sloId: 'slo-pay',
      serviceId: 'payment-service',
      status: 'breached',
      burnRate1h: 14.4,
      evaluatedAt: now
    });
    assert.equal(slo.eventType, 'slo_event');
    assert.equal(slo.severity, 'critical');

    const rb = normalizeRunbookEvent({
      executionId: 'exec-101',
      serviceId: 'payment-service',
      status: 'SUCCEEDED',
      createdAt: now
    });
    assert.equal(rb.eventType, 'runbook_execution');
    assert.equal(rb.sourceRefId, 'exec-101');
  });

  test('2. Invalid Event Rejection: Catches malformed events without throwing unhandled exceptions', async () => {
    const invalidPayload = {
      eventType: 'metric_anomaly',
      // Missing required metric and timestamp
    };

    const res = await ingestEvent(invalidPayload);
    assert.equal(res.success, false);
    assert.ok(res.error.includes('Missing required field'));
    assert.ok(res.failureId);
  });

  test('3. Timestamp Normalization: Converts local and epoch timestamps to UTC ISO strings', () => {
    const epochTime = 1761825600000;
    const normalized = normalizeEventPayload({
      type: 'metric_anomaly',
      metric: 'cpu_usage',
      timestamp: epochTime
    });

    assert.equal(normalized.eventTimestamp, new Date(epochTime).toISOString());
    assert.ok(normalized.eventTimestamp.endsWith('Z'));
  });

  test('4. Duplicate Ingestion: Idempotent upsert on unique (source_system, source_ref_id, event_type)', async () => {
    const now = new Date().toISOString();
    const payload = {
      id: 'test-dedupe-1',
      sourceSystem: 'test_system',
      eventType: 'metric_anomaly',
      metric: 'test_metric',
      currentValue: 100,
      timestamp: now
    };

    const first = await ingestEvent(payload);
    assert.equal(first.success, true);

    // Ingest again with updated value
    payload.currentValue = 200;
    const second = await ingestEvent(payload);
    assert.equal(second.success, true);
    assert.equal(second.event.id, first.event.id);
  });

  test('5. Out-of-Order & Delayed Events: Chronologically sorted by eventTimestamp', async () => {
    const { getUnifiedIncidentTimeline } = await import('../../backend/src/services/unifiedTimeline.service.js');

    const timelineData = await getUnifiedIncidentTimeline('INC-4921');
    assert.ok(timelineData.timeline.length > 1);

    for (let i = 0; i < timelineData.timeline.length - 1; i++) {
      const t1 = new Date(timelineData.timeline[i].timestamp).getTime();
      const t2 = new Date(timelineData.timeline[i + 1].timestamp).getTime();
      assert.ok(t1 <= t2, `Timeline was out of chronological order at index ${i}`);
    }
  });

  test('6. Same-Trace Correlation: Links events sharing trace ID with score 95', () => {
    const eventA = {
      id: 'evt-1',
      eventType: 'metric_anomaly',
      serviceId: 'payment-service',
      eventTimestamp: '2026-10-30T14:30:00Z',
      correlationIds: ['trace-xyz-789']
    };
    const eventB = {
      id: 'evt-2',
      eventType: 'log_error',
      serviceId: 'payment-service',
      eventTimestamp: '2026-10-30T14:30:10Z',
      correlationIds: ['trace-xyz-789']
    };

    const corr = correlateEventPair(eventA, eventB, MOCK_TOPOLOGY);
    assert.ok(corr);
    assert.equal(corr.relationshipType, 'same_trace');
    assert.equal(corr.correlationScore, 95);
    assert.equal(corr.confidence, 'high');
  });

  test('7. Dependency-Aware Correlation: Links caller and callee services with topology path', () => {
    // checkout-api calls payment-service
    const eventCheckout = {
      id: 'evt-chk',
      eventType: 'metric_anomaly',
      serviceId: 'checkout-api',
      eventTimestamp: '2026-10-30T14:30:00Z'
    };
    const eventPayment = {
      id: 'evt-pay',
      eventType: 'metric_anomaly',
      serviceId: 'payment-service',
      eventTimestamp: '2026-10-30T14:30:30Z'
    };

    const corr = correlateEventPair(eventCheckout, eventPayment, MOCK_TOPOLOGY);
    assert.ok(corr);
    assert.equal(corr.relationshipType, 'dependency_related');
    assert.equal(corr.correlationScore, 75);
    assert.deepEqual(corr.dependencyPath, ['checkout-api', 'payment-service']);
  });

  test('8. Deployment Association: Links preceding deployment with subsequent anomaly', () => {
    const deployEvent = {
      id: 'evt-dep',
      eventType: 'deployment_change',
      sourceRefId: 'chg-1094',
      serviceId: 'payment-service',
      eventTimestamp: '2026-10-30T14:22:00Z'
    };
    const anomalyEvent = {
      id: 'evt-anom',
      eventType: 'metric_anomaly',
      serviceId: 'payment-service',
      eventTimestamp: '2026-10-30T14:28:00Z' // 6m later
    };

    const corr = correlateEventPair(deployEvent, anomalyEvent, MOCK_TOPOLOGY);
    assert.ok(corr);
    assert.equal(corr.relationshipType, 'deployment_related');
    assert.equal(corr.correlationScore, 82);
  });

  test('9. Contradictory Evidence: Enforces that temporal coincidence alone gives low score and adds caveat', () => {
    // analytics-worker and payment-service have NO dependency edge
    const eventA = {
      id: 'evt-an',
      eventType: 'metric_anomaly',
      serviceId: 'analytics-worker',
      eventTimestamp: '2026-10-30T14:30:00Z'
    };
    const eventB = {
      id: 'evt-pay',
      eventType: 'metric_anomaly',
      serviceId: 'payment-service',
      eventTimestamp: '2026-10-30T14:30:15Z'
    };

    const corr = correlateEventPair(eventA, eventB, MOCK_TOPOLOGY);
    assert.ok(corr);
    assert.equal(corr.relationshipType, 'temporally_related');
    assert.ok(corr.correlationScore < 30);
    assert.ok(corr.contradictoryEvidence.length > 0);
    assert.ok(corr.contradictoryEvidence[0].includes('Temporal coincidence alone is NOT evidence of causal relation'));
  });

  test('10. Investigation Graph Construction: Assembles nodes, edges, and prevents duplicates', () => {
    const incident = { id: 'INC-4921', title: 'Payment Surge', serviceId: 'payment-service', startedAt: '2026-10-30T14:34:00Z' };
    const events = [
      { id: 'e1', eventType: 'metric_anomaly', serviceId: 'payment-service', eventTimestamp: '2026-10-30T14:28:00Z', title: 'Latency surge' },
      { id: 'e2', eventType: 'alert_transition', serviceId: 'payment-service', eventTimestamp: '2026-10-30T14:32:00Z', title: 'Alert fired' }
    ];
    const correlations = [
      { sourceEventId: 'e1', targetEventId: 'e2', relationshipType: 'same_service', correlationScore: 80, supportingReasons: ['same service'] }
    ];

    const graph = buildInvestigationGraph({
      incident,
      events,
      correlations,
      services: MOCK_TOPOLOGY
    });

    assert.ok(graph.nodes.length >= 6); // Incident + 4 Services + 2 Events
    assert.ok(graph.edges.length >= 3);
    // Ensure no duplicate node IDs
    const nodeIds = graph.nodes.map(n => n.id);
    assert.equal(nodeIds.length, new Set(nodeIds).size);
  });

  test('11. Disconnected Groups Detection: Correctly identifies isolated unlinked nodes', () => {
    const incident = { id: 'INC-4921', serviceId: 'payment-service' };
    const events = [
      { id: 'e-isolated', eventType: 'log_error', serviceId: null, eventTimestamp: '2026-10-30T12:00:00Z', title: 'Isolated log' }
    ];

    const graph = buildInvestigationGraph({
      incident,
      events,
      correlations: [],
      services: []
    });

    assert.ok(graph.disconnectedGroups.some(g => g.nodeId === 'e-isolated'));
  });

  test('12. Database Persistence: Seeded normalized events and correlations survive in PostgreSQL', async () => {
    const event = await eventsRepo.findNormalizedEventById('evt-dep-chg-1094');
    assert.ok(event);
    assert.equal(event.service_id, 'payment-service');
    assert.equal(event.event_type, 'deployment_change');

    const correlations = await eventsRepo.listEventCorrelations({ sourceEventId: 'evt-dep-chg-1094' });
    assert.ok(correlations.length >= 1);
    assert.equal(correlations[0].relationship_type, 'deployment_related');
  });

  test('13. Live vs Simulated Telemetry Separation: Telemetry mode is explicitly stored and exposed', async () => {
    const event = await eventsRepo.findNormalizedEventById('evt-met-pay-p99');
    assert.ok(event);
    assert.equal(event.telemetry_mode, 'simulated');
  });

  test('14. Causal Sequence Analysis: Identifies earliest observed signal and service propagation order', async () => {
    const { getUnifiedIncidentTimeline } = await import('../../backend/src/services/unifiedTimeline.service.js');

    const result = await getUnifiedIncidentTimeline('INC-4921');
    assert.ok(result.sequenceAnalysis.earliestObservedSignal);
    assert.equal(result.sequenceAnalysis.earliestObservedSignal.serviceId, 'payment-service');
    assert.ok(result.sequenceAnalysis.potentialPropagationSequence.length > 0);
  });

  test('15. Tenant Isolation: Events query filters strictly by tenant_id', async () => {
    const events = await eventsRepo.listNormalizedEvents({ tenantId: 'non_existent_tenant' });
    assert.equal(events.length, 0);
  });
});

