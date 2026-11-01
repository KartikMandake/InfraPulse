import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));
const dotenv = require('dotenv');
export const pg = require('pg');
export const evidence = path.join(root, 'reports/phase23m');
fs.mkdirSync(evidence, { recursive: true });
const statePath = path.join(evidence, 'state.json');
export const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
const local = dotenv.parse(fs.readFileSync(path.join(root, 'backend/.env')));
const forced = {
  NODE_ENV: 'test', PGHOST: '127.0.0.1', PGPORT: state.port || local.PGPORT || '5434',
  PGUSER: local.PGUSER || 'postgres', PGPASSWORD: local.PGPASSWORD || '', PGMAX: '3',
  PGDATABASE: state.database || '', PGDATABASE_TEST: state.database || '', DATABASE_URL: '',
  PORT: '5000', AUTO_MIGRATE: 'false', AUTO_SEED: 'false', TELEMETRY_MODE: 'demo',
  NOTIFICATION_MOCK_MODE: 'true', NOTIFICATION_WORKER_ENABLED: 'false',
  FRONTEND_URL: 'http://localhost:5173', COOKIE_SECURE: 'false',
  AWS_LIFECYCLE_MUTATIONS_ENABLED: 'false', DOCKER_LIFECYCLE_ENABLED: 'false',
  KUBERNETES_LIFECYCLE_ENABLED: 'false', REMEDIATION_EXECUTION_ENABLED: 'false',
  REMEDIATION_PRODUCTION_ENABLED: 'false', REMEDIATION_RECOMMENDATIONS_ENABLED: 'true',
  REMEDIATION_DRY_RUN_ENABLED: 'true', AWS_EC2_METADATA_DISABLED: 'true',
  RUN_LIVE_TESTS: 'false', LIVE_AWS_TEST: 'false', LIVE_DOCKER_TEST: 'false',
  LIVE_K8S_TEST: 'false', LIVE_PROMETHEUS_TEST: 'false', LIVE_REMEDIATION_TEST: 'false',
  DOCKER_HOST: '', SLACK_WEBHOOK_URL: '', SMTP_HOST: '', SMTP_PASS: '', LOG_LEVEL: 'warn',
  TEMP: 'D:/Projects/.infrapulse-23m-runtime/tmp', TMP: 'D:/Projects/.infrapulse-23m-runtime/tmp',
  NODE_OPTIONS: '--max-old-space-size=768', AWS_PROFILE: 'phase23m-no-credentials',
  AWS_SHARED_CREDENTIALS_FILE: 'D:/Projects/.infrapulse-23m-runtime/no-credentials',
  AWS_CONFIG_FILE: 'D:/Projects/.infrapulse-23m-runtime/no-config',
  AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', AWS_SESSION_TOKEN: ''
};
Object.assign(process.env, forced);
export const env = { ...process.env };
export function save(name, value) { fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2)); }
export function client(database = state.database) {
  if (!database || (!database.startsWith('infrapulse_23m_') && database !== 'postgres' && database !== local.PGDATABASE)) throw Error('Unsafe database');
  return new pg.Client({ host: forced.PGHOST, port: Number(forced.PGPORT), user: forced.PGUSER, password: forced.PGPASSWORD, database, connectionTimeoutMillis: 5000 });
}
export function command(executable, args, options = {}) {
  fs.appendFileSync(path.join(evidence, 'commands.jsonl'), JSON.stringify({ at: new Date().toISOString(), executable, args, cwd: options.cwd || root }) + '\n');
  const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', timeout: 180000, maxBuffer: 30 * 1024 * 1024, ...options });
  return { status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, error: result.error?.message };
}
export async function api(endpoint, { token, method = 'GET', body, headers = {}, base = 'http://localhost:5000' } = {}) {
  const started = performance.now();
  const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 500); }
  return { status: response.status, ms: performance.now() - started, data };
}
export async function login(role = 'admin') {
  const email = { admin: 'sarah.chen@infrapulse.io', responder: 'marcus.v@infrapulse.io', viewer: 'alex.ross@infrapulse.io' }[role];
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password: 'Password123!' } });
  if (r.status !== 200) throw Error(`Login failed ${r.status}`);
  return r.data.data.sessionToken;
}

