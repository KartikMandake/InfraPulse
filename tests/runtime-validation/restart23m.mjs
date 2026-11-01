import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, evidence, state, env, save, api } from './phase23m.mjs';
try { process.kill(state.backendPid); } catch {}
await new Promise(r => setTimeout(r, 300));
const out = fs.openSync(path.join(evidence, 'backend-after-fixes.log'), 'a');
const child = spawn(process.execPath, ['--max-old-space-size=256', 'src/server.js'], { cwd: path.join(root, 'backend'), env, detached: true, windowsHide: true, stdio: ['ignore', out, out] }); child.unref(); state.backendPid = child.pid; save('state.json', state);
for (let i = 0; i < 30; i++) { try { if ((await api('/api/health/ready')).status === 200) { console.log('Backend restarted with pool max', env.PGMAX); break; } } catch {} await new Promise(r => setTimeout(r, 250)); }
