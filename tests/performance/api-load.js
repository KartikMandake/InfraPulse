import { runLoadStage } from './loadRunner.js';
import { getAuthHeaders } from './authHelper.js';

export async function runApiLoadTest(baseUrl = 'http://localhost:5000') {
  console.log(`[LoadTest] Testing core endpoints at ${baseUrl}...`);

  const { headers } = await getAuthHeaders(baseUrl, 'admin');

  const endpoints = [
    { name: 'GET /api/health/ready', path: '/api/health/ready', method: 'GET', auth: false },
    { name: 'GET /api/services', path: '/api/services', method: 'GET', auth: true },
    { name: 'GET /api/incidents', path: '/api/incidents', method: 'GET', auth: true },
    { name: 'GET /api/alerts', path: '/api/alerts', method: 'GET', auth: true }
  ];

  const results = {};

  for (const ep of endpoints) {
    const reqHeaders = ep.auth ? headers : { 'Content-Type': 'application/json' };
    
    // Stage 1: Warmup & low concurrency (10 concurrent workers, 2500ms)
    console.log(`  Evaluating ${ep.name} (Concurrency: 10)...`);
    const stage = await runLoadStage({
      requestFn: async () => {
        const r = await fetch(`${baseUrl}${ep.path}`, {
          method: ep.method,
          headers: reqHeaders
        });
        return { status: r.status, ok: r.ok };
      },
      concurrency: 10,
      durationMs: 2500
    });

    results[ep.name] = stage;
    console.log(`    -> RPS: ${stage.rps}, p50: ${stage.percentiles.p50}ms, p95: ${stage.percentiles.p95}ms, p99: ${stage.percentiles.p99}ms, ErrorRate: ${stage.errorRate}%`);
  }

  return results;
}

if (process.argv[1]?.endsWith('api-load.js')) {
  const url = process.env.TARGET_URL || 'http://localhost:5000';
  runApiLoadTest(url).then(res => {
    console.log('[LoadTest Completed]');
  }).catch(err => {
    console.error('[LoadTest Error]:', err);
    process.exit(1);
  });
}

