import * as auditService from '../services/audit.service.js';

export async function getAuditLogs(req, res, next) {
  try {
    const { action, resourceType, outcome, actorUserId, limit, offset } = req.query;

    const result = await auditService.listAuditLogs({
      action,
      resourceType,
      outcome,
      actorUserId,
      limit,
      offset
    });

    res.json({
      status: 'ok',
      data: result.items,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset
      }
    });
  } catch (err) {
    next(err);
  }
}

