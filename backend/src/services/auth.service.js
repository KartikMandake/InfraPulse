import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as usersRepo from '../repositories/users.repository.js';
import * as sessionsRepo from '../repositories/sessions.repository.js';
import { recordAuditEvent } from './audit.service.js';
import { ApiError } from '../utils/ApiError.js';
import {withTransaction,query} from '../db/connection.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DUMMY_BCRYPT_HASH = '$2a$10$7EqJtq98hPqEX7fNZaFWoO.8/Pj7K16bMhZ8tT5lC0Wz.c1mO0m9u';

export async function hashPassword(plainText) {
  if (!plainText || typeof plainText !== 'string') {
    throw ApiError.badRequest('Password is required.');
  }
  if (plainText.length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters long.');
  }
  if (plainText.length > 128) {
    throw ApiError.badRequest('Password exceeds maximum allowed length of 128 characters.');
  }
  if (/^\s+$/.test(plainText)) {
    throw ApiError.badRequest('Password cannot consist entirely of whitespace.');
  }
  return bcrypt.hash(plainText, 10);
}

export async function verifyPassword(plainText, hash) {
  if (!plainText || !hash) return false;
  return bcrypt.compare(plainText, hash);
}

/**
 * Register a new user.
 * First registered user automatically becomes 'admin'; subsequent users default to 'viewer'.
 * Self-elevation attempts are strictly rejected.
 */
export async function registerUser(data,req=null){
  return withTransaction(async()=>{await query('SELECT pg_advisory_xact_lock(23002701)');return registerUserLocked(data,req);});
}
async function registerUserLocked({ name, email, password }, req = null) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw ApiError.badRequest('User name is required.');
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw ApiError.badRequest('A valid email address is required.');
  }

  const normalized = usersRepo.normalizeEmail(email);
  const existing = await usersRepo.findUserByEmail(normalized);
  if (existing) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  const passwordHash = await hashPassword(password);

  // Secure first-admin bootstrap: first user in database gets 'admin', all others get 'viewer'
  const userCount = await usersRepo.countUsers();
  const assignedRole = userCount === 0 ? 'admin' : 'viewer';

  const user = await usersRepo.createUserRecord({
    name,
    email: normalized,
    passwordHash,
    role: assignedRole,
    tenantId: userCount===0?'default_tenant':`tenant_${crypto.randomBytes(16).toString('hex')}`,
    status: 'active'
  });

  await recordAuditEvent({
    actor: { id: user.id, email: user.email, role: user.role,tenantId:user.tenantId },
    action: 'auth.register',
    resourceType: 'user',
    resourceId: user.id,
    outcome: 'success',
    metadata: { role: assignedRole, isBootstrapAdmin: assignedRole === 'admin' },
    req
  });

  return user;
}

/**
 * Authenticates user credentials and generates a server-persisted session.
 */
export async function loginUser({ email, password }, req = null) {
  if (!email || !password) {
    throw ApiError.badRequest('Email and password are required.');
  }

  const normalized = usersRepo.normalizeEmail(email);
  const userWithPwd = await usersRepo.findUserWithPasswordByEmail(normalized);

  if (!userWithPwd) {
    // Timing attack mitigation: dummy compare to prevent user enumeration
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH).catch(() => false);
    await recordAuditEvent({
      actor: null,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: null,
      outcome: 'failure',
      metadata: { attemptedEmail: normalized, reason: 'user_not_found' },
      req
    });
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (userWithPwd.status === 'suspended') {
    await recordAuditEvent({
      actor: { id: userWithPwd.id, email: userWithPwd.email, role: userWithPwd.role,tenantId:userWithPwd.tenantId },
      action: 'auth.login',
      resourceType: 'user',
      resourceId: userWithPwd.id,
      outcome: 'denied',
      metadata: { reason: 'account_suspended' },
      req
    });
    throw ApiError.forbidden('Your account has been suspended. Please contact your administrator.');
  }

  const passwordValid = await verifyPassword(password, userWithPwd.passwordHash);
  if (!passwordValid) {
    await recordAuditEvent({
      actor: { id: userWithPwd.id, email: userWithPwd.email, role: userWithPwd.role,tenantId:userWithPwd.tenantId },
      action: 'auth.login',
      resourceType: 'user',
      resourceId: userWithPwd.id,
      outcome: 'failure',
      metadata: { reason: 'incorrect_password' },
      req
    });
    throw ApiError.unauthorized('Invalid email or password.');
  }

  // Generate crypto session token
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || null;
  const userAgent = req?.headers?.['user-agent'] || null;

  await sessionsRepo.createSessionRecord({
    id: sessionToken,
    userId: userWithPwd.id,
    tenantId: userWithPwd.tenantId,
    expiresAt,
    ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')?.[0]?.trim() : null,
    userAgent
  });

  const publicUser = {
    id: userWithPwd.id,
    name: userWithPwd.name,
    email: userWithPwd.email,
    role: userWithPwd.role,
    status: userWithPwd.status
    ,tenantId: userWithPwd.tenantId,
    organizationId: userWithPwd.tenantId
  };

  await recordAuditEvent({
    actor: publicUser,
    action: 'auth.login',
    resourceType: 'session',
    resourceId: userWithPwd.id,
    outcome: 'success',
    metadata: { role: publicUser.role },
    req
  });

  return {
    user: publicUser,
    sessionToken,
    expiresAt
  };
}

/**
 * Terminates session.
 */
export async function logoutUser(sessionToken, currentUser = null, req = null) {
  if (sessionToken) {
    await sessionsRepo.deleteSessionRecord(sessionToken);
  }

  await recordAuditEvent({
    actor: currentUser,
    action: 'auth.logout',
    resourceType: 'session',
    resourceId: currentUser?.id || null,
    outcome: 'success',
    req
  });

  return { success: true, message: 'Logged out successfully.' };
}

/**
 * Validates active session token.
 */
export async function validateSession(sessionToken) {
  if (!sessionToken) return null;
  return sessionsRepo.findValidSessionById(sessionToken);
}


/**
 * Revokes all active sessions for a user (on role update, password change, or explicit logout-all).
 */
export async function revokeAllUserSessions(userId, req = null) {
  const count = await sessionsRepo.deleteUserSessions(userId);
  await recordAuditEvent({
    actor: req?.user || { id: userId },
    action: 'auth.sessions_revoked',
    resourceType: 'session',
    resourceId: userId,
    outcome: 'success',
    metadata: { revokedCount: count },
    req
  }).catch(() => {});
  return { success: true, revokedCount: count };
}
