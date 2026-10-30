import { validateSession } from '../services/auth.service.js';

/**
 * Extracts and validates the session token from cookies or Authorization header.
 * Attaches user to req.user if valid.
 */
export async function authenticate(req, res, next) {
  try {
    let token = null;

    if (req.cookies && req.cookies.infrapulse_session) {
      token = req.cookies.infrapulse_session;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    } else if (req.headers['x-session-token']) {
      token = req.headers['x-session-token'];
    }

    if (!token) {
      req.user = null;
      req.sessionToken = null;
      return next();
    }

    const session = await validateSession(token);
    if (!session) {
      // Clear invalid cookie if present
      if (req.cookies && req.cookies.infrapulse_session) {
        res.clearCookie('infrapulse_session', { path: '/' });
      }
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired session. Please log in again.'
      });
    }

    req.user = session.user;
    req.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Enforces that a user is actively authenticated.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required. Please log in.'
    });
  }
  next();
}

