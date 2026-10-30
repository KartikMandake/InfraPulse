import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildIncidentTimeline, EVENT_TYPES } from '../timeline.service.js';
import { createSimulation, resetSimulation } from '../faultLab.service.js';

test('Timeline Service: Builds unified timeline with sorted chronological events', () => {
  const timeline = buildIncidentTimeline('INC-4921');

  assert.ok(timeline.incidentId === 'INC-4921');
  assert.ok(timeline.events.length > 0);

  // Validate ascending chronological order
  for (let i = 1; i < timeline.events.length; i++) {
    const prev = timeline.events[i - 1];
    const curr = timeline.events[i];
    assert.ok(
      curr.sortMinute >= prev.sortMinute,
      `Events must be sorted chronologically: ${prev.time} (min: ${prev.sortMinute}) -> ${curr.time} (min: ${curr.sortMinute})`
    );
  }
});

test('Timeline Service: Deduplication prevents identical events from appearing twice', () => {
  const timeline = buildIncidentTimeline('INC-4921');
  const eventIds = new Set();

  for (const evt of timeline.events) {
    assert.ok(!eventIds.has(evt.id), `Duplicate event id found: ${evt.id}`);
    eventIds.add(evt.id);
  }
});

test('Timeline Service: Accurately identifies preceding deployments before incident detection', () => {
  const timeline = buildIncidentTimeline('INC-4921');
  const precedingDeploys = timeline.topologyCorrelation.precedingDeployments;

  assert.ok(precedingDeploys.length > 0, 'Preceding deployments must be detected for INC-4921');
  const canaryDep = precedingDeploys.find(d => d.serviceId === 'payment-service');
  assert.ok(canaryDep, 'Payment service deployment v1.8.3 must be identified as preceding incident');
});

test('Timeline Service: Downstream impact matches service dependency graph', () => {
  const timeline = buildIncidentTimeline('INC-4921');
  const downstream = timeline.topologyCorrelation.downstreamAffectedServices;

  // checkout-api depends on payment-service, so checkout-api is downstream
  assert.ok(downstream.includes('checkout-api'), 'checkout-api must be listed as downstream caller of payment-service');
});

test('Timeline Service: Rejects invalid incident ID with 404', () => {
  assert.throws(() => {
    buildIncidentTimeline('INC-DOES-NOT-EXIST-999');
  }, /not found/);
});

test('Timeline Service: Seamlessly correlates simulated incident events from Fault Lab', () => {
  const sim = createSimulation({ scenarioId: 'scenario-database-slowdown' });

  const timeline = buildIncidentTimeline(sim.simulatedIncident.id, {
    simulationId: sim.simulationId
  });

  assert.equal(timeline.isSimulated, true);
  assert.equal(timeline.primaryServiceId, 'ledger-db-proxy');
  assert.ok(timeline.events.length > 0);

  // Clean up
  resetSimulation(sim.simulationId);
});
