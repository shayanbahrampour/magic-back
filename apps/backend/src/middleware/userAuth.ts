import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export interface UserAuthRequest extends Request {
  appUser?: {
    id: number;
    phone: string;
    role: string;
    [key: string]: any;
  };
}

// Protects app-user endpoints. Requires a valid access token with role === 'USER'.
export function requireUser(req: UserAuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'دسترسی غیرمجاز. لطفا ابتدا وارد حساب کاربری شوید.' });
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'نشست شما منقضی شده است. لطفا مجددا وارد شوید.' });
  }

  // Access tokens only. Registration tokens (purpose: 'registration') must not pass here.
  if (payload.role !== 'USER' || payload.purpose) {
    return res.status(401).json({ error: 'توکن نامعتبر است. لطفا مجددا وارد شوید.' });
  }

  req.appUser = payload;
  next();
}
