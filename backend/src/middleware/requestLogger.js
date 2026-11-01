import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { recordHttp, routeLabel, activeRequests } from '../observability/metrics.js';
import { startHttpTrace } from '../observability/tracing.js';
import { SpanStatusCode } from '@opentelemetry/api';

/**
 * Structured request logging middleware.
 * Attaches request correlation ID and logs duration, status, and path in JSON.
 * Records internal self-monitoring metrics and OpenTelemetry trace context.
 */
export function requestLogger(req, res, next) {
  const candidate = req.headers?.['x-correlation-id'];
  const correlationId = typeof candidate === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(candidate) ? candidate : `corr_${crypto.randomBytes(8).toString('hex')}`;
  req.correlationId = correlationId;
  if (typeof res?.setHeader === 'function') {
    res.setHeader('x-correlation-id', correlationId);
  }

  try {
    activeRequests.inc();
  } catch {}

  const start = Date.now();
  let traceInit = null;
  try {
    traceInit = startHttpTrace(req, next);
    if (req.traceId && typeof res?.setHeader === 'function') {
      res.setHeader('x-trace-id', req.traceId);
    }
  } catch {}

  if (typeof res?.on === 'function') {
    res.on('finish', () => {
      try {
        activeRequests.dec();
      } catch {}

      const durationMs = Date.now() - start;

      try {
        recordHttp(req.method, routeLabel(req.path), res.statusCode, durationMs);
      } catch {}

      if (traceInit?.span) {
        try {
          if (res.statusCode >= 500) {
            traceInit.span.setStatus({ code: SpanStatusCode.ERROR });
          }
          traceInit.span.setAttribute('http.status_code', res.statusCode);
          traceInit.span.setAttribute('http.method', req.method);
          traceInit.span.setAttribute('http.route', req.path);
          traceInit.span.end();
        } catch {}
      }

      // Avoid verbose logging for liveness checks in dev/test unless error
      if (req.path === '/api/health/live' && res.statusCode < 400) {
        return;
      }

      const severity = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';

      logger[severity.toLowerCase()]('HTTP Request', {
        correlationId,
        method: req.method,
        route: req.path,
        statusCode: res.statusCode,
        durationMs,
        ip: req.ip || req.headers?.['x-forwarded-for'] || null
      });
    });
  }

  if (traceInit && typeof traceInit.run === 'function') {
    return traceInit.run();
  }
  return next();
}

export default requestLogger;
