import * as auditRepo from '../repositories/audit.repository.js';
import crypto from 'crypto';
import {withTenant,tenantContext} from '../security/tenantContext.js';

/**
 * Sanitizes metadata to strictly remove passwords, tokens, cookies, secrets.
 */
function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return {};

  const sensitiveKeys = [
    'password', 'passwordhash', 'token', 'sessionid', 'secret',
    'cookie', 'authorization', 'credential', 'creditcard', 'apikey'
  ];

  const clean = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(s => lowerKey.includes(s));
    if (isSensitive) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeMetadata(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Records an immutable audit log entry.
 *
 * @param {Object} params
 * @param {Object} [params.actor] - { id, email, role }
 * @param {string} params.action - Descriptive action string (e.g. 'auth.login', 'alert.acknowledge')
 * @param {string} params.resourceType - Target entity type (e.g. 'user', 'alert', 'incident', 'alert_rule')
 * @param {string} [params.resourceId] - ID of target entity
 * @param {string} [params.outcome='success'] - 'success', 'failure', 'denied'
 * @param {Object} [params.metadata] - Additional safe context
 * @param {Object} [params.req] - Express request object for IP and correlation tracking
 * @param {Object} [params.client] - PostgreSQL transaction client
 */
export async function recordAuditEvent(params) {
  const {
    actor,
    action,
    resourceType,
    resourceId = null,
    outcome = 'success',
    metadata = {},
    req = null,
    client = null
  } = params;

  try {
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;
    const correlationId = req?.headers?.['x-correlation-id'] || req?.id || `corr_${crypto.randomBytes(8).toString('hex')}`;

    const entry = {
      tenantId:tenantContext()?.tenantId||actor?.tenantId||'default_tenant',
      actorUserId: actor?.id || null,
      actorEmail: actor?.email || null,
      actorRole: actor?.role || null,
      action,
      resourceType,
      resourceId,
      outcome,
      metadata: sanitizeMetadata(metadata),
      correlationId,
      ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')?.[0]?.trim() : null
    };

    return await (actor?.tenantId ? withTenant(actor.tenantId,()=>auditRepo.createAuditRecord(entry,client)) : auditRepo.createAuditRecord(entry,client));
  } catch (err) {
    console.error('[AuditService Error]: Failed to write audit log entry:', err.message);
    return null;
  }
}

/**
 * Lists paginated audit logs for administrators.
 */
export async function listAuditLogs(filters = {}) {
  return auditRepo.findAuditLogs(filters);
}

