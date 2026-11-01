import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { root, state, env, command, save, evidence, client, api, login } from './independent23m.mjs';
const results = [];
async function record(name, fn) { try { results.push({ name, ...await fn() }); } catch (e) { results.push({ name, error: e.message, stack: e.stack }); } save('technical.json', results); console.log(name, results.at(-1).error || 'recorded'); }
const db = client(); await db.connect();
await record('schema-and-original-database-readonly', async () => {
  const schema = { migrations: (await db.query('SELECT migration_name FROM schema_migrations ORDER BY migration_name')).rows, tables: (await db.query("select table_name from information_schema.tables where table_schema='public' order by table_name")).rows, constraints: (await db.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid in ('normalized_events'::regclass,'remediation_executions'::regclass)")).rows, indexes: (await db.query("select indexname,indexdef from pg_indexes where tablename in ('remediation_executions','normalized_events')")).rows };
  const { createRequire } = await import('node:module'); const require = createRequire(path.join(root,'backend/package.json')); const local = require('dotenv').parse(fs.readFileSync(path.join(root,'backend/.env')));
  if (!['localhost','127.0.0.1','::1'].includes(local.PGHOST || 'localhost')) return { schema, original: 'NOT VERIFIED: non-loopback configuration' };
  const { pg } = await import('./independent23m.mjs'); const original = new pg.Client({ host: local.PGHOST || 'localhost', port: Number(local.PGPORT || 5434), user: local.PGUSER || 'postgres', password: local.PGPASSWORD || '', database: local.PGDATABASE || 'infrapulse', connectionTimeoutMillis: 5000 });
  try { await original.connect(); await original.query('BEGIN READ ONLY'); const data = (await original.query("select current_database(),inet_server_port(),(select count(*) from schema_migrations) migrations,(select count(*) from services) services,(select count(*) from incidents) incidents")).rows; await original.query('ROLLBACK'); return { schema, original: data }; } catch (e) { return { schema, originalError: e.message }; } finally { await original.end(); }
});
await record('concurrent-database-idempotency-and-resource-claims', async () => {
  async function attempt(id,key) { const c = client(); await c.connect(); try { const prior = (await c.query("SELECT id FROM remediation_executions WHERE resource_id='phase23m-race-resource' AND status='EXECUTING'")).rows; const r = await c.query("INSERT INTO remediation_executions(id,resource_id,idempotency_key,executed_by,status) VALUES($1,'phase23m-race-resource',$2,'phase23m-safety-probe','EXECUTING') RETURNING id,status", [id,key]); return { prior, rows: r.rows }; } catch (e) { return { code: e.code, error: e.message }; } finally { await c.end(); } }
  const distinct = await Promise.all([attempt('phase23m-race-a','phase23m-race-key-a'),attempt('phase23m-race-b','phase23m-race-key-b')]);
  const same = await Promise.all([attempt('phase23m-key-a','phase23m-same-key'),attempt('phase23m-key-b','phase23m-same-key')]);
  const active = (await db.query("select id,resource_id,idempotency_key from remediation_executions where resource_id='phase23m-race-resource'")).rows;
  await db.query("DELETE FROM remediation_executions WHERE resource_id='phase23m-race-resource'");
  return { distinct, same, active, limitation: 'Repository/SQL persistence exercised from independent clients. Execution guards remained disabled; full mutation execution race NOT VERIFIED.' };
});
await record('deduplication-across-process-restarts', async () => {
  const first = command(process.execPath, ['tests/runtime-validation/independent-dedup-child23m.mjs']);
  const restart = command(process.execPath, ['tests/runtime-validation/independent-dedup-child23m.mjs']);
  return { first, restart, persisted: (await db.query("select id,tenant_id,source_ref_id from normalized_events where source_ref_id='phase23m-restart-span'")).rows };
});
await record('SSRF-policy-matrix', async () => {
  const { validateEndpointUrl } = await import('../../backend/src/integrations/core/ssrfProtection.js');
  const oldMode = process.env.NODE_ENV, oldPrivate = process.env.ALLOW_PRIVATE_INTEGRATION_ENDPOINTS;
  process.env.NODE_ENV = 'production'; process.env.ALLOW_PRIVATE_INTEGRATION_ENDPOINTS = 'false';
  const urls = ['http://127.0.0.1:9999','http://10.0.0.1:9090','http://localhost:9999','http://[::1]:9999','http://[::ffff:127.0.0.1]:9999','http://169.254.169.254/latest/meta-data','http://metadata.google.internal','file:///etc/passwd'];
  const defaults = urls.map(url => { const r = validateEndpointUrl(url); return { url, safe: r.safe, error: r.error }; });
  process.env.ALLOW_PRIVATE_INTEGRATION_ENDPOINTS = 'true';
  const allowPrivate = ['http://10.0.0.1:9090','http://127.0.0.1:9999','http://169.254.169.254/latest/meta-data'].map(url => ({ url, safe: validateEndpointUrl(url).safe }));
  process.env.NODE_ENV = oldMode; if (oldPrivate === undefined) delete process.env.ALLOW_PRIVATE_INTEGRATION_ENDPOINTS; else process.env.ALLOW_PRIVATE_INTEGRATION_ENDPOINTS = oldPrivate;
  return { defaults, allowPrivate, networkRequestsMade: 0, limitation: 'Validator only; DNS rebinding and redirect exploitation not performed.' };
});
await record('AWS-region-and-role-config-without-network', async () => {
  const { AwsIntegrationProvider } = await import('../../backend/src/integrations/providers/aws/AwsIntegrationProvider.js');
  const { ALLOWED_REGIONS } = await import('../../backend/src/services/cloud-lifecycle/providers/awsReadOnly.provider.js');
  const provider = new AwsIntegrationProvider(); class Capture { constructor(input) { this.input = input; } }
  return { allowed: ALLOWED_REGIONS, default: provider.validateConfig({}), alternate: provider.validateConfig({ region:'us-east-1' }), roleCredentialsValidation: provider.validateCredentials({ roleArn:'arn:aws:iam::000000000000:role/phase23m-test' }), constructedClient: provider._getClient(Capture,null,{region:'ap-south-1'},{roleArn:'arn:aws:iam::000000000000:role/phase23m-test'}).input, networkRequestsMade: 0 };
});
await record('API-latency-and-concurrent-requests', async () => {
  const token = await login(); const raw = [], diagnosticsBefore = await api('/api/health/diagnostics');
  for (let repetition=0;repetition<3;repetition++) for (const endpoint of ['/api/health/ready','/api/services','/api/incidents','/api/alerts','/api/sre-intelligence/overview']) {
    const t = performance.now(); const requests = await Promise.all(Array.from({length:10},()=>api(endpoint,{token}))); const elapsedMs = performance.now()-t;
    const times=requests.map(r=>r.ms).sort((a,b)=>a-b);
    raw.push({repetition,endpoint,concurrency:10,count:requests.length,elapsedMs,statuses:requests.map(r=>r.status),latenciesMs:times,p50:times[4],p95:times[9],requestsPerSecond:requests.length/(elapsedMs/1000)});
  }
  const plan = (await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM normalized_events WHERE tenant_id=$1 ORDER BY event_timestamp DESC LIMIT 50',['default_tenant'])).rows;
  return { raw, diagnosticsBefore,diagnosticsAfter:await api('/api/health/diagnostics'), queryPlan:plan, limitation:'Small seeded local dataset; includes authentication and persistence side effects. No production capacity claim.' };
});
await record('representative-telemetry-throughput', async () => {
  const token = await login('responder'); const batches=[];
  for(let rep=0;rep<3;rep++) { const body=Array.from({length:100},(_,i)=>({eventType:'log_error',id:`phase23m-load-${rep}-${i}`,sourceSystem:'phase23m-load',serviceId:'payment-service',level:'ERROR',message:'Synthetic throughput validation',timestamp:new Date().toISOString()})); const r=await api('/api/events/ingest',{token,method:'POST',body}); batches.push({rep,status:r.status,ms:r.ms,eventsPerSecond:100/(r.ms/1000),data:r.data}); }
  return {batchSize:100,repetitions:3,batches,persisted:(await db.query("select count(*) from normalized_events where source_system='phase23m-load'")).rows};
});
await record('provider-timeout-with-loopback-fixture', async () => {
  const sockets = new Set(); const fixture=http.createServer(()=>{}); fixture.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));}); await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
  try { const {KubernetesProvider}=await import('../../backend/src/integrations/providers/kubernetes/KubernetesProvider.js'); const provider=new KubernetesProvider(); const t=performance.now(); const response=await provider.testConnection({clusterUrl:`http://127.0.0.1:${fixture.address().port}`,timeoutMs:250},{bearerToken:'phase23m-test'}); return {configuredTimeoutMs:250,measuredMs:performance.now()-t,response}; }
  finally { for(const s of sockets)s.destroy();await new Promise(r=>fixture.close(r)); }
});
await record('logical-backup-and-real-data-restore', async () => {
  await db.query('CREATE TABLE phase23m_restore_sentinel(id text primary key,payload jsonb not null)');
  await db.query('INSERT INTO phase23m_restore_sentinel VALUES($1,$2)', ['sentinel',JSON.stringify({test:'phase23m',bytes:'real application rows and sentinel restored'})]);
  async function hashes(c) {const tables=(await c.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows; const result={};for(const {tablename} of tables){if(!/^[a-zA-Z0-9_]+$/.test(tablename))throw Error('Unsafe table');const rows=(await c.query(`select row_to_json(t) data from "${tablename}" t`)).rows.map(r=>JSON.stringify(r.data)).sort();result[tablename]={count:rows.length,sha256:crypto.createHash('sha256').update(rows.join('\n')).digest('hex')};}return result;}
  // Quiesce our own HTTP traffic during the snapshot; this script is the only active validation writer.
  const before=await hashes(db);const backup=path.join(evidence,'isolated-backup.dump');
  const dump=command('C:/Program Files/PostgreSQL/16/bin/pg_dump.exe',['-h','127.0.0.1','-p',state.port,'-U','postgres','-d',state.database,'-F','c','-f',backup]);
  if(dump.status!==0)throw Error('pg_dump failed: '+dump.stderr);
  const restore=command('C:/Program Files/PostgreSQL/16/bin/pg_restore.exe',['-h','127.0.0.1','-p',state.port,'-U','postgres','-d',state.restoreDatabase,'--exit-on-error',backup]);
  const restored=client(state.restoreDatabase);await restored.connect();const after=await hashes(restored);const sentinel=(await restored.query('SELECT * FROM phase23m_restore_sentinel')).rows;await restored.end();
  return {dump,restore,backupBytes:fs.statSync(backup).size,before,after,allTablesMatch:JSON.stringify(before)===JSON.stringify(after),sentinel,walSettings:(await db.query("select name,setting from pg_settings where name in ('archive_mode','archive_command','wal_level')")).rows,limitation:'Logical dump/restore only. WAL archiving/PITR restoration NOT VERIFIED; archiving disabled. Not an RTO/RPO production measurement.'};
});
await record('RCA-labeled-evaluation',async()=>({command:command(process.execPath,[path.join(root,'tests/rca-evaluation/evaluationRunner.js')],{cwd:evidence})}));
await db.end(); const {closePool}=await import('../../backend/src/db/connection.js');await closePool();
