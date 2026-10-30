import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Structured request logging middleware.
 * Attaches request correlation ID and logs duration, status, and path in JSON.
 */
export function requestLogger(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || `corr_${crypto.randomBytes(8).toString('hex')}`;
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  const start = Date.now();

  res.on('finish', () => {
    // Avoid verbose logging for liveness checks in dev/test unless error
    if (req.path === '/api/health/live' && res.statusCode < 400) {
      return;
    }

    const durationMs = Date.now() - start;
    const severity = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';

    logger[severity.toLowerCase()]('HTTP Request', {
      correlationId,
      method: req.method,
      route: req.baseUrl ? `${req.baseUrl}${req.path}` : req.originalUrl || req.path,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip || req.headers['x-forwarded-for'] || null
    });
  });

  next();
}

export default requestLogger;

