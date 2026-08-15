import type { NextFunction, Request, Response } from 'express';
import type { Role, User } from '../domain';
import type { AuthService } from '../auth/authService';

/**
 * Server-side route gating. This is the enforcement layer the phase brief calls out
 * explicitly: hiding a nav link is not access control. Every gated route checks the
 * session here — a determined user hitting the URL/API directly with no session, an
 * expired session, or the wrong role gets a 401/403 regardless of what the SPA shows.
 */

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Attaches `req.user` if a valid session token is present; does NOT reject otherwise. */
export function attachUser(auth: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (token) {
      const user = await auth.currentUser(token);
      if (user) req.user = user;
    }
    next();
  };
}

/** Rejects with 401 unless a valid session resolved a user (run `attachUser` first). */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    next();
  };
}

/** Rejects with 403 unless `req.user.role` is one of `roles`. Implies `requireAuth`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `Forbidden: requires role ${roles.join(' or ')}.` });
      return;
    }
    next();
  };
}
