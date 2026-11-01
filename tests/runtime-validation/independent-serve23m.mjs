import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './independent23m.mjs';
const dist = path.join(root, 'frontend/dist');
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const upstream = http.request({ hostname: '127.0.0.1', port: 5010, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    upstream.on('error', () => { res.statusCode = 502; res.end('{"message":"Backend unavailable"}'); }); req.pipe(upstream); return;
  }
  const candidate = path.resolve(dist, '.' + req.url.split('?')[0]);
  const file = candidate.startsWith(dist + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(dist, 'index.html');
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
  const stream = fs.createReadStream(file); stream.on('error', () => { res.statusCode = 500; res.end('Build unavailable'); }); stream.pipe(res);
}).listen(5180, '127.0.0.1', () => console.log('Isolated frontend bundle: http://127.0.0.1:5180'));
