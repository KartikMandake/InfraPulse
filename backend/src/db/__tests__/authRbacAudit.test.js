import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import app from '../../app.js';
import * as usersRepo from '../../repositories/users.repository.js';
import * as sessionsRepo from '../../repositories/sessions.repository.js';
import * as auditRepo from '../../repositories/audit.repository.js';
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

test('1. Password Hashing: Plaintext is never stored in DB or returned in API responses', async () => {
  const adminUser = await usersRepo.findUserWithPasswordByEmail('sarah.chen@infrapulse.io');
  assert.ok(adminUser, 'Admin demo user must exist');
  assert.ok(adminUser.passwordHash, 'Password hash must exist in DB');
  assert.notEqual(adminUser.passwordHash, 'Password123!', 'Plaintext password must NEVER be stored');
  assert.match(adminUser.passwordHash, /^\$2[aby]\$\d+\$/, 'Must be a valid bcrypt hash');

  const publicUser = await usersRepo.findUserByEmail('sarah.chen@infrapulse.io');
  assert.equal(publicUser.passwordHash, undefined, 'Public user record must omit passwordHash');
});

test('2. Authentication: User registration creates account with viewer role and rejects invalid data', async () => {
  // Reject short password
  const resBad = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Shorty', email: 'short@infrapulse.io', password: 'short' })
  });
  assert.equal(resBad.status, 400, 'Password < 8 chars must be rejected');

  // Successful registration
  const uniqueEmail = `test.user.${Date.now()}@infrapulse.io`;
  const resOk = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email: uniqueEmail, password: 'SecurePassword123!' })
  });
  assert.equal(resOk.status, 201, 'Registration must succeed');

  const body = await resOk.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.data.user.email, uniqueEmail);
  assert.equal(body.data.user.role, 'viewer', 'Subsequent registrations must default to viewer');
  assert.equal(body.data.user.passwordHash, undefined, 'Password hash must never be in payload');
  assert.ok(body.data.sessionToken, 'Must issue a valid session token upon registration');

  // Verify DB record
  const dbUser = await usersRepo.findUserByEmail(uniqueEmail);
  assert.ok(dbUser);
  assert.equal(dbUser.role, 'viewer');
});

test('3. Authentication: Login validates credentials and issues server-side session', async () => {
  // Invalid password
  const resFail = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sarah.chen@infrapulse.io', password: 'WrongPassword123!' })
  });
  assert.equal(resFail.status, 401, 'Bad credentials must return 401');

  // Valid login
  const resSuccess = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sarah.chen@infrapulse.io', password: 'Password123!' })
  });
  assert.equal(resSuccess.status, 200);
  const data = await resSuccess.json();
  assert.equal(data.data.user.email, 'sarah.chen@infrapulse.io');
  assert.equal(data.data.user.role, 'admin');
  assert.ok(data.data.sessionToken);

  // Verify session in DB
  const validSession = await sessionsRepo.findValidSessionById(data.data.sessionToken);
  assert.ok(validSession, 'Session must exist in PostgreSQL sessions table');
  assert.equal(validSession.user.email, 'sarah.chen@infrapulse.io');
});

test('4. RBAC: Viewer cannot execute mutating operations (403 Forbidden)', async () => {
  // Login as Viewer
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alex.ross@infrapulse.io', password: 'Password123!' })
  });
  const { sessionToken } = (await loginRes.json()).data;

  // Attempt to acknowledge alert (requires admin or responder)
  const ackRes = await fetch(`${baseUrl}/api/alerts/ALT-1092/acknowledge`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    }
  });
  assert.equal(ackRes.status, 403, 'Viewer cannot acknowledge alerts');
  const ackBody = await ackRes.json();
  assert.equal(ackBody.error, 'Forbidden');

  // Attempt to create alert rule (requires admin)
  const ruleRes = await fetch(`${baseUrl}/api/alert-rules`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Unauthorized Rule',
      type: 'latency',
      metric: 'latency_p99',
      operator: '>',
      threshold: 500,
      severity: 'warning'
    })
  });
  assert.equal(ruleRes.status, 403, 'Viewer cannot create alert rules');

  // Attempt to read audit logs (requires admin)
  const auditRes = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.equal(auditRes.status, 403, 'Viewer cannot view audit logs');
});

