/**
 * Phase 29: Production Performance & Benchmark Suite
 * Measures empirical throughput, latency percentiles, RCA evaluation time, and database metrics.
 */

import http from 'node:http';
import os from 'node:os';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import app from '../../backend/src/app.js';
import { query, getPool, closePool } from '../../backend/src/db/connection.js';
import { runRcaAnalysis } from '../../backend/src/engine/rcaEngine.js';
import { evaluateRCAEngine } from '../rca-evaluation/evaluationRunner.js';

process.env.NODE_ENV = 'test';
process.env.PGDATABASE = 'infrapulse';
process.env.PGDATABASE_TEST = 'infrapulse';
process.env.PGSSLMODE = 'disable';
process.env.NOTIFICATION_MOCK_MODE = 'true';

async function runBenchmarkStage({ name, fn, concurrency = 5, iterations = 50 }) {
  const latencies = [];
  let errors = 0;
  const startTime = performance.now();

  const worker = async () => {
    while (true) {
      if (latencies.length + errors >= iterations) break;
      const iterStart = performance.now();
      try {
        await fn();
        latencies.push(performance.now() - iterStart);
      } catch (err) {
        errors++;
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const totalDurationMs = performance.now() - startTime;
  latencies.sort((a, b) => a - b);

  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const rps = (latencies.length / (totalDurationMs / 1000)).toFixed(1);
  const errorRate = ((errors / iterations) * 100).toFixed(1);

  return {
    name,
    iterations,
    concurrency,
    totalDurationMs: totalDurationMs.toFixed(1),
    rps: Number(rps),
    errorRate: Number(errorRate),
    percentiles: {
      p50: Number(p50.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      p99: Number(p99.toFixed(2))
    }
  };
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`INFRAPULSE PHASE 29: EMPIRICAL PERFORMANCE BENCHMARK`);
  console.log(`Platform: Node.js ${process.version} | ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`Hardware: ${os.cpus()[0]?.model} (${os.cpus().length} vCPUs) | ${Math.round(os.totalmem() / (1024**3))} GB RAM`);
  console.log(`======================================================\n`);

  // Start ephemeral test server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Log in as admin to get session cookie
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-proto': 'https' },
    body: JSON.stringify({ email: 'admin@infrapulse.io', password: 'password123' })
  });
  const cookieHeader = loginRes.headers.get('set-cookie');
  const authHeaders = {
    'Content-Type': 'application/json',
    'x-forwarded-proto': 'https',
    ...(cookieHeader ? { Cookie: cookieHeader.split(';')[0] } : {})
  };

  const results = {
    environment: {
      node: process.version,
      os: `${os.type()} ${os.arch()}`,
      cpus: os.cpus().length,
      memoryGb: Math.round(os.totalmem() / (1024**3))
    },
    benchmarks: [],
    rcaEvaluation: null,
    memoryMetrics: null,
    poolMetrics: null
  };

  // 1. Health Probe
  console.log('Benchmarking: GET /api/health/ready (Warmup & Baseline)...');
  const b1 = await runBenchmarkStage({
    name: 'GET /api/health/ready',
    fn: async () => {
      const res = await fetch(`${baseUrl}/api/health/ready`, {
        headers: { 'x-forwarded-proto': 'https' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    concurrency: 10,
    iterations: 100
  });
  results.benchmarks.push(b1);
  console.log(`  -> RPS: ${b1.rps} | p50: ${b1.percentiles.p50}ms | p95: ${b1.percentiles.p95}ms | p99: ${b1.percentiles.p99}ms | Error: ${b1.errorRate}%`);

  // 2. Authenticated Services List
  console.log('Benchmarking: GET /api/services (Authenticated Query)...');
  const b2 = await runBenchmarkStage({
    name: 'GET /api/services',
    fn: async () => {
      const res = await fetch(`${baseUrl}/api/services`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    concurrency: 10,
    iterations: 100
  });
  results.benchmarks.push(b2);
  console.log(`  -> RPS: ${b2.rps} | p50: ${b2.percentiles.p50}ms | p95: ${b2.percentiles.p95}ms | p99: ${b2.percentiles.p99}ms | Error: ${b2.errorRate}%`);

  // 3. Authenticated Alerts List
  console.log('Benchmarking: GET /api/alerts (Authenticated SQL Filter)...');
  const b3 = await runBenchmarkStage({
    name: 'GET /api/alerts',
    fn: async () => {
      const res = await fetch(`${baseUrl}/api/alerts`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    concurrency: 10,
    iterations: 80
  });
  results.benchmarks.push(b3);
  console.log(`  -> RPS: ${b3.rps} | p50: ${b3.percentiles.p50}ms | p95: ${b3.percentiles.p95}ms | p99: ${b3.percentiles.p99}ms | Error: ${b3.errorRate}%`);

  // 4. Authenticated Incidents
  console.log('Benchmarking: GET /api/incidents (Incident Management Query)...');
  const b4 = await runBenchmarkStage({
    name: 'GET /api/incidents',
    fn: async () => {
      const res = await fetch(`${baseUrl}/api/incidents`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    concurrency: 10,
    iterations: 80
  });
  results.benchmarks.push(b4);
  console.log(`  -> RPS: ${b4.rps} | p50: ${b4.percentiles.p50}ms | p95: ${b4.percentiles.p95}ms | p99: ${b4.percentiles.p99}ms | Error: ${b4.errorRate}%`);

  // 5. Self-Monitoring Overview
  console.log('Benchmarking: GET /api/self-monitoring/overview (Multi-Subsystem Aggregation)...');
  const b5 = await runBenchmarkStage({
    name: 'GET /api/self-monitoring/overview',
    fn: async () => {
      const res = await fetch(`${baseUrl}/api/self-monitoring/overview`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    concurrency: 5,
    iterations: 50
  });
  results.benchmarks.push(b5);
  console.log(`  -> RPS: ${b5.rps} | p50: ${b5.percentiles.p50}ms | p95: ${b5.percentiles.p95}ms | p99: ${b5.percentiles.p99}ms | Error: ${b5.errorRate}%`);

  // 6. Direct In-Memory RCA Analysis Engine
  console.log('Benchmarking: RCA Analysis Engine (Direct In-Memory Execution)...');
  const b6 = await runBenchmarkStage({
    name: 'RCA Analysis Engine Execution',
    fn: async () => {
      const analysis = runRcaAnalysis({
        incident: { id: 'INC-PERF-TEST', serviceId: 'payment-service', startedAt: new Date(Date.now() - 600000).toISOString() },
        services: [{ id: 'payment-service', name: 'Payment Service' }],
        dependencies: [{ caller: 'payment-service', callee: 'ledger-db-proxy' }],
        alerts: [{ id: 'ALT-1', serviceId: 'payment-service', status: 'firing', severity: 'critical', type: 'latency' }],
        deployments: [{ id: 'DEP-1', serviceId: 'payment-service', deployedAt: new Date(Date.now() - 700000).toISOString() }],
        telemetry: { metrics: [], traces: [], logs: [] }
      });
      if (!Array.isArray(analysis)) throw new Error('Invalid RCA result');
    },
    concurrency: 10,
    iterations: 100
  });
  results.benchmarks.push(b6);
  console.log(`  -> RPS: ${b6.rps} | p50: ${b6.percentiles.p50}ms | p95: ${b6.percentiles.p95}ms | p99: ${b6.percentiles.p99}ms | Error: ${b6.errorRate}%`);

  // 7. RCA Labeled Scenarios Benchmark
  console.log('\nRunning RCA Evaluation Across Labeled Dataset...');
  const rcaEval = evaluateRCAEngine();
  results.rcaEvaluation = rcaEval;
  console.log(`  -> Top-1 Accuracy: ${rcaEval.top1Accuracy} | Top-3 Accuracy: ${rcaEval.top3Accuracy} | MRR: ${rcaEval.meanReciprocalRank} | Avg: ${rcaEval.averageDurationMs}ms`);

  // Resource Metrics
  const mem = process.memoryUsage();
  results.memoryMetrics = {
    rssMb: Math.round(mem.rss / (1024**2)),
    heapUsedMb: Math.round(mem.heapUsed / (1024**2)),
    heapTotalMb: Math.round(mem.heapTotal / (1024**2)),
    externalMb: Math.round(mem.external / (1024**2))
  };

  const pool = getPool();
  results.poolMetrics = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };

  console.log('\nMemory & Pool Metrics:');
  console.log(`  -> RSS: ${results.memoryMetrics.rssMb} MB | Heap Used: ${results.memoryMetrics.heapUsedMb} MB / ${results.memoryMetrics.heapTotalMb} MB`);
  console.log(`  -> Pool Total: ${results.poolMetrics.totalCount} | Idle: ${results.poolMetrics.idleCount} | Waiting: ${results.poolMetrics.waitingCount}`);

  server.close();
  await closePool();
  console.log('\n[Phase 29 Benchmark Execution Complete]');
  return results;
}

main().catch(err => {
  console.error('[Benchmark Failure]:', err);
  process.exit(1);
});
