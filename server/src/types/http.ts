import type { Request } from 'express';
import type { MemberRole } from './database.js';

/** The verified caller, attached by the auth middleware. Never trusted from the body. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: MemberRole;
  /** The raw JWT, so repositories can build an RLS-scoped Supabase client. */
  accessToken: string;
  isActiveMember: boolean;
}

export interface RequestContext {
  requestId: string;
  user?: AuthenticatedUser;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}

/**
 * A request that has passed `requireAuth`. Controllers behind that middleware
 * take this type, so `req.context.user` is non-optional at the type level and
 * no controller needs a defensive null check that could be forgotten.
 */
export interface AuthenticatedRequest extends Request {
  context: RequestContext & { user: AuthenticatedUser };
}

export {};
