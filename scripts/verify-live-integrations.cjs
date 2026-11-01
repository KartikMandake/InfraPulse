const http = require('http');

function post(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request('http://localhost:5001' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function reqAuth(method, path, payload, token, cookie) {
  return new Promise((resolve, reject) => {
    const data = payload ? JSON.stringify(payload) : null;
    const req = http.request('http://localhost:5001' + path, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Cookie': cookie || '',
        'Origin': 'http://localhost:5173',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, body: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function verifyAllIntegrations() {
  console.log('=== INFRAPULSE LIVE INTEGRATION & TELEMETRY SUITE ===\n');

  // 1. Authenticate
  const login = await post('/api/auth/login', { email: 'sarah.chen@infrapulse.io', password: 'Password123!' });
  const token = login.body.data.token;
  const cookie = login.headers['set-cookie'] ? login.headers['set-cookie'].join('; ') : '';
  console.log(`Authenticated Operator: ${login.body.data.user.email} (${login.body.data.user.role})`);

  // 2. Query Ecosystem Catalog
  console.log('\n1. Ecosystem Providers Catalog:');
  const catalog = await reqAuth('GET', '/api/integrations/catalog', null, token, cookie);
  console.log(`   -> Total Registered Providers: ${catalog.body.data.length}`);
  catalog.body.data.forEach(p => console.log(`      * [${p.category}] ${p.name} (Key: ${p.key})`));

  // 3. Query Active Configured Integrations
  console.log('\n2. Configured Integrations Status:');
  const integrations = await reqAuth('GET', '/api/integrations', null, token, cookie);
  console.log(`   -> Total Configured Integrations: ${integrations.body.data.length}`);
  integrations.body.data.forEach(i => {
    console.log(`      * [${i.status}] ${i.name} (Provider: ${i.provider}) - LastSync: ${i.lastSyncAt || 'Never'}`);
  });

  // 4. Live Prometheus Metrics
  console.log('\n3. Real Prometheus Metrics Source:');
  const promMetrics = await new Promise((resolve) => {
    http.get('http://127.0.0.1:5001/metrics', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, length: data.length, lines: data.split('\n').filter(l => l && !l.startsWith('#')).length }));
    });
  });
  console.log(`   -> Scraped /metrics: Status ${promMetrics.status}, Total Metric Series: ${promMetrics.lines}`);

  // 5. Ingestion of Real OTLP Spans
  console.log('\n4. Live OpenTelemetry OTLP Trace Ingestion:');
  const otelTracePayload = {
    resourceSpans: [{
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'payment-service' } }] },
      scopeSpans: [{
        scope: { name: 'payment-tracer' },
        spans: [{
          traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
          spanId: '00f067aa0ba902b7',
          name: 'DB Query: SELECT * FROM payment_accounts',
          kind: 3,
          startTimeUnixNano: '1793526000000000000',
          endTimeUnixNano: '1793526003200000000',
          status: { code: 2, message: 'Database query timeout exceeded 3000ms' }
        }]
      }]
    }]
  };
  const traceRes = await new Promise((resolve) => {
    const data = JSON.stringify(otelTracePayload);
    const req = http.request('http://localhost:5001/api/integrations/otlp/v1/traces', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-OTLP-KEY': 'otlp_runtime_key'
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.write(data);
    req.end();
  });
  console.log(`   -> OTLP Ingestion Result: Status ${traceRes.status} (Processed: ${traceRes.body.data.processedCount})`);

  // 6. Ingestion of Real GitHub Push Webhook
  console.log('\n5. Live GitHub Webhook Ingestion:');
  const crypto = require('crypto');
  const ghPayload = JSON.stringify({
    repository: { full_name: 'KartikMandake/InfraPulse' },
    ref: 'refs/heads/kartik',
    head_commit: {
      id: '3bd6dbae18408f6d6545233eafe630f7690184c2',
      message: 'feat(ops): operational deployment, runtime validation and smoke test suites',
      timestamp: new Date().toISOString(),
      author: { name: 'Vanshika', email: 'kartikmandake2611@gmail.com' }
    }
  });
  const ghSig = 'sha256=' + crypto.createHmac('sha256', 'gh_runtime_secret').update(ghPayload).digest('hex');
  const ghRes = await new Promise((resolve) => {
    const req = http.request('http://localhost:5001/api/integrations/webhooks/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(ghPayload),
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'del-' + Date.now(),
        'X-Hub-Signature-256': ghSig
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.write(ghPayload);
    req.end();
  });
  console.log(`   -> GitHub Webhook Result: Status ${ghRes.status} (Delivery ID: ${ghRes.body.data.deliveryId})`);

  console.log('\n======================================================');
  console.log('✓ REAL INTEGRATIONS VERIFICATION COMPLETED FULLY!');
  console.log('======================================================');
}

verifyAllIntegrations().catch(console.error);
