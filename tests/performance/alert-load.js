import { runLoadStage } from './loadRunner.js';
import { getAuthHeaders } from './authHelper.js';

export async function runAlertLoadTest(baseUrl = 'http://localhost:5000') {
  console.log(`[LoadTest] Running alert correlation and query load test against ${baseUrl}...`);

  const { headers } = await getAuthHeaders(baseUrl, 'responder');

  // 1. GET /api/alerts
  console.log('  Testing GET /api/alerts (Concurrency: 15)...');
  const getAlertsStage = await runLoadStage({
    requestFn: async () => {
      const res = await fetch(`${baseUrl}/api/alerts`, {
        method: 'GET',
        headers
      });
      return { status: res.status, ok: res.ok };
    },
    concurrency: 15,
    durationMs: 3000
  });

  // 2. POST /api/alerts/evaluate (Rule evaluation & deduplication)
  console.log('  Testing POST /api/alerts/evaluate (Concurrency: 5)...');
  const evalStage = await runLoadStage({
    requestFn: async () => {
      const res = await fetch(`${baseUrl}/api/alerts/evaluate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'mock' })
      });
      return { status: res.status, ok: res.ok };
    },
    concurrency: 5,
    durationMs: 2500
  });

  return {
    'GET /api/alerts': getAlertsStage,
    'POST /api/alerts/evaluate': evalStage
  };
}

if (process.argv[1]?.endsWith('alert-load.js')) {
  const url = process.env.TARGET_URL || 'http://localhost:5000';
  runAlertLoadTest(url).then(() => console.log('[AlertLoad Completed]')).catch(console.error);
}

