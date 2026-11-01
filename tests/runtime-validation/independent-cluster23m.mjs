import fs from 'node:fs';
import { command, save, state, client, env } from './independent23m.mjs';
const base = 'D:/Projects/.infrapulse-23m-independent';
if (fs.existsSync(base)) throw Error('Refusing to overwrite existing cluster');
fs.mkdirSync(base);
const init = command('C:/Program Files/PostgreSQL/16/bin/initdb.exe', ['-D', base + '/pgdata', '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
save('cluster-init.json', init); if (init.status !== 0) throw Error('initdb failed');
const start = command('C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe', ['-D', base + '/pgdata', '-l', base + '/postgres.log', '-o', '-p 5541 -h 127.0.0.1 -c shared_buffers=16MB -c max_connections=20 -c autovacuum=off', '-w', 'start']);
save('cluster-start.json', start); if (start.status !== 0) throw Error('pg_ctl failed');
state.port = '5541'; save('state.json', state);
// Subsequent invocation uses the new port; no existing cluster or database is removed.
console.log('Fresh loopback-only PostgreSQL cluster started on 5541. Run independent-cluster-seed23m.mjs.');
