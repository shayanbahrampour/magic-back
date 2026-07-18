import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export interface AuthRequest extends Request {
  user?: {
    phone: string;
    role: string;
    [key: string]: any;
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'دسترسی غیرمجاز. لطفا ابتدا وارد حساب مدیریت شوید.' });
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'نشست شما منقضی شده است. لطفا مجددا وارد شوید.' });
  }

  req.user = payload;
  next();
}
