import { adminClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';

export interface AuthUserSummary {
  id: string;
  email: string;
}

/**
 * The only code that talks to Supabase's auth admin surface.
 *
 * `getUserFromToken` asks Supabase to verify — a network hop per request, but
 * the alternative (verifying the signature locally) accepts tokens belonging to
 * sessions that have since been revoked. Correctness wins; the hop is a few
 * milliseconds against the same region.
 */
export const authRepository = {
  async getUserFromToken(accessToken: string): Promise<AuthUserSummary | null> {
    const { data, error } = await adminClient.auth.getUser(accessToken);

    if (error || !data.user) {
      logger.debug({ err: error }, 'Token verification rejected');
      return null;
    }

    return { id: data.user.id, email: data.user.email ?? '' };
  },
};