test('5. RBAC: Responder can triage/acknowledge alerts but cannot create alert rules or view audit logs', async () => {
  // Login as Responder
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marcus.v@infrapulse.io', password: 'Password123!' })
  });
  const { sessionToken } = (await loginRes.json()).data;

  // Responder acknowledging alert -> Allowed
  const ackRes = await fetch(`${baseUrl}/api/alerts/ALT-1092/acknowledge`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    }
  });
  assert.equal(ackRes.status, 200, 'Responder can acknowledge alerts');

  // Responder attempting admin audit log access -> Denied
  const auditRes = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.equal(auditRes.status, 403, 'Responder cannot access audit logs');

  // Responder attempting admin alert rule creation -> Denied
  const ruleRes = await fetch(`${baseUrl}/api/alert-rules`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Responder Rule',
      type: 'latency',
      metric: 'latency_p99',
      operator: '>',
      threshold: 300
    })
  });
  assert.equal(ruleRes.status, 403, 'Responder cannot create alert rules');
});

test('6. RBAC: Admin has full privileged access across alert rules and audit logs', async () => {
  // Login as Admin
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sarah.chen@infrapulse.io', password: 'Password123!' })
  });
  const { sessionToken } = (await loginRes.json()).data;

  // Admin creating alert rule -> Allowed
  const ruleRes = await fetch(`${baseUrl}/api/alert-rules`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: `RULE-ADMIN-${Date.now()}`,
      name: 'Admin Latency Guard',
      type: 'latency',
      metric: 'latency_p99',
      operator: '>',
      threshold: 400,
      severity: 'warning'
    })
  });
  assert.equal(ruleRes.status, 201, 'Admin can create alert rules');

  // Admin accessing audit logs -> Allowed
  const auditRes = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.equal(auditRes.status, 200, 'Admin can read audit logs');
  const auditData = await auditRes.json();
  assert.ok(Array.isArray(auditData.data));
  assert.ok(auditData.data.length > 0);
});

test('7. Audit Logging: Permission denials and auth events are recorded with sanitized metadata', async () => {
  // Query audit logs for denial events
  const logs = await auditRepo.findAuditLogs({ action: 'auth.permission_denied' });
  assert.ok(logs.total > 0, 'Denial events must be audited');

  const denialEvent = logs.items[0];
  assert.equal(denialEvent.outcome, 'denied');
  assert.equal(denialEvent.action, 'auth.permission_denied');

  // Verify metadata has no passwords, secrets, or raw session cookies
  const allLogs = await auditRepo.findAuditLogs({ limit: 100 });
  for (const log of allLogs.items) {
    const metaString = JSON.stringify(log.metadata || {});
    assert.ok(!metaString.includes('Password123!'), 'No raw passwords in audit metadata');
    assert.ok(!metaString.toLowerCase().includes('bearer'), 'No bearer tokens in audit metadata');
  }
});

test('8. Authentication: Unauthenticated mutating requests return 401 Unauthorized', async () => {
  const unauthRes = await fetch(`${baseUrl}/api/alerts/ALT-1092/acknowledge`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(unauthRes.status, 401, 'Unauthenticated mutation must return 401');
});

test('9. Authentication: Logout terminates active session', async () => {
  // Login
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sarah.chen@infrapulse.io', password: 'Password123!' })
  });
  const { sessionToken } = (await loginRes.json()).data;

  // Check valid session
  const validBefore = await sessionsRepo.findValidSessionById(sessionToken);
  assert.ok(validBefore);

  // Logout
  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.equal(logoutRes.status, 200);

  // Check invalidated session
  const validAfter = await sessionsRepo.findValidSessionById(sessionToken);
  assert.equal(validAfter, null, 'Session must be deleted from PostgreSQL upon logout');
});
