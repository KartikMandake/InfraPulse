import { test } from 'node:test';
import assert from 'node:assert/strict';

import { 
  getStatus, 
  getMetrics, 
  getTraces, 
  getLogs, 
  getTelemetryMode, 
  setTelemetryMode 
} from '../telemetry.service.js';

test('Telemetry Adapter: Mode switching between demo and live works as expected', () => {
  assert.equal(getTelemetryMode(), 'demo');

  setTelemetryMode('live');
  assert.equal(getTelemetryMode(), 'live');

  // Invalid mode throws error
  assert.throws(() => {
    setTelemetryMode('invalid_mode');
  }, /Invalid mode/);

  // Restore to demo mode
  setTelemetryMode('demo');
  assert.equal(getTelemetryMode(), 'demo');
});

test('Telemetry Adapter: Status reports connectivity accurately without throwing when datasources are down', async () => {
  const status = await getStatus();

  assert.ok(status.datasources);
  assert.ok(status.datasources.prometheus);
  assert.ok(status.datasources.tempo);
  assert.ok(status.datasources.loki);
  assert.ok(status.datasources.otelCollector);
  assert.equal(typeof status.isLiveStackAvailable, 'boolean');
  assert.equal(status.activeMode, 'demo');
});

test('Telemetry Adapter: Demo mode returns valid normalized metrics, traces, and logs', async () => {
  setTelemetryMode('demo');

  const metrics = await getMetrics('http_requests_total');
  assert.equal(metrics.source, 'mock_demo');
  assert.ok(Array.isArray(metrics.result));
  assert.ok(metrics.result.length > 0);

  const traces = await getTraces(null, 'payment-service');
  assert.equal(traces.source, 'mock_demo');
  assert.ok(Array.isArray(traces.traces));
  assert.ok(traces.traces.length > 0);

  const logs = await getLogs(null, 'payment-service');
  assert.equal(logs.source, 'mock_demo');
  assert.ok(Array.isArray(logs.logs));
  assert.ok(logs.logs.length > 0);
});

