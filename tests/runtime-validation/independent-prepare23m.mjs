import fs from 'node:fs';
import path from 'node:path';
import { root } from './independent23m.mjs';
for (const name of ['workflows', 'browser']) {
  let code = fs.readFileSync(path.join(root, `tests/runtime-validation/${name}23m.mjs`), 'utf8');
  code = code.replaceAll('./phase23m.mjs', './independent23m.mjs').replaceAll('http://localhost:5001', 'http://127.0.0.1:5011').replaceAll('http://127.0.0.1:5173', 'http://127.0.0.1:5180');
  if (name === 'browser') {
    code = code.replace('--max-old-space-size=128', '--max-old-space-size=256');
    // Avoid dependence on remote font CDNs in the offline local browser check.
    code = code.replace('const page = await context.newPage();', "await context.route('https://fonts.googleapis.com/**', r => r.abort());\nawait context.route('https://fonts.gstatic.com/**', r => r.abort());\nconst page = await context.newPage();");
    code = code.replace("await page.waitForTimeout(1400);", "await page.waitForFunction(() => document.querySelector('main')?.innerText.length > 100, { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(700);");
    code = code.replace("text: document.body.innerText.slice(0, 600)", "text: document.body.innerText.slice(0, 2500), mainText: document.querySelector('main')?.innerText.slice(0, 12000)");
  }
  fs.writeFileSync(path.join(root, `tests/runtime-validation/independent-${name}23m.mjs`), code, { flag: 'wx' });
}
console.log('Prepared independent harness copies; original harnesses preserved.');
