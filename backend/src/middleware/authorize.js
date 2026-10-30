import { recordAuditEvent } from '../services/audit.service.js';

/**
 * Role-Based Access Control (RBAC) middleware.
 * Checks whether the authenticated user has at least one of the allowed roles.
 * Emits an audit event if access is denied.
 *
 * @param  {...string} allowedRoles - E.g. 'admin', 'responder', 'viewer'
 */
export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required. Please log in.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Audit log the permission denial
      await recordAuditEvent({
        actor: req.user,
        action: 'auth.permission_denied',
        resourceType: req.baseUrl + req.path,
        resourceId: req.params?.id || null,
        outcome: 'denied',
        metadata: {
          requiredRoles: allowedRoles,
          userRole: req.user.role,
          method: req.method,
          path: req.originalUrl
        },
        req
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Action requires one of the following roles: [${allowedRoles.join(', ')}].`,
        userRole: req.user.role,
        requiredRoles: allowedRoles
      });
    }

    next();
  };
}

