import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { client, command, state, evidence, save, env } from './phase23m.mjs';
const results = {};
const db = client(); await db.connect();
async function manifest(c) {
  const tables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  const result = {};
  for (const table of tables) {
    const rows = (await c.query(`SELECT row_to_json(t)::text AS value FROM "${table}" t`)).rows.map(r => r.value).sort();
    result[table] = { count: rows.length, sha256: crypto.createHash('sha256').update(rows.join('\n')).digest('hex') };
  }
  return result;
}
try {
  results.before = await manifest(db);
  const backupDir = path.join(evidence, 'backup'); fs.mkdirSync(backupDir, { recursive: true });
  const cliEnv = { ...env, PATH: 'C:/Program Files/PostgreSQL/16/bin;' + env.PATH };
  const t = performance.now();
  results.backup = command('powershell.exe', ['-NoProfile', '-File', 'scripts/backup-db.ps1', '-BackupDir', backupDir, '-DbName', state.database, '-DbHost', '127.0.0.1', '-DbPort', state.port, '-DbUser', 'postgres'], { env: cliEnv });
  results.backupMs = performance.now() - t;
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.sql')).sort();
  if (results.backup.status !== 0 || !files.length) throw Error('Backup failed');
  const backup = path.join(backupDir, files.at(-1));
  results.archive = { path: path.relative(evidence, backup), bytes: fs.statSync(backup).size, header: fs.readFileSync(backup).subarray(0, 5).toString() };
  const restoreStart = performance.now();
  results.restore = command('powershell.exe', ['-NoProfile', '-File', 'scripts/restore-db.ps1', '-BackupFile', backup, '-DbName', state.restoreDatabase, '-DbHost', '127.0.0.1', '-DbPort', state.port, '-DbUser', 'postgres'], { env: cliEnv });
  results.restoreMs = performance.now() - restoreStart;
  const restored = client(state.restoreDatabase); await restored.connect(); results.after = await manifest(restored); await restored.end();
  results.matches = JSON.stringify(results.before) === JSON.stringify(results.after);
  results.totalTables = Object.keys(results.before).length; results.totalRows = Object.values(results.before).reduce((n, t) => n + t.count, 0);
  const corrupt = path.join(backupDir, 'phase23m-corrupt.dump'); fs.writeFileSync(corrupt, 'phase23m intentionally corrupt archive');
  results.corruptRestore = command('powershell.exe', ['-NoProfile', '-File', 'scripts/restore-db.ps1', '-BackupFile', corrupt, '-DbName', state.restoreDatabase, '-DbHost', '127.0.0.1', '-DbPort', state.port, '-DbUser', 'postgres'], { env: cliEnv });
  results.missingDbBackup = command('powershell.exe', ['-NoProfile', '-File', 'scripts/backup-db.ps1', '-BackupDir', backupDir, '-DbName', 'infrapulse_23m_definitely_missing', '-DbHost', '127.0.0.1', '-DbPort', state.port, '-DbUser', 'postgres'], { env: cliEnv });
} catch (e) { results.error = e.message; process.exitCode = 1; }
finally { await db.end(); save('data-recovery.json', results); }
console.log(JSON.stringify({ tables: results.totalTables, rows: results.totalRows, matches: results.matches, backupMs: results.backupMs, restoreMs: results.restoreMs, error: results.error }));
