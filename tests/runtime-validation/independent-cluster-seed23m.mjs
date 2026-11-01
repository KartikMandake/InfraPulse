import { command, save, state, client, env } from './independent23m.mjs';
if (state.port !== '5541') throw Error('Wrong cluster');
const db = client('postgres'); await db.connect();
save('fresh-cluster.json', { version: (await db.query('select version(), inet_server_addr(), inet_server_port()')).rows, settings: (await db.query("select name,setting from pg_settings where name in ('archive_mode','archive_command','wal_level','max_connections')")).rows });
for (const name of [state.database, state.suiteDatabase, state.restoreDatabase]) await db.query(`CREATE DATABASE "${name}"`);
await db.end();
for (const name of [state.database, state.suiteDatabase]) for (const action of ['migrate', 'seed']) {
  const r = command(process.execPath, ['backend/src/db/' + action + '.js'], { env: { ...env, PGDATABASE: name, PGDATABASE_TEST: name } });
  save('fresh-' + name + '-' + action + '.json', r); if (r.status !== 0) throw Error(action + ' failed');
}
console.log('Fresh cluster isolated databases migrated and seeded');
