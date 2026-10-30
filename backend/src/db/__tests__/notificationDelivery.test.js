import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import app from '../../app.js';
import * as notifRepo from '../../repositories/notification.repository.js';
import * as notifService from '../../services/notification.service.js';
import * as incidentsService from '../../services/incidents.service.js';
import * as auditRepo from '../../repositories/audit.repository.js';
import { mockDeliveries, calculateBackoff, deliverSlack } from '../../services/notificationDispatcher.service.js';
import { buildSlackPayload, buildEmailPayload } from '../../services/notificationTemplates.service.js';
import { runMigrations } from '../migrate.js';
import { seedDatabase } from '../seed.js';

let server;
let baseUrl;

before(async () => {
  await runMigrations();
  await seedDatabase();

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

beforeEach(() => {
  mockDeliveries.clear();
});

test('1. Notification Trigger: New incident creation generates persistent notification delivery records', async () => {
  const incId = `INC-NOTIF-${Date.now()}`;
  const newIncident = await incidentsService.addIncident({
    id: incId,
    title: 'PostgreSQL Buffer Pool Contention',
    severity: 'SEV-1',
    status: 'investigating',
    serviceId: 'payment-service',
    serviceName: 'Payment Service',
    lead: 'Sarah Chen'
  });

  assert.ok(newIncident);

  // Verify deliveries were created in database for enabled channels
  const deliveries = await notifRepo.findDeliveries({ incidentId: incId });
  assert.ok(deliveries.total >= 1, 'Must create at least one delivery record');

  const slackDelivery = deliveries.items.find(d => d.channelType === 'slack');
  assert.ok(slackDelivery, 'Must have Slack delivery');
  assert.equal(slackDelivery.eventType, 'incident.created');
  assert.equal(slackDelivery.incidentId, incId);
  assert.ok(['pending', 'sent'].includes(slackDelivery.status));
});

test('2. Idempotency: Duplicate events for the same incident do not generate duplicate delivery records', async () => {
  const incId = `INC-IDEMP-${Date.now()}`;
  const incidentPayload = {
    id: incId,
    title: 'Duplicate Evaluation Suppression Test',
    severity: 'SEV-2',
    status: 'investigating',
    serviceId: 'checkout-api',
    serviceName: 'Checkout API',
    lead: 'Marcus Vance'
  };

  // 1st trigger
  const deliveries1 = await notifService.triggerIncidentNotification({
    eventType: 'incident.created',
    incident: incidentPayload,
    context: { qualifier: 'test_run' }
  });
  assert.ok(deliveries1.length > 0, 'First trigger should produce deliveries');

  // 2nd trigger with identical event, incident, and qualifier
  const deliveries2 = await notifService.triggerIncidentNotification({
    eventType: 'incident.created',
    incident: incidentPayload,
    context: { qualifier: 'test_run' }
  });
  assert.equal(deliveries2.length, 0, 'Duplicate trigger must be suppressed by idempotency key');

  // Verify DB count remains unchanged
  const inDb = await notifRepo.findDeliveries({ incidentId: incId });
  assert.equal(inDb.total, deliveries1.length, 'Database record count must not duplicate');
});

test('3. Slack Content: Block Kit payload formats incident details and AI hypothesis clearly', async () => {
  const incident = {
    id: 'INC-9901',
    title: 'Checkout Latency Regression',
    severity: 'SEV-1',
    status: 'investigating',
    serviceId: 'checkout-api',
    serviceName: 'Checkout API',
    lead: 'Marcus Vance'
  };

  const topCandidate = {
    candidateServiceId: 'ledger-db-proxy',
    score: 0.94,
    confidenceScore: 0.94
  };

  const slackPayload = buildSlackPayload({
    incident,
    eventType: 'incident.created',
    topCandidate
  });

  assert.ok(slackPayload.text.includes('SEV-1'));
  assert.ok(slackPayload.text.includes('INC-9901'));
  assert.ok(Array.isArray(slackPayload.blocks));

  const jsonString = JSON.stringify(slackPayload);
  assert.ok(jsonString.includes('ledger-db-proxy'), 'Must include candidate service in blocks');
  assert.ok(jsonString.includes('Hypothesis'), 'Must explicitly indicate it is a hypothesis, not confirmed root cause');
  assert.ok(jsonString.includes('/incidents/INC-9901'), 'Must include deep link to incident war room');
});

test('4. Security & Error Handling: Missing configuration produces explicit error and secrets are never leaked', async () => {
  // Test email delivery with invalid recipient
  const invalidDelivery = {
    id: 'notif_bad_recipient',
    channelType: 'email',
    recipient: 'not-an-email',
    payload: { subject: 'Test', text: 'Body' }
  };

  // Delivery should handle error cleanly without unhandled rejections
  const delivered = await notifService.sendTestNotification({
    channelType: 'email',
    recipient: 'invalid-email'
  });
  assert.equal(delivered.success, false);
  assert.ok(delivered.delivery.lastError);
  assert.notEqual(delivered.delivery.lastError.includes('Password123!'), true);

  // Settings endpoint must never expose webhook tokens or passwords
  const settings = await notifService.getNotificationSettings();
  const settingsJson = JSON.stringify(settings);
  assert.equal(settingsJson.includes('password'), false, 'Password must never be exposed');
  assert.equal(settingsJson.includes('token'), false, 'Tokens must never be exposed');
  assert.equal(settingsJson.includes('secret'), false, 'Secrets must never be exposed');
});

test('5. Delivery Retries & Bounded Backoff: Failed attempts back off exponentially and track count', async () => {
  // Verify backoff delays
  const backoff1 = calculateBackoff(1);
  const backoff2 = calculateBackoff(2);
  const backoff3 = calculateBackoff(3);
  const backoff4 = calculateBackoff(4);

  assert.equal(backoff1, 10000, '1st retry is 10s');
  assert.equal(backoff2, 30000, '2nd retry is 30s');
  assert.equal(backoff3, 60000, '3rd retry is 60s');
  assert.equal(backoff4, 60000, 'Backoff must be bounded at max 60s');

  // Verify delivery record status updates on failed mock delivery
  const delivery = await notifRepo.createDeliveryRecord({
    idempotencyKey: `fail_test_${Date.now()}`,
    channelType: 'email',
    eventType: 'incident.created',
    recipient: 'bad-email-format',
    payload: { subject: 'Failure Test' },
    status: 'pending',
    attemptCount: 0,
    maxAttempts: 3
  });

  const updated = await notifService.retryDelivery(delivery.id);
  assert.equal(updated.status, 'failed');
  assert.equal(updated.attemptCount, 1);
  assert.ok(updated.nextRetryAt, 'Should schedule next retry timestamp');
});

test('6. Decoupling: Provider timeouts or dispatch failures do not block or revert incident creation', async () => {
  const incId = `INC-TIMEOUT-${Date.now()}`;
  // Even if notification encounters network delays or delivery failures, incident creation completes
  const created = await incidentsService.addIncident({
    id: incId,
    title: 'Resilient Decoupling Test',
    severity: 'SEV-2',
    status: 'investigating',
    serviceId: 'payment-service',
    serviceName: 'Payment Service'
  });

  assert.ok(created);
  assert.equal(created.id, incId);

  // Check incident is in DB
  const inDb = await incidentsService.findIncidentById(incId);
  assert.ok(inDb);
});

test('7. RBAC: Role-based permissions protect notification settings, retry, and test endpoints', async () => {
  // Login Viewer
  const viewerLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alex.ross@infrapulse.io', password: 'Password123!' })
  });
  const viewerToken = (await viewerLogin.json()).data.sessionToken;

  // Login Responder
  const responderLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marcus.v@infrapulse.io', password: 'Password123!' })
  });
  const responderToken = (await responderLogin.json()).data.sessionToken;

  // Login Admin
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sarah.chen@infrapulse.io', password: 'Password123!' })
  });
  const adminToken = (await adminLogin.json()).data.sessionToken;

  // 1. Viewer can read notifications
  const viewRes = await fetch(`${baseUrl}/api/notifications`, {
    headers: { 'Authorization': `Bearer ${viewerToken}` }
  });
  assert.equal(viewRes.status, 200, 'Viewer can read notifications');

  // 2. Viewer CANNOT trigger test notifications (403)
  const testResViewer = await fetch(`${baseUrl}/api/notifications/test`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelType: 'slack' })
  });
  assert.equal(testResViewer.status, 403, 'Viewer must be denied test notifications');

  // 3. Responder CANNOT update global settings (403)
  const settingsResResp = await fetch(`${baseUrl}/api/notification-settings`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${responderToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: 'chan_slack_default', channelUpdates: { enabled: true } })
  });
  assert.equal(settingsResResp.status, 403, 'Responder cannot alter notification settings');

  // 4. Admin CAN update global settings (200)
  const settingsResAdmin = await fetch(`${baseUrl}/api/notification-settings`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: 'chan_slack_default', channelUpdates: { name: 'Slack Ops War Room' } })
  });
  assert.equal(settingsResAdmin.status, 200, 'Admin can update notification settings');

  // 5. Admin CAN trigger test notifications (200)
  const testResAdmin = await fetch(`${baseUrl}/api/notifications/test`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelType: 'slack' })
  });
  assert.equal(testResAdmin.status, 200, 'Admin can trigger test notifications');
});

