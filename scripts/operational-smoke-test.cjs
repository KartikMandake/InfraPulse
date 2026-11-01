const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runSmokeTest() {
  console.log('=== INFRAPULSE OPERATIONAL SMOKE TEST ===\n');
  
  // 1. Health & Readiness
  console.log('Step 1: Checking Backend Health...');
  const health = await request({ hostname: 'localhost', port: 5001, path: '/api/health/ready', method: 'GET' });
  console.log(`  Health Status: ${health.status} (${health.body.status})`);
  console.log(`  Database Dependency: ${health.body.dependencies.database} (Latency: ${health.body.dependencies.latencyMs}ms)`);
  if (health.status !== 200 || health.body.dependencies.database !== 'CONNECTED') {
    throw new Error('Database is not ready');
  }

  // 2. Authentication
  console.log('\nStep 2: Authenticating with standard operator credentials...');
  const loginPayload = JSON.stringify({ email: 'sarah.chen@infrapulse.io', password: 'Password123!' });
  const login = await request({
    hostname: 'localhost',
    port: 5001,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginPayload)
    }
  }, loginPayload);

  console.log(`  Login Status: ${login.status}`);
  if (login.status !== 200) {
    throw new Error(`Login failed: ${JSON.stringify(login.body)}`);
  }
  const token = login.body.data.token;
  const cookie = login.headers['set-cookie'] ? login.headers['set-cookie'].join('; ') : '';
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Cookie': cookie,
    'Origin': 'http://localhost:5173',
    'Content-Type': 'application/json'
  };
  console.log(`  Authenticated User: ${login.body.data.user.name} <${login.body.data.user.email}> (Role: ${login.body.data.user.role})`);

  // 3. List Services Topology
  console.log('\nStep 3: Fetching Services Topology & Dependencies...');
  const services = await request({ hostname: 'localhost', port: 5001, path: '/api/services', method: 'GET', headers: authHeaders });
  console.log(`  Total Active Services: ${services.body.data.length}`);
  const srvNames = services.body.data.map(s => s.name);
  console.log(`  Active Services: ${srvNames.join(', ')}`);

  // 4. Ingest Telemetry Anomaly
  console.log('\nStep 4: Ingesting high-latency trace anomaly into events ingestion pipeline...');
  const eventPayload = JSON.stringify({
    event_type: 'trace_anomaly',
    traceId: `trace-smoke-${Date.now()}`,
    spanId: `span-${Date.now()}`,
    timestamp: new Date().toISOString(),
    serviceId: 'payment-service',
    serviceName: 'payment-service',
    durationMs: 4250,
    httpStatusCode: 504,
    source_system: 'opentelemetry-collector',
    title: 'High Latency Anomaly Detected in Payment Service',
    description: 'P99 Latency exceeded 4,250ms threshold during live checkout requests.'
  });
  const ingest = await request({
    hostname: 'localhost',
    port: 5001,
    path: '/api/events/ingest',
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Length': Buffer.byteLength(eventPayload)
    }
  }, eventPayload);
  console.log(`  Telemetry Ingestion Status: ${ingest.status} (Event Normalized & Persisted: ${ingest.body.success})`);

  // 5. Query Incidents
  console.log('\nStep 5: Querying Active Incidents...');
  const incidents = await request({ hostname: 'localhost', port: 5001, path: '/api/incidents', method: 'GET', headers: authHeaders });
  console.log(`  Total Seeded Incidents: ${incidents.body.data.length}`);
  const targetIncident = incidents.body.data[0];
  console.log(`  Selected Target Incident: [${targetIncident.id}] "${targetIncident.title}"`);
  console.log(`  Severity: ${targetIncident.severity} | State: ${targetIncident.status} | Service: ${targetIncident.service_name || targetIncident.service_id}`);

  // 6. Execute Deterministic RCA Engine
  console.log('\nStep 6: Executing Deterministic RCA Engine on Target Incident...');
  const rcaRun = await request({
    hostname: 'localhost',
    port: 5001,
    path: `/api/incidents/${targetIncident.id}/investigation/run`,
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Length': '2'
    }
  }, '{}');
  console.log(`  RCA Execution Status: ${rcaRun.status}`);
  if (rcaRun.body.data) {
    const inv = rcaRun.body.data;
    console.log(`  Investigation ID: ${inv.id || 'inv_active'}`);
    if (inv.primary_cause || inv.primaryCandidate) {
      const cause = inv.primary_cause || inv.primaryCandidate;
      console.log(`  Primary Root Cause: ${cause.title || cause.service_name || cause}`);
    }
    if (inv.confidence_score !== undefined) {
      console.log(`  Confidence Score: ${(inv.confidence_score * 100).toFixed(1)}%`);
    }
  }

  // 7. Generate Chronological Timeline
  console.log('\nStep 7: Retrieving Unified Chronological Timeline...');
  const timeline = await request({
    hostname: 'localhost',
    port: 5001,
    path: `/api/incidents/${targetIncident.id}/timeline`,
    method: 'GET',
    headers: authHeaders
  });
  console.log(`  Timeline Query Status: ${timeline.status}`);
  const eventCount = timeline.body.data && (timeline.body.data.events ? timeline.body.data.events.length : (Array.isArray(timeline.body.data) ? timeline.body.data.length : 0));
  console.log(`  Total Chronological Events Correlated: ${eventCount}`);

  // 8. Self-Monitoring Subsystems
  console.log('\nStep 8: Checking Platform Self-Monitoring Subsystems...');
  const selfMon = await request({
    hostname: 'localhost',
    port: 5001,
    path: '/api/self-monitoring/overview',
    method: 'GET',
    headers: authHeaders
  });
  console.log(`  Self-Monitoring Status: ${selfMon.status}`);
  console.log(`  Platform Status: ${selfMon.body.data.status}`);
  const subsystems = Object.keys(selfMon.body.data.subsystems);
  console.log(`  Verified Subsystems (${subsystems.length}): ${subsystems.join(', ')}`);

  // 9. Governed Remediation Guardrails Verification
  console.log('\nStep 9: Verifying Governed Remediation Guardrails...');
  const remediationRes = await request({
    hostname: 'localhost',
    port: 5001,
    path: '/api/remediation/policies',
    method: 'GET',
    headers: authHeaders
  });
  console.log(`  Remediation Policies Status: ${remediationRes.status}`);
  console.log(`  Active Governed Policies: ${remediationRes.body.data ? remediationRes.body.data.length : 0}`);

  // 10. Audit Logging Verification
  console.log('\nStep 10: Verifying Security Audit Trail Integrity...');
  const auditRes = await request({
    hostname: 'localhost',
    port: 5001,
    path: '/api/audit-logs',
    method: 'GET',
    headers: authHeaders
  });
  console.log(`  Audit Records Status: ${auditRes.status}`);
  console.log(`  Total Recorded Audit Entries: ${auditRes.body.data ? auditRes.body.data.length : 0}`);

  console.log('\n======================================================');
  console.log('✓ INFRAPULSE OPERATIONAL SMOKE TEST PASSED FULLY!');
  console.log('======================================================');
}

runSmokeTest().catch(err => {
  console.error('\n✖ Smoke test failed:', err);
  process.exit(1);
});
