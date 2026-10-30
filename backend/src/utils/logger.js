import { config } from '../config/env.js';

const SENSITIVE_KEYS = [
  'password', 'passwordhash', 'token', 'sessiontoken', 'sessionid',
  'secret', 'cookie', 'authorization', 'credential', 'creditcard',
  'apikey', 'smtp_pass', 'slackwebhookurl'
];

/**
 * Recursively redacts sensitive values from log metadata objects.
 */
export function redact(obj, depth = 0) {
  if (!obj || depth > 5) return obj;
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return obj
        .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]{15,}/gi, '$1[REDACTED]')
        .replace(/(password\s*[:=]\s*)[^\s,]+/gi, '$1[REDACTED]')
        .replace(/(hooks\.slack\.com\/services\/)[^\s"]+/gi, '$1[REDACTED]');
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redact(item, depth + 1));
  }

  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some(k => lower.includes(k));
    if (isSensitive) {
      clean[key] = '[REDACTED]';
    } else {
      clean[key] = redact(val, depth + 1);
    }
  }
  return clean;
}

function outputLog(severity, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const service = 'infrapulse-backend';
  const cleanMeta = redact(meta);

  const entry = {
    timestamp,
    severity,
    service,
    message,
    ...cleanMeta
  };

  const jsonStr = JSON.stringify(entry);

  if (severity === 'ERROR') {
    process.stderr.write(jsonStr + '\n');
  } else {
    process.stdout.write(jsonStr + '\n');
  }
}

export const logger = {
  info: (msg, meta) => outputLog('INFO', msg, meta),
  warn: (msg, meta) => outputLog('WARN', msg, meta),
  error: (msg, meta) => outputLog('ERROR', msg, meta),
  debug: (msg, meta) => {
    if (config.nodeEnv !== 'production' || process.env.LOG_LEVEL === 'debug') {
      outputLog('DEBUG', msg, meta);
    }
  }
};

export default logger;

