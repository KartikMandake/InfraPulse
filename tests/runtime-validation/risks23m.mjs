import { api, login, client, command, env, state, save } from './phase23m.mjs';
const output = {};
const db = client(); await db.connect();
try {
  const { validateEndpointUrl } = await import('../../backend/src/integrations/core/ssrfProtection.js');
  const oldMode = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  output.ssrf = ['http://127.0.0.1', 'http://10.0.0.1', 'http://localhost', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://169.254.169.254', 'http://metadata.google.internal', 'http://prometheus.internal', 'http://192.168.1.5'].map(url => ({ url, safe: validateEndpointUrl(url).safe }));
  output.ssrfPrivateOverride = validateEndpointUrl('http://10.0.0.1', { allowPrivate: true }).safe;
  process.env.NODE_ENV = oldMode;
  const { AwsIntegrationProvider } = await import('../../backend/src/integrations/providers/aws/AwsIntegrationProvider.js');
  output.awsRegions = Object.fromEntries(['ap-south-1', 'us-east-1', 'eu-west-1'].map(region => [region, new AwsIntegrationProvider().validateConfig({ region })]));
  const peers = [client(), client()]; await Promise.all(peers.map(p => p.connect()));
  const insert = (p, id, key) => p.query("INSERT INTO remediation_executions(id,resource_id,idempotency_key,executed_by,status) VALUES($1,'phase23m-race-resource',$2,'phase23m-safety-probe','EXECUTING') RETURNING id,status", [id, key]);
  output.resourceLock = await Promise.all(peers.map((p, i) => insert(p, 'phase23m-lock-' + i, 'phase23m-lock-' + i).then(r => ({ accepted: true, rows: r.rows }), e => ({ accepted: false, code: e.code, message: e.message }))));
  await db.query("DELETE FROM remediation_executions WHERE id IN ('phase23m-lock-0','phase23m-lock-1')");
  output.idempotency = await Promise.all(peers.map((p, i) => insert(p, 'phase23m-idem-' + i, 'phase23m-same-key').then(r => ({ accepted: true, rows: r.rows }), e => ({ accepted: false, code: e.code, message: e.message }))));
  await db.query("DELETE FROM remediation_executions WHERE id IN ('phase23m-idem-0','phase23m-idem-1')");
  await Promise.all(peers.map(p => p.end()));
  const childCode = `import './tests/runtime-validation/phase23m.mjs'; const {telemetryPipelineService:p}=await import('./backend/src/services/telemetryPipeline.service.js');const r=await p.normalizeAndRouteTelemetry({tenantId:'phase23m-dedup',telemetryType:'log',events:[{id:'phase23m-restart-event',eventType:'log_error',logMessage:'Synthetic restart dedup probe',serviceId:'payment-service',eventTimestamp:'2026-10-31T15:00:00Z'}]});console.log(JSON.stringify({processed:r.processedCount,duplicates:r.duplicateCount,rejected:r.rejectedCount}));const {closePool}=await import('./backend/src/db/connection.js');await closePool();`;
  output.dedupRestart = [command(process.execPath, ['--max-old-space-size=128', '--input-type=module', '-e', childCode]), command(process.execPath, ['--max-old-space-size=128', '--input-type=module', '-e', childCode])];
  output.dedupRows = (await db.query("SELECT COUNT(*) FROM normalized_events WHERE tenant_id='phase23m-dedup'")).rows;
  const { telemetryPipelineService: pipeline } = await import('../../backend/src/services/telemetryPipeline.service.js');
  output.failedEventAccounting = await pipeline.normalizeAndRouteTelemetry({ tenantId: 'phase23m-accounting', events: [{ id: 'phase23m-invalid-metric', eventType: 'metric_anomaly', timestamp: new Date().toISOString(), serviceId: 'payment-service' }] });
  output.failedEventRetry = await pipeline.normalizeAndRouteTelemetry({ tenantId: 'phase23m-accounting', events: [{ id: 'phase23m-invalid-metric', eventType: 'metric_anomaly', metric: 'cpu_percent', value: 50, timestamp: new Date().toISOString(), serviceId: 'payment-service' }] });
  output.crossTenantCollision = [];
  const { ingestEvent } = await import('../../backend/src/services/eventNormalizer.service.js');
  for (const tenantId of ['phase23m-collision-A', 'phase23m-collision-B']) output.crossTenantCollision.push(await ingestEvent({ id: 'phase23m-shared-id', metric: 'cpu_percent', value: tenantId.endsWith('A') ? 10 : 99, timestamp: new Date().toISOString(), tenantId, environment: 'staging', serviceId: 'payment-service' }));
  output.crossTenantRows = (await db.query("SELECT id,tenant_id,normalized_attributes FROM normalized_events WHERE source_ref_id='phase23m-shared-id'")).rows;
  const token = await login();
  output.apiBenchmarks = [];
  for (const concurrency of [1, 5]) for (let repetition = 1; repetition <= 3; repetition++) {
    const raw = []; const start = performance.now();
    for (let offset = 0; offset < 30; offset += concurrency) raw.push(...await Promise.all(Array.from({ length: concurrency }, () => api('/api/services', { token }).then(r => ({ status: r.status, ms: r.ms })))));
    const durationMs = performance.now() - start, times = raw.map(r => r.ms).sort((a, b) => a - b);
    output.apiBenchmarks.push({ repetition, concurrency, requests: raw.length, durationMs, requestsPerSecond: raw.length / durationMs * 1000, p50Ms: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)], raw });
  }
  output.ingestionBenchmarks = [];
  for (let repetition = 1; repetition <= 3; repetition++) {
    const events = Array.from({ length: 50 }, (_, i) => ({ id: `phase23m-perf-${repetition}-${i}`, serviceId: 'phase23m-synthetic', eventType: 'log_error', logMessage: 'Synthetic throughput probe', timestamp: new Date().toISOString(), severity: 'info' }));
    const start = performance.now(); const summary = await pipeline.normalizeAndRouteTelemetry({ tenantId: 'phase23m-perf', telemetryType: 'log', events }); const durationMs = performance.now() - start;
    output.ingestionBenchmarks.push({ repetition, events: 50, durationMs, eventsPerSecond: 50 / durationMs * 1000, processed: summary.processedCount, rejected: summary.rejectedCount });
  }
  output.queryPlan = (await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM incidents WHERE status=$1 ORDER BY created_at DESC', ['investigating'])).rows;
  output.diagnosticsAfter = await api('/api/health/diagnostics');
  output.wal = (await db.query("SELECT name,setting FROM pg_settings WHERE name IN ('archive_mode','archive_command','wal_level')")).rows;
  output.databaseConfig = { port: state.port, maxPool: env.PGMAX };
} finally { save('technical-risks-performance.json', output); await db.end(); const { closePool } = await import('../../backend/src/db/connection.js'); await closePool(); }
console.log('Technical risk probes and 180 HTTP requests / 150 ingested log events recorded');
