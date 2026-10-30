import { runLoadStage } from './loadRunner.js';
import { getAuthHeaders } from './authHelper.js';

export async function runIncidentLoadTest(baseUrl = 'http://localhost:5000') {
  console.log(`[LoadTest] Running incident query & mutating load test against ${baseUrl}...`);

  const { headers } = await getAuthHeaders(baseUrl, 'responder');

  // 1. Benchmark incident listing & filtering
  console.log('  Testing GET /api/incidents (Concurrency: 15)...');
  const readStage = await runLoadStage({
    requestFn: async () => {
      const res = await fetch(`${baseUrl}/api/incidents`, {
        method: 'GET',
        headers
      });
      return { status: res.status, ok: res.ok };
    },
    concurrency: 15,
    durationMs: 3000
  });

  // 2. Benchmark incident timeline query
  console.log('  Testing GET /api/incidents/INC-4921/timeline (Concurrency: 10)...');
  const timelineStage = await runLoadStage({
    requestFn: async () => {
      const res = await fetch(`${baseUrl}/api/incidents/INC-4921/timeline`, {
        method: 'GET',
        headers
      });
      return { status: res.status, ok: res.ok };
    },
    concurrency: 10,
    durationMs: 2500
  });

  return {
    'GET /api/incidents': readStage,
    'GET /api/incidents/INC-4921/timeline': timelineStage
  };
}

if (process.argv[1]?.endsWith('incident-load.js')) {
  const url = process.env.TARGET_URL || 'http://localhost:5000';
  runIncidentLoadTest(url).then(() => console.log('[IncidentLoad Completed]')).catch(console.error);
}

