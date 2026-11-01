import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));
export const pg = require('pg');
const local = require('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
export const evidence = path.join(root, 'reports/phase23m/independent');
fs.mkdirSync(evidence, { recursive: true });
const stateFile = path.join(evidence, 'state.json');
export const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8').replace(/^\uFEFF/, '')) : {};
const forced = {
  NODE_ENV: 'test', PGHOST: '127.0.0.1', PGPORT: state.port || '5540', PGUSER: 'postgres', PGPASSWORD: local.PGPASSWORD || '',
  PGDATABASE: state.database || 'infrapulse_23m_uninitialized', PGDATABASE_TEST: state.database || 'infrapulse_23m_uninitialized', DATABASE_URL: '',
  PORT: '5010', AUTO_MIGRATE: 'false', AUTO_SEED: 'false', TELEMETRY_MODE: 'demo',
  FRONTEND_URL: 'http://127.0.0.1:5180', APP_BASE_URL: 'http://127.0.0.1:5180', COOKIE_SECURE: 'false',
  NOTIFICATION_MOCK_MODE: 'true', NOTIFICATION_WORKER_ENABLED: 'false', AI_PROVIDER: 'mock',
  AWS_LIFECYCLE_MUTATIONS_ENABLED: 'false', DOCKER_LIFECYCLE_ENABLED: 'false', KUBERNETES_LIFECYCLE_ENABLED: 'false',
  REMEDIATION_EXECUTION_ENABLED: 'false', REMEDIATION_PRODUCTION_ENABLED: 'false', REMEDIATION_RECOMMENDATIONS_ENABLED: 'true', REMEDIATION_DRY_RUN_ENABLED: 'true',
  RUN_LIVE_TESTS: 'false', LIVE_AWS_TEST: 'false', LIVE_DOCKER_TEST: 'false', LIVE_K8S_TEST: 'false', LIVE_PROMETHEUS_TEST: 'false', LIVE_REMEDIATION_TEST: 'false',
  AWS_EC2_METADATA_DISABLED: 'true', AWS_PROFILE: 'phase23m-no-credentials', AWS_SHARED_CREDENTIALS_FILE: 'D:/Projects/.infrapulse-23m-runtime/no-credentials', AWS_CONFIG_FILE: 'D:/Projects/.infrapulse-23m-runtime/no-config', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', AWS_SESSION_TOKEN: '',
  SLACK_WEBHOOK_URL: '', SMTP_HOST: '', SMTP_PASS: '', LOG_LEVEL: 'warn', PGMAX: '8',
  TEMP: 'D:/Projects/.infrapulse-23m-runtime/tmp', TMP: 'D:/Projects/.infrapulse-23m-runtime/tmp', NODE_OPTIONS: '--max-old-space-size=512'
};
Object.assign(process.env, forced);
export const env = { ...process.env };
export function save(name, value) { fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2)); }
export function command(exe, args, options = {}) {
  fs.appendFileSync(path.join(evidence, 'commands.jsonl'), JSON.stringify({ at: new Date().toISOString(), exe, args, cwd: options.cwd || root }) + '\n');
  const t = performance.now();
  const r = spawnSync(exe, args, { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 30e6, ...options });
  return { status: r.status, signal: r.signal, ms: performance.now() - t, stdout: r.stdout, stderr: r.stderr, error: r.error?.message };
}
export function client(database = state.database) {
  if (database !== 'postgres' && !/^infrapulse_23m_independent_\d+(_suite|_restore)?$/.test(database || '')) throw Error('Unsafe database target');
  return new pg.Client({ host: '127.0.0.1', port: Number(forced.PGPORT), user: 'postgres', password: forced.PGPASSWORD, database, connectionTimeoutMillis: 5000 });
}
export async function api(endpoint, { token, method = 'GET', body, headers = {}, base = 'http://127.0.0.1:5010' } = {}) {
  const t = performance.now();
  const r = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const raw = await r.text(); let data; try { data = JSON.parse(raw); } catch { data = raw.slice(0, 500); }
  return { status: r.status, ms: performance.now() - t, data };
}
export async function login(role = 'admin') {
  const email = { admin: 'sarah.chen@infrapulse.io', responder: 'marcus.v@infrapulse.io', viewer: 'alex.ross@infrapulse.io' }[role];
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password: 'Password123!' } });
  if (r.status !== 200) throw Error('Login failed: ' + r.status);
  return r.data.data.sessionToken;
}
export function launch(name, exe, args, cwd = root, extra = {}) {
  const fd = fs.openSync(path.join(evidence, name + '.log'), 'a');
  const child = spawn(exe, args, { cwd, env: { ...env, ...extra }, windowsHide: true, detached: true, stdio: ['ignore', fd, fd] });
  child.unref(); fs.closeSync(fd);
  state[name + 'Pid'] = child.pid; save('state.json', state);
  fs.appendFileSync(path.join(evidence, 'commands.jsonl'), JSON.stringify({ at: new Date().toISOString(), exe, args, cwd, processName: name, pid: child.pid }) + '\n');
}
async function setup() {
  if (state.database) throw Error('Refusing to overwrite prior independent run');
  const inventory = [];
  function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'reports', 'stitch_infrapulse_observability_platform'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (!/\.zip$/.test(e.name)) {
      const b = fs.readFileSync(p); inventory.push({ path: path.relative(root, p), size: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') });
    }
  } }
  walk(root); save('initial-file-hashes.json', inventory);
  save('initial-git.json', command('git', ['status', '--short']));
  state.database = 'infrapulse_23m_independent_' + Date.now(); state.suiteDatabase = state.database + '_suite'; state.restoreDatabase = state.database + '_restore';
  const admin = client('postgres'); await admin.connect();
  save('cluster.json', { connection: (await admin.query('select version(), inet_server_addr(), inet_server_port(), current_database()')).rows, settings: (await admin.query("select name,setting from pg_settings where name in ('data_directory','archive_mode','archive_command','wal_level','max_connections')")).rows });
  for (const name of [state.database, state.suiteDatabase, state.restoreDatabase]) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end(); save('state.json', state);
  for (const name of [state.database, state.suiteDatabase]) for (const action of ['migrate', 'seed']) {
    const r = command(process.execPath, ['backend/src/db/' + action + '.js'], { env: { ...env, PGDATABASE: name, PGDATABASE_TEST: name } }); save(name + '-' + action + '.json', r); if (r.status !== 0) throw Error(action + ' failed');
  }
  save('environment.json', { clientDate: '2026-10-31', timezone: 'Asia/Calcutta', node: process.version, os: os.release(), cpu: os.cpus()[0].model, cores: os.cpus().length, totalMemoryBytes: os.totalmem(), freeMemoryBytes: os.freemem(), backend: 'http://127.0.0.1:5010', secondBackend: 'http://127.0.0.1:5011', frontend: 'http://127.0.0.1:5180', databasePort: 5540, database: state.database, safety: Object.fromEntries(Object.entries(forced).filter(([k]) => /ENABLED|MOCK|LIVE_/.test(k))) });
  console.log('Created and seeded isolated databases:', state.database);
}
async function start() {
  launch('backend', process.execPath, ['src/server.js'], path.join(root, 'backend'));
  launch('backend-second', process.execPath, ['src/server.js'], path.join(root, 'backend'), { PORT: '5011' });
  launch('frontend', process.execPath, ['tests/runtime-validation/independent-serve23m.mjs']);
  for (let i = 0; i < 40; i++) { try { if ((await api('/api/health/ready')).status === 200) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  save('startup.json', { ready: await api('/api/health/ready'), live: await api('/api/health/live'), diagnostics: await api('/api/health/diagnostics'), frontend: (await fetch('http://127.0.0.1:5180')).status });
  console.log('Backend and frontend started');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'setup') await setup();
  else if (process.argv[2] === 'build') { const r = command(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: path.join(root, 'frontend') }); save('build.json', r); console.log(r.status, r.stdout, r.stderr); }
  else if (process.argv[2] === 'start') await start();
}
