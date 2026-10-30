import { query } from '../db/connection.js';

export async function createSessionRecord(sessionData, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `INSERT INTO sessions (
      id, user_id, expires_at, ip_address, user_agent
    ) VALUES (
      $1, $2, $3, $4, $5
    )
    RETURNING *;`,
    [
      sessionData.id,
      sessionData.userId,
      sessionData.expiresAt,
      sessionData.ipAddress || null,
      sessionData.userAgent || null
    ]
  );
  return res.rows[0];
}

export async function findValidSessionById(sessionId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `SELECT
      s.id as session_id,
      s.expires_at,
      s.created_at as session_created_at,
      u.id as user_id,
      u.name as user_name,
      u.email as user_email,
      u.role as user_role,
      u.status as user_status
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = $1 AND s.expires_at > NOW() AND u.status = 'active';`,
    [sessionId]
  );

  const row = res.rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    createdAt: row.session_created_at,
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      role: row.user_role,
      status: row.user_status
    }
  };
}

export async function deleteSessionRecord(sessionId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('DELETE FROM sessions WHERE id = $1 RETURNING id;', [sessionId]);
  return res.rows.length > 0;
}

export async function deleteUserSessions(userId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('DELETE FROM sessions WHERE user_id = $1 RETURNING id;', [userId]);
  return res.rows.length;
}

export async function cleanExpiredSessions(client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('DELETE FROM sessions WHERE expires_at <= NOW() RETURNING id;');
  return res.rows.length;
}

