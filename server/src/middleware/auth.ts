import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { authRepository } from '../repositories/auth.repository.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { MemberRole } from '../types/database.js';

const BEARER = /^Bearer\s+(.+)$/i;

function extractToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;
  const match = BEARER.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Verify the caller's Supabase JWT and hydrate `req.context.user`.
 *
 * The token is verified against Supabase rather than decoded locally: a
 * locally-decoded JWT still looks valid after the user signed out or was
 * banned, and "valid signature" is not the same claim as "this session is
 * still live".
 *
 * Role and membership come from the database, never from the token's claims —
 * a client controls what it sends, and nothing it sends decides what it may do.
 */
export const requireAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = extractToken(req);
    if (!token) throw AppError.unauthorized();

    const authUser = await authRepository.getUserFromToken(token);
    if (!authUser) throw AppError.sessionExpired();

    const [profile, isActiveMember] = await Promise.all([
      profileRepository.findById(authUser.id),
      profileRepository.hasActiveMembership(authUser.id),
    ]);

    const user: AuthenticatedUser = {
      id: authUser.id,
      email: profile?.email ?? authUser.email,
      role: profile?.role ?? 'guest',
      accessToken: token,
      isActiveMember,
    };

    req.context.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Attach the caller if a token is present, but let anonymous requests through.
 * Used on public surfaces (the events feed, plan list) that show more detail to
 * a signed-in member without requiring one.
 */
export const optionalAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!extractToken(req)) {
    next();
    return;
  }
  // Fall through to anonymous rather than 401 — an expired token on a public
  // route should degrade, not block.
  requireAuth(req, res, (error?: unknown) =>
    next(error instanceof AppError && error.status === 401 ? undefined : error),
  );
};

/** Gate a route behind one of the given roles. Runs after `requireAuth`. */
export function requireRole(...roles: MemberRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.context.user;
    if (!user) return next(AppError.unauthorized());
    if (!roles.includes(user.role)) return next(AppError.forbidden());
    next();
  };
}

/**
 * Gate a route behind an active membership — the server-side twin of the
 * "Booking is a member benefit" copy in the app. The UI hides these actions;
 * this makes hiding them irrelevant to security.
 */
export const requireActiveMembership: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const user = req.context.user;
  if (!user) return next(AppError.unauthorized());
  if (!user.isActiveMember) return next(AppError.membershipRequired());
  next();
};
