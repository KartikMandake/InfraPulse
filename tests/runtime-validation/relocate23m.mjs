import fs from 'node:fs';
import path from 'node:path';
import { pg, state, client, save, evidence } from './phase23m.mjs';
if (state.port) throw Error('Already relocated');
const oldNames = [state.database, state.suiteDatabase, state.restoreDatabase];
const admin = new pg.Client({ host: '127.0.0.1', port: 5540, user: 'postgres', database: 'postgres' });
await admin.connect();
for (const db of oldNames) {
  if (!/^infrapulse_23m_20261031_[a-f0-9]{6}(_suite|_restore)?$/.test(db)) throw Error('Unsafe cleanup name');
  await admin.query(`CREATE DATABASE "${db}"`);
}
await admin.end();
// Reclaim only this run's synthetic databases on the full host disk.
const old = client('postgres'); await old.connect();
for (const db of oldNames) await old.query(`DROP DATABASE "${db}"`);
await old.end();
state.port = '5540'; state.relocation = { reason: 'Host C: disk full; SQLSTATE 53100', cluster: 'D:/Projects/.infrapulse-23m-runtime/pgdata', removedOnlyDatabasesCreatedByThisRun: oldNames };
save('state.json', state);
for (const name of ['suite-results.json', 'frontend-build.json']) {
  if (fs.existsSync(path.join(evidence, name))) fs.renameSync(path.join(evidence, name), path.join(evidence, 'hostfull-' + name));
}
console.log('Relocated validation databases to 127.0.0.1:5540; original databases untouched.');
