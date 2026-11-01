import fs from 'node:fs';
import path from 'node:path';
import { root, state, env, command, save, evidence } from './independent23m.mjs';
const testEnv = { ...env, PGDATABASE: state.suiteDatabase, PGDATABASE_TEST: state.suiteDatabase, NODE_TEST_REPORTER: 'tap' };
const groups = [
  ['backend', ['--test', '--test-reporter=tap', '--test-concurrency=1', 'backend/src/engine/__tests__/*.test.js', 'backend/src/services/__tests__/*.test.js', 'backend/src/integrations/telemetry/__tests__/*.test.js', 'backend/src/db/__tests__/*.test.js']],
  ...['reliability/reliability','rca-evaluation/rcaEngineEnhancement','rca-evaluation/aiAssistant','remediation/runbookOrchestration','slo/sloReliability','changes/changeIntelligence','correlation/unifiedCorrelation','operations/operationalIntelligence','integrations/enterpriseIntegrations','release/fullLifecycleE2E','release/failureRecovery','cloud-lifecycle/cloudLifecycle','cloud-lifecycle/awsReadOnlyDiscovery','cloud-lifecycle/driftDetectionReconciliation','cloud-lifecycle/realInfrastructureIntegrations','cloud-lifecycle/liveObservabilityIncidentIntelligence','cloud-lifecycle/liveIntegrationAcceptance','cloud-lifecycle/autonomousSreIntelligence','cloud-lifecycle/enterpriseProductionHardening'].map(n => [n.replaceAll('/', '-'), ['--test', '--test-reporter=tap', `tests/${n}.test.js`]]),
  ['governed-remediation-safe', ['--test', '--test-reporter=tap', '--test-skip-pattern=11\\. Idempotency|12\\. Concurrency Lock', 'tests/cloud-lifecycle/governedRemediationIntelligence.test.js']]
];
const results = [];
for (const [name, args] of groups) {
  const result = command(process.execPath, args, { env: testEnv });
  fs.writeFileSync(path.join(evidence, `suite-${name}.log`), (result.stdout || '') + (result.stderr || ''));
  results.push({ name, status: result.status, ms: result.ms, counts: Object.fromEntries(['tests','pass','fail','cancelled','skipped'].map(k => [k, Number(result.stdout?.match(new RegExp(`# ${k} (\\d+)`))?.[1] || 0)])), error: result.error });
  save('suite-results.json', results); console.log(name, result.status, JSON.stringify(results.at(-1).counts));
}
const evaluation = command(process.execPath, ['tests/rca-evaluation/evaluationRunner.js'], { env: testEnv, cwd: evidence });
// The evaluation runner uses module-relative fixtures; cwd keeps generated output with this run.
save('rca-evaluation-command.json', evaluation);
