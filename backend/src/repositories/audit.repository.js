import { query } from '../db/connection.js';
import {tenantContext} from '../security/tenantContext.js';

function mapAuditRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
    correlationId: row.correlation_id,
    ipAddress: row.ip_address,
    createdAt: row.created_at
  };
}

export async function createAuditRecord(data, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = data.id || `aud_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

  const res = await q(
    `INSERT INTO audit_logs (
      id, actor_user_id, actor_email, actor_role, action, resource_type,
      resource_id, outcome, metadata, correlation_id, ip_address,tenant_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,$12
    )
    RETURNING *;`,
    [
      id,
      data.actorUserId || null,
      data.actorEmail || null,
      data.actorRole || null,
      data.action,
      data.resourceType,
      data.resourceId || null,
      data.outcome || 'success',
      JSON.stringify(data.metadata || {}),
      data.correlationId || null,
      data.ipAddress || null,
      tenantContext()?.tenantId||data.tenantId||'default_tenant'
    ]
  );

  return mapAuditRow(res.rows[0]);
}

export async function findAuditLogs(filters = {}, client = null) {
  const q = client ? client.query.bind(client) : query;
  const conditions = [];
  const params = [];

  if (filters.action) {
    params.push(filters.action);
    conditions.push(`action = $${params.length}`);
  }
  if (filters.resourceType) {
    params.push(filters.resourceType);
    conditions.push(`resource_type = $${params.length}`);
  }
  if (filters.outcome) {
    params.push(filters.outcome);
    conditions.push(`outcome = $${params.length}`);
  }
  if (filters.actorUserId) {
    params.push(filters.actorUserId);
    conditions.push(`actor_user_id = $${params.length}`);
  }

  const limit = Math.min(Number(filters.limit) || 50, 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countSql = `SELECT COUNT(*)::int as total FROM audit_logs ${whereClause};`;
  const countRes = await q(countSql, params);
  const total = countRes.rows[0]?.total || 0;

  // Get paginated items
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  params.push(offset);
  const offsetPlaceholder = `$${params.length}`;

  const dataSql = `
    SELECT * FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
  `;

  const res = await q(dataSql, params);
  return {
    total,
    limit,
    offset,
    items: res.rows.map(mapAuditRow)
  };
}

