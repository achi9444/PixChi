import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../services/authService.js';
import type { UserRole } from '../types/auth.js';
import { sendApiError } from '../utils/apiError.js';

export function attachAuthUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    req.authUser = undefined;
    next();
    return;
  }
  const user = verifyAccessToken(match[1]);
  req.authUser = user ?? undefined;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    sendApiError(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  next();
}

export function requireRole(minRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser || !minRoles.includes(req.authUser.role)) {
      sendApiError(res, 403, 'FORBIDDEN', 'Forbidden');
      return;
    }
    next();
  };
}
