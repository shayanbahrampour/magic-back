import { Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { UserAuthRequest } from './userAuth';

// Attaches `req.appUser` when the request carries a valid app-user access token,
// but lets anonymous requests through untouched. Used on the public catalogue
// endpoints, which everyone can browse but whose lock state depends on who is
// asking. A malformed or expired token is treated as "anonymous" rather than an
// error — browsing must never break because a token went stale.
export function optionalUser(req: UserAuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return next();

  const payload = verifyToken(authHeader.slice(7).trim());
  if (payload && payload.role === 'USER' && !payload.purpose) {
    req.appUser = payload;
  }

  next();
}