async function setup() {
  if (state.database) throw Error('Setup already completed; refusing to overwrite evidence');
  const files = [];
  const ignored = new Set(['.git', 'node_modules', 'dist', '.env', '.env.local', '.env.staging', 'stitch_infrapulse_observability_platform']);
  function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (!/\.zip$/.test(item.name)) { const bytes = fs.readFileSync(full); files.push({ path: path.relative(root, full), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }); }
  } }
  walk(root);
  state.database = `infrapulse_23m_20261031_${crypto.randomBytes(3).toString('hex')}`;
  state.suiteDatabase = state.database + '_suite';
  state.restoreDatabase = state.database + '_restore';
  state.initialGit = command('git', ['status', '--short']).stdout;
  state.envHashes = Object.fromEntries(['.env', 'backend/.env'].map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')]));
  save('state.json', state);
  save('repository-inventory.json', files);
  const existing = client(local.PGDATABASE); await existing.connect();
  save('existing-database-readonly.json', {
    connection: (await existing.query('select current_database() as database, version(), inet_server_port() as port')).rows,
    migrations: (await existing.query('select migration_name from schema_migrations order by migration_name')).rows,
    wal: (await existing.query("select name, setting from pg_settings where name in ('archive_mode','archive_command','wal_level')")).rows
  }); await existing.end();
  const admin = client('postgres'); await admin.connect();
  for (const db of [state.database, state.suiteDatabase, state.restoreDatabase]) await admin.query(`CREATE DATABASE "${db}"`);
  await admin.end();
  for (const db of [state.database, state.suiteDatabase]) {
    const childEnv = { ...env, PGDATABASE: db, PGDATABASE_TEST: db };
    const migrate = command(process.execPath, ['backend/src/db/migrate.js'], { env: childEnv });
    save(`${db}-migrate.json`, migrate); if (migrate.status !== 0) throw Error('Migration failed');
    const seed = command(process.execPath, ['backend/src/db/seed.js'], { env: childEnv });
    save(`${db}-seed.json`, seed); if (seed.status !== 0) throw Error('Seed failed');
  }
  save('environment.json', { date: '2026-10-31', timezone: 'Asia/Calcutta', node: process.version, platform: process.platform, os: os.release(), cpu: os.cpus()[0].model, cores: os.cpus().length, memoryBytes: os.totalmem(), database: state.database, suiteDatabase: state.suiteDatabase, backend: 'http://localhost:5000', frontend: 'http://localhost:5173', mutationFlags: Object.fromEntries(Object.entries(forced).filter(([k]) => /LIFECYCLE.*ENABLED|REMEDIATION_.*ENABLED/.test(k))) });
  console.log('Isolated databases created, migrated and seeded:', state.database, state.suiteDatabase);
}
async function start() {
  if (!state.database) throw Error('Run setup first');
  const children = [
    ['backend', process.execPath, ['src/server.js'], path.join(root, 'backend')],
    ['frontend', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'], path.join(root, 'frontend')],
    ['backend-second', process.execPath, ['src/server.js'], path.join(root, 'backend')]
  ];
  for (const [name, exe, args, cwd] of children) {
    const out = fs.openSync(path.join(evidence, `${name}.log`), 'a');
    const child = spawn(exe, args, { cwd, env: { ...env, PORT: name === 'backend-second' ? '5001' : '5000' }, detached: true, windowsHide: true, stdio: ['ignore', out, out] });
    child.unref(); state[name + 'Pid'] = child.pid;
  }
  save('state.json', state);
  for (let i = 0; i < 40; i++) { try { if ((await api('/api/health/ready')).status === 200) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  console.log(JSON.stringify({ backend: await api('/api/health/ready'), frontend: (await fetch('http://127.0.0.1:5173')).status }));
}
async function initialize() {
  for (const db of [state.database, state.suiteDatabase]) {
    const childEnv = { ...env, PGDATABASE: db, PGDATABASE_TEST: db };
    for (const action of ['migrate', 'seed']) {
      const result = command(process.execPath, [`backend/src/db/${action}.js`], { env: childEnv });
      save(`${db}-dedicated-${action}.json`, result);
      if (result.status !== 0) throw Error(`${action} failed`);
    }
  }
  console.log('Dedicated cluster migrated and seeded');
}
async function suites() {
  const suiteEnv = { ...env, PGDATABASE: state.suiteDatabase, PGDATABASE_TEST: state.suiteDatabase };
  const groups = [
    ['backend', ['--test', '--test-concurrency=1', 'backend/src/engine/__tests__/*.test.js', 'backend/src/services/__tests__/*.test.js', 'backend/src/integrations/telemetry/__tests__/*.test.js', 'backend/src/db/__tests__/*.test.js']],
    ...['reliability/reliability', 'rca-evaluation/rcaEngineEnhancement', 'rca-evaluation/aiAssistant', 'remediation/runbookOrchestration', 'slo/sloReliability', 'changes/changeIntelligence', 'correlation/unifiedCorrelation', 'operations/operationalIntelligence', 'integrations/enterpriseIntegrations', 'release/fullLifecycleE2E', 'release/failureRecovery', 'cloud-lifecycle/cloudLifecycle', 'cloud-lifecycle/awsReadOnlyDiscovery', 'cloud-lifecycle/driftDetectionReconciliation', 'cloud-lifecycle/realInfrastructureIntegrations', 'cloud-lifecycle/liveObservabilityIncidentIntelligence', 'cloud-lifecycle/liveIntegrationAcceptance', 'cloud-lifecycle/autonomousSreIntelligence', 'cloud-lifecycle/enterpriseProductionHardening'].map(name => [name.replaceAll('/', '-'), ['--test', `tests/${name}.test.js`]]),
    ['governed-remediation-safe', ['--test', '--test-skip-pattern=11\\. Idempotency|12\\. Concurrency Lock', 'tests/cloud-lifecycle/governedRemediationIntelligence.test.js']]
  ];
  const results = [];
  for (const [name, args] of groups) {
    if (process.env.PHASE23M_SUITES && !process.env.PHASE23M_SUITES.split(',').includes(name)) continue;
    const t = performance.now(); const r = command(process.execPath, args, { env: suiteEnv });
    fs.writeFileSync(path.join(evidence, `suite-${name}.log`), (r.stdout || '') + (r.stderr || ''));
    const text = r.stdout || '';
    results.push({ name, status: r.status, ms: performance.now() - t, counts: Object.fromEntries(['tests', 'pass', 'fail', 'skipped'].map(k => [k, Number(text.match(new RegExp(`(?:#|ℹ) ${k} (\\d+)`))?.[1] || 0)])), error: r.error });
    save('suite-results.json', results); console.log(name, r.status, JSON.stringify(results.at(-1).counts));
  }
  if (process.env.PHASE23M_BUILD === 'true') {
    const build = command(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: path.join(root, 'frontend') });
    save('frontend-build.json', build); console.log('Frontend build:', build.status);
  }
}
const mode = process.argv[2];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { if (mode === 'setup') await setup(); else if (mode === 'initialize') await initialize(); else if (mode === 'start') await start(); else if (mode === 'suites') await suites(); else throw Error('Use setup, initialize, start, suites'); }
  catch (err) { console.error(err); process.exitCode = 1; }
}