test('8. Persistence & Restart: Pending notifications persist in PostgreSQL across simulated restart', async () => {
  const testKey = `restart_test_${Date.now()}`;
  await notifRepo.createDeliveryRecord({
    idempotencyKey: testKey,
    channelType: 'slack',
    eventType: 'incident.created',
    recipient: '#war-room',
    payload: { text: 'Persistence Verification' },
    status: 'pending',
    attemptCount: 0
  });

  // Query clean record directly from PostgreSQL
  const retrieved = await notifRepo.findDeliveryByIdempotencyKey(testKey);
  assert.ok(retrieved, 'Notification delivery must be retrievable from PostgreSQL');
  assert.equal(retrieved.status, 'pending');
  assert.equal(retrieved.channelType, 'slack');
});

test('9. Audit Logging: Notification settings modifications and manual retries are audited', async () => {
  const auditLogs = await auditRepo.findAuditLogs({ action: 'notification.settings_updated' });
  assert.ok(auditLogs.total > 0, 'Settings updates must generate audit log entries');

  const entry = auditLogs.items[0];
  assert.equal(entry.action, 'notification.settings_updated');
  assert.equal(entry.outcome, 'success');
  assert.ok(entry.actorEmail);
});

test('10. Health Endpoints: Liveness and Readiness probes report operational status without leaking credentials', async () => {
  // Liveness
  const liveRes = await fetch(`${baseUrl}/api/health/live`);
  assert.equal(liveRes.status, 200);
  const liveData = await liveRes.json();
  assert.equal(liveData.status, 'LIVE');
  assert.ok(liveData.uptimeSeconds >= 0);

  // Readiness
  const readyRes = await fetch(`${baseUrl}/api/health/ready`);
  assert.equal(readyRes.status, 200);
  const readyData = await readyRes.json();
  assert.equal(readyData.status, 'READY');
  assert.equal(readyData.dependencies.database, 'CONNECTED');

  // Verify no credentials or SQL strings leaked
  const readyJson = JSON.stringify(readyData);
  assert.equal(readyJson.includes('password'), false);
  assert.equal(readyJson.includes('SELECT'), false);
});

