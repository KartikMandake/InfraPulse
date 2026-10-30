import { runLoadStage } from './loadRunner.js';
import { getAuthHeaders } from './authHelper.js';

export async function runInvestigationLoadTest(baseUrl = 'http://localhost:5000') {
  console.log(`[LoadTest] Running RCA investigation engine load test against ${baseUrl}...`);

  const { headers } = await getAuthHeaders(baseUrl, 'responder');

  // 1. GET /api/incidents/:id/investigation (Retrieval of cached/persisted investigation)
  console.log('  Testing GET /api/incidents/INC-4921/investigation (Concurrency: 10)...');
  const getStage = await runLoadStage({
    requestFn: async () => {
      const res = await fetch(`${baseUrl}/api/incidents/INC-4921/investigation`, {
        method: 'GET',
        headers
      });
      return { status: res.status, ok: res.ok };
    },
    concurrency: 10,
    durationMs: 3000
  });

  // 2. POST /api/incidents/:id/investigation/run (Heuristic evaluation + PostgreSQL persistence)
  console.log('  Testing POST /api/incidents/INC-4921/investigation/run (Concurrency: 5)...');
  const runStage = await runLoadStage({
    requestFn: async () => {
      const res = await fetch(`${baseUrl}/api/incidents/INC-4921/investigation/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ forceFresh: false })
      });
      return { status: res.status, ok: res.ok };
    },
    concurrency: 5,
    durationMs: 3000
  });

  return {
    'GET /api/incidents/INC-4921/investigation': getStage,
    'POST /api/incidents/INC-4921/investigation/run': runStage
  };
}

if (process.argv[1]?.endsWith('investigation-load.js')) {
  const url = process.env.TARGET_URL || 'http://localhost:5000';
  runInvestigationLoadTest(url).then(() => console.log('[InvestigationLoad Completed]')).catch(console.error);
}

