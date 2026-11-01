import { config } from '../config/env.js';
import { logContext } from '../observability/logContext.js';
import { trace } from '@opentelemetry/api';

const SENSITIVE_KEYS = [
  'password', 'passwordhash', 'token', 'sessiontoken', 'sessionid',
  'secret', 'cookie', 'authorization', 'credential', 'creditcard',
  'apikey', 'smtp_pass', 'slackwebhookurl', 'ingestionkey', 'accesskey', 'privatekey', 'connectionstring', 'database_url'
];

/**
 * Recursively redacts sensitive values from log metadata objects.
 */
export function redact(obj, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (!obj) return obj;
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return obj
        .replace(/(bearer\s+)\S+/gi, '$1[REDACTED]')
        .replace(/\b(postgres(?:ql)?:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@')
        .replace(/((?:ingestionkey|accesskeyid|secretaccesskey|token|apikey)\s*[:=]\s*)[^\s,]+/gi, '$1[REDACTED]')
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

  let traceId = cleanMeta?.traceId;
  let spanId = cleanMeta?.spanId;
  let correlationId = cleanMeta?.correlationId;

  try {
    const store = logContext?.getStore?.();
    if (store) {
      correlationId = correlationId || store.requestId || store.correlationId;
      traceId = traceId || store.traceId;
      spanId = spanId || store.spanId;
    }
    if (!traceId || !spanId) {
      const activeSpan = trace?.getActiveSpan?.();
      if (activeSpan) {
        const spanCtx = activeSpan.spanContext();
        if (spanCtx?.traceId && !/^0+$/.test(spanCtx.traceId)) {
          traceId = traceId || spanCtx.traceId;
          spanId = spanId || spanCtx.spanId;
        }
      }
    }
  } catch {}

  const entry = {
    timestamp,
    severity,
    service,
    ...(correlationId ? { correlationId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(spanId ? { spanId } : {}),
    ...cleanMeta,
    message: redact(message)
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
