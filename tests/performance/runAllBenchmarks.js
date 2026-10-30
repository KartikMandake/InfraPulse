/**
 * Comprehensive Benchmark & Evaluation Suite Runner
 * Runs all benchmarks, formats measurements, and writes output to reports/benchmark-report.json
 */

import os from 'os';
import fs from 'fs';
import path from 'path';

import { runApiLoadTest } from './api-load.js';
import { runIncidentLoadTest } from './incident-load.js';
import { runInvestigationLoadTest } from './investigation-load.js';
import { runAlertLoadTest } from './alert-load.js';
import { runIngestionBenchmark } from './ingestion-load.js';
import { evaluateRCAEngine } from '../rca-evaluation/evaluationRunner.js';

async function runAllBenchmarks() {
  const targetUrl = process.env.TARGET_URL || 'http://localhost:5000';
  console.log(`\n======================================================`);
  console.log(`INFRAPULSE PHASE 11: FULL PERFORMANCE & RCA BENCHMARK`);
  console.log(`Target: ${targetUrl}`);
  console.log(`Node: ${process.version} | OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPUs: ${os.cpus()[0]?.model} (${os.cpus().length} threads)`);
  console.log(`Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
  console.log(`======================================================\n`);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      nodeVersion: process.version,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      logicalCores: os.cpus().length,
      totalMemoryGb: Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10,
      targetUrl
    },
    apiBenchmarks: {},
    rcaEvaluation: {},
    telemetryBenchmarking: {}
  };

  // 1. API Load Tests
  console.log('--- Step 1: Core API Load Tests ---');
  report.apiBenchmarks.core = await runApiLoadTest(targetUrl);

  console.log('\n--- Step 2: Incident & Timeline Load Tests ---');
  report.apiBenchmarks.incidents = await runIncidentLoadTest(targetUrl);

  console.log('\n--- Step 3: Investigation Engine Load Tests ---');
  report.apiBenchmarks.investigation = await runInvestigationLoadTest(targetUrl);

  console.log('\n--- Step 4: Alert Correlation Load Tests ---');
  report.apiBenchmarks.alerts = await runAlertLoadTest(targetUrl);

  console.log('\n--- Step 5: Telemetry Datasource & Ingestion Benchmark ---');
  report.telemetryBenchmarking = await runIngestionBenchmark(targetUrl);

  console.log('\n--- Step 6: RCA Evaluation Against Labeled Dataset ---');
  report.rcaEvaluation = evaluateRCAEngine();

  // Write reports
  const reportsDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const jsonPath = path.join(reportsDir, 'benchmark-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n[Report Generated]: Saved benchmark results to ${jsonPath}`);

  return report;
}

runAllBenchmarks().then(() => {
  console.log('\n[All Benchmarks Completed Successfully]');
  process.exit(0);
}).catch(err => {
  console.error('[Benchmark Runner Failed]:', err);
  process.exit(1);
});

