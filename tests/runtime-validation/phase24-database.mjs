import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import assert from 'node:assert/strict';
import {env,state,client,cluster,root,save,command,hash} from './phase24.mjs';
const action=process.argv[2]||'migrate';const bin='C:/Program Files/PostgreSQL/16/bin/';
if(action==='migrate'){
  if(!fs.existsSync(cluster+'/admin-password')){
    const db=client('postgres');await db.connect();const secret=crypto.randomBytes(32).toString('hex');await db.query(`ALTER ROLE postgres PASSWORD '${secret}'`);await db.end();fs.writeFileSync(cluster+'/admin-password',secret);env.PGPASSWORD=secret;process.env.PGPASSWORD=secret;
    fs.writeFileSync(cluster+'/pgdata/pg_hba.conf','host all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 scram-sha-256\n');assert.equal(command(bin+'pg_ctl.exe',['-D',cluster+'/pgdata','reload']).status,0);
  }
  const results=[];
  for(const name of [state.database,state.suiteDatabase]){
    const options={env:{...env,PGDATABASE:name,PGDATABASE_TEST:name}};
    const first=command(process.execPath,['backend/src/db/migrate.js'],options);assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/22 migration\(s\) applied/);
    const second=command(process.execPath,['backend/src/db/migrate.js'],options);assert.equal(second.status,0);assert.match(second.stdout,/0 migration\(s\) applied/);
    const seed=command(process.execPath,['backend/src/db/seed.js'],options);assert.equal(seed.status,0,seed.stderr);
    results.push({database:name,first,second,seed});save('database-migrations.json',results);
  }console.log('PASS: 22 migrations, idempotent replay and seed on each of two owned databases; local SCRAM enabled.');
}else if(action==='backup-restore'){
  const source=client();await source.connect();const target=client(state.restoreDatabase);await target.connect();assert.equal((await target.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0,'Restore target must be empty');await target.end();
  async function fingerprints(db){const result={};for(const {tablename} of (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows){assert.match(tablename,/^[a-z0-9_]+$/);const rows=(await db.query(`SELECT row_to_json(t)::text row FROM "${tablename}" t ORDER BY row_to_json(t)::text`)).rows.map(x=>x.row);result[tablename]={rows:rows.length,sha256:crypto.createHash('sha256').update(rows.join('\n')).digest('hex')};}return result;}
  const before=await fingerprints(source),archive=cluster+'/phase24-backup.dump';assert.ok(!fs.existsSync(archive),'Preserve existing archives');
  const dump=command(bin+'pg_dump.exe',['--format=custom','--no-owner','--file',archive,'--host','127.0.0.1','--port','5545','--username','postgres','--dbname',state.database]);assert.equal(dump.status,0,dump.stderr);
  const restore=command(bin+'pg_restore.exe',['--single-transaction','--exit-on-error','--no-owner','--host','127.0.0.1','--port','5545','--username','postgres','--dbname',state.restoreDatabase,archive]);assert.equal(restore.status,0,restore.stderr);
  const restored=client(state.restoreDatabase);await restored.connect();const after=await fingerprints(restored);assert.deepEqual(after,before);assert.deepEqual(await fingerprints(source),before,'Original source unchanged');
  const replay=command(process.execPath,['backend/src/db/migrate.js'],{env:{...env,PGDATABASE:state.restoreDatabase,PGDATABASE_TEST:state.restoreDatabase}});assert.equal(replay.status,0);assert.match(replay.stdout,/0 migration\(s\) applied/);
  const settings=(await source.query("SELECT name,setting FROM pg_settings WHERE name IN ('archive_mode','archive_command','wal_level','ssl','password_encryption') ORDER BY name")).rows;
  save('database-recovery.json',{status:'PASS',mode:'actual disposable local PostgreSQL 16',archive:{file:archive,sha256:hash(archive),bytes:fs.statSync(archive).size},source:state.database,target:state.restoreDatabase,tableCount:Object.keys(before).length,totalRows:Object.values(before).reduce((n,x)=>n+x.rows,0),before,after,sourceUnchanged:true,dump,restore,migrationReplay:replay,settings,pitr:'NOT AVAILABLE: archival WAL/PITR is not configured or tested; logical backup only.'});await source.end();await restored.end();console.log('PASS: logical archive restored into empty owned database; all table fingerprints match and source unchanged.');
}else throw Error('Unsupported safe database action');
