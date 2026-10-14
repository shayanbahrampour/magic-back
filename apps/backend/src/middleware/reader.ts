import { Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { isAllowedAdmin } from '../utils/admins';
import { UserAuthRequest } from './userAuth';

export interface ReaderRequest extends UserAuthRequest {
  isAdmin?: boolean;
}

/**
 * Resolves who is calling from a raw token: an app user (access token, not a
 * registration token) or an admin still on the allowlist. Null for anything else.
 */
export function resolveReader(token: string | null | undefined) {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.role === 'USER' && !payload.purpose && payload.id) {
    return { isAdmin: false as const, appUser: payload };
  }
  if (payload.role === 'ADMIN' && isAllowedAdmin(payload.phone)) {
    return { isAdmin: true as const, appUser: undefined };
  }
  return null;
}

function bearer(req: UserAuthRequest): string | null {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

// Gate for catalogue and content endpoints shared by the app and the admin
// panel. Anonymous callers are rejected outright — nothing about the library is
// public. Sets `req.appUser` for app users and `req.isAdmin` for admins, so
// handlers can personalise lock state or skip client-only filtering.
export function requireReader(req: ReaderRequest, res: Response, next: NextFunction) {
  const reader = resolveReader(bearer(req));
  if (!reader) {
    return res.status(401).json({ error: 'دسترسی غیرمجاز. لطفا ابتدا وارد حساب کاربری شوید.' });
  }
  req.isAdmin = reader.isAdmin;
  if (reader.appUser) req.appUser = reader.appUser;
  next();
}

// Same as `requireReader`, but also accepts the token as `?token=` so plain
// <img> tags (which cannot send headers) can load protected files.
export function requireFileReader(req: ReaderRequest, res: Response, next: NextFunction) {
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const reader = resolveReader(bearer(req) || queryToken);
  if (!reader) {
    return res.status(401).json({ error: 'دسترسی غیرمجاز. لطفا ابتدا وارد حساب کاربری شوید.' });
  }
  req.isAdmin = reader.isAdmin;
  if (reader.appUser) req.appUser = reader.appUser;
  next();
}
