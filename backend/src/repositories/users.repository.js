import { query } from '../db/connection.js';

function mapUserRow(row, includePassword = false) {
  if (!row) return null;
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    tenantId: row.tenant_id || 'default_tenant',
    organizationId: row.tenant_id || 'default_tenant',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (includePassword) {
    user.passwordHash = row.password_hash;
  }
  return user;
}

export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export async function findUserById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM users WHERE id = $1;', [id]);
  return mapUserRow(res.rows[0]);
}

export async function findUserByEmail(email, client = null) {
  const q = client ? client.query.bind(client) : query;
  const normalized = normalizeEmail(email);
  const res = await q('SELECT * FROM users WHERE LOWER(email) = LOWER($1);', [normalized]);
  return mapUserRow(res.rows[0]);
}

export async function findUserWithPasswordByEmail(email, client = null) {
  const q = client ? client.query.bind(client) : query;
  const normalized = normalizeEmail(email);
  const res = await q('SELECT * FROM users WHERE LOWER(email) = LOWER($1);', [normalized]);
  return mapUserRow(res.rows[0], true);
}

export async function findAllUsers(client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM users ORDER BY created_at ASC;');
  return res.rows.map(r => mapUserRow(r));
}

export async function countUsers(client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT COUNT(*)::int as count FROM users;');
  return res.rows[0]?.count || 0;
}

export async function createUserRecord(userData, client = null) {
  const q = client ? client.query.bind(client) : query;
  const id = userData.id || `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const normalizedEmail = normalizeEmail(userData.email);

  const res = await q(
    `INSERT INTO users (
      id, name, email, password_hash, role, status, tenant_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING *;`,
    [
      id,
      userData.name.trim(),
      normalizedEmail,
      userData.passwordHash,
      userData.role || 'viewer',
      userData.status || 'active',
      userData.tenantId || 'default_tenant'
    ]
  );

  return mapUserRow(res.rows[0]);
}

export async function updateUserRole(id, role, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING *;`,
    [role, id]
  );
  return mapUserRow(res.rows[0]);
}

export async function updateUserStatus(id, status, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *;`,
    [status, id]
  );
  return mapUserRow(res.rows[0]);
}

