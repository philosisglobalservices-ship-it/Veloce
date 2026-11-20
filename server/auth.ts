import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db, generateId } from './db.ts';
import { AccountStatus, KycStatus, UserProfile, UserRole } from '../src/types.ts';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

export interface TokenPayload {
  sub: string;
  role: UserRole;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: UserProfile;
}

export function signToken(user: { id: string; role: UserRole; email: string }): string {
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

export function mapUserRow(row: any): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    handle: row.handle,
    accountNumber: row.account_number,
    role: row.role as UserRole,
    planId: row.plan_id,
    planName: row.plan_name ?? undefined,
    kycStatus: row.kyc_status as KycStatus,
    accountStatus: row.account_status as AccountStatus,
    createdAt: row.created_at,
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = header.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    const row = db
      .prepare(
        `SELECT u.*, p.name as plan_name
         FROM users u
         LEFT JOIN account_plans p ON u.plan_id = p.id
         WHERE u.id = ?`
      )
      .get(decoded.sub);

    if (!row) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }

    req.authUser = mapUserRow(row);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}

export function requireActiveAccount(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.authUser.accountStatus === AccountStatus.FROZEN) {
    res.status(403).json({
      error: 'Your account is currently frozen by compliance. Outgoing transfers and adjustments are blocked.',
    });
    return;
  }
  next();
}

export function writeAuditLog(params: {
  actorId: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (
      id, actor_id, actor_email, actor_role, action, target_type, target_id, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId('aud'),
    params.actorId,
    params.actorEmail,
    params.actorRole,
    params.action,
    params.targetType,
    params.targetId,
    JSON.stringify(params.details),
    new Date().toISOString()
  );
}
