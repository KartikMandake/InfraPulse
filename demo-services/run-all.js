import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const services = [
  { name: 'payments-service', file: path.join(__dirname, 'payments-service/server.js'), port: 4003 },
  { name: 'orders-service', file: path.join(__dirname, 'orders-service/server.js'), port: 4002 },
  { name: 'api-gateway', file: path.join(__dirname, 'api-gateway/server.js'), port: 4001 }
];

const children = [];

console.log('[Demo Runner] Starting OpenTelemetry Demo Services...');

for (const svc of services) {
  const child = fork(svc.file, {
    env: { ...process.env, PORT: svc.port }
  });
  children.push(child);
}

process.on('SIGINT', () => {
  console.log('[Demo Runner] Shutting down demo services...');
  for (const c of children) {
    c.kill();
  }
  process.exit(0);
});

