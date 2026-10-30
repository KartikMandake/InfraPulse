import { config } from '../config/env.js';

/**
 * Basic CSRF defense for cookie-based mutating requests.
 * Allows requests with custom headers (e.g. X-Requested-With, Authorization)
 * or matching Origin/Referer headers.
 */
export function csrfProtection(req, res, next) {
  // Only check state-changing HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Exempt auth bootstrap/login endpoints and webhook integrations
  if (req.path.startsWith('/api/auth/login') || req.path.startsWith('/api/auth/register') || req.path.startsWith('/api/integrations')) {
    return next();
  }

  // If request uses Authorization header or X-Session-Token (non-cookie), exempt from CSRF
  if (req.headers.authorization || req.headers['x-session-token']) {
    return next();
  }

  // If request doesn't have an authentication cookie, proceed
  if (!req.cookies || !req.cookies.infrapulse_session) {
    return next();
  }

  // Validate custom header or origin
  const requestedWith = req.headers['x-requested-with'];
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (requestedWith) {
    return next();
  }

  const allowedOrigins = [
    config.frontendUrl,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ].filter(Boolean);

  if (origin && allowedOrigins.some(ao => origin.startsWith(ao))) {
    return next();
  }

  if (referer && allowedOrigins.some(ao => referer.startsWith(ao))) {
    return next();
  }

  return res.status(403).json({
    error: 'Forbidden',
    message: 'Cross-Site Request Forgery (CSRF) validation failed.'
  });
}

