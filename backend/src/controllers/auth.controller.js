import * as authService from '../services/auth.service.js';
import * as usersRepo from '../repositories/users.repository.js';
import * as sessionsRepo from '../repositories/sessions.repository.js';
import { recordAuditEvent } from '../services/audit.service.js';
import { ApiError } from '../utils/ApiError.js';
import { config } from '../config/env.js';

const COOKIE_NAME = 'infrapulse_session';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/'
  });
}

export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const user = await authService.registerUser({ name, email, password }, req);
    
    // Automatically log in newly registered user
    const loginResult = await authService.loginUser({ email, password }, req);
    setSessionCookie(res, loginResult.sessionToken);

    res.status(201).json({
      status: 'ok',
      data: {
        user: loginResult.user,
        sessionToken: loginResult.sessionToken,
        expiresAt: loginResult.expiresAt
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser({ email, password }, req);
    setSessionCookie(res, result.sessionToken);

    res.json({
      status: 'ok',
      data: {
        user: result.user,
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const token = req.sessionToken || req.cookies?.[COOKIE_NAME];
    await authService.logoutUser(token, req.user, req);
    res.clearCookie(COOKIE_NAME, { path: '/' });

    res.json({
      status: 'ok',
      message: 'Logged out successfully.'
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No active session found.'
      });
    }

    res.json({
      status: 'ok',
      data: {
        user: req.user
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function listUsers(req, res, next) {
  try {
    const users = await usersRepo.findAllUsers();
    res.json({
      status: 'ok',
      data: users
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'responder', 'viewer'].includes(role)) {
      throw ApiError.badRequest(`Invalid role "${role}". Must be admin, responder, or viewer.`);
    }

    const targetUser = await usersRepo.findUserById(id);
    if (!targetUser) {
      throw ApiError.notFound(`User with ID ${id} not found.`);
    }

    // Safety: prevent admin from demoting the last active admin
    if (targetUser.role === 'admin' && role !== 'admin') {
      const allUsers = await usersRepo.findAllUsers();
      const adminCount = allUsers.filter(u => u.role === 'admin' && u.status === 'active').length;
      if (adminCount <= 1) {
        throw ApiError.badRequest('Cannot demote the only remaining active administrator.');
      }
    }

    const updatedUser = await usersRepo.updateUserRole(id, role);
    // Invalidate sessions immediately so permission changes take effect
    await sessionsRepo.deleteUserSessions(id);

    await recordAuditEvent({
      actor: req.user,
      action: 'user.role_updated',
      resourceType: 'user',
      resourceId: id,
      outcome: 'success',
      metadata: {
        previousRole: targetUser.role,
        newRole: role,
        targetEmail: targetUser.email
      },
      req
    });

    res.json({
      status: 'ok',
      data: updatedUser
    });
  } catch (err) {
    next(err);
  }
}


export async function revokeSessions(req, res, next) {
  try {
    const count = await sessionsRepo.deleteUserSessions(req.user.id);
    res.json({
      status: 'ok',
      message: 'All active sessions revoked successfully.',
      revokedCount: count
    });
  } catch (err) {
    next(err);
  }
}
