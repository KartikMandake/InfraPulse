import fs from 'fs';
import path from 'path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.system_generated', 'brain']);

const SECRET_PATTERNS = [
  { name: 'Private Key', regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/ },
  { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { name: 'Slack Bot/User Token', regex: /xox[baprs]-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24,}/ },
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z-_]{35}\b/ },
  { name: 'Real Slack Webhook', regex: /hooks\.slack\.com\/services\/(?!T00\/B00|T00000000\/B00000000)[A-Z0-9]{8,}\/[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}/ }
];

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const findings = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      findings.push(...scanDir(fullPath));
    } else if (entry.isFile()) {
      // Don't scan ignored files or binary files
      if (entry.name.startsWith('.env') && !entry.name.endsWith('.example')) continue;
      if (entry.name.endsWith('.zip') || entry.name.endsWith('.dump') || entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const { name, regex } of SECRET_PATTERNS) {
          if (regex.test(content)) {
            findings.push({ file: fullPath, secretType: name });
          }
        }
      } catch (err) {
        // Skip unreadable files
      }
    }
  }

  return findings;
}

const rootDir = process.cwd();
console.log('[Audit] Scanning repository from:', rootDir);
const findings = scanDir(rootDir);

if (findings.length === 0) {
  console.log('[Audit] Clean! No unredacted production secrets found in trackable files.');
} else {
  console.warn('[Audit] WARNING! Potential secrets found:');
  findings.forEach(f => console.warn(` - ${f.secretType}: ${f.file}`));
  process.exit(1);
}

