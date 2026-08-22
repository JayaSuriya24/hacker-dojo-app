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

  /**
   * Delete an auth user, and with it everything hanging off their profile.
   *
   * The service role is unavoidable here: there is no non-privileged way to
   * remove a row from `auth.users`, and it is the ONE operation in the deletion
   * flow that needs it — the storage cleanup runs as the member themselves.
   *
   * `profiles.id` references `auth.users (id) on delete cascade`, and the
   * member's own rows cascade from `profiles`, so this single call is what
   * removes bookings, RSVPs, documents, sessions, certifications, the Wi-Fi
   * credential and the notification preferences. Payments, donations, tours and
   * hosted events are `on delete set null` instead: they are financial and
   * calendar records that outlive the account, de-identified rather than erased.
   *
   * The caller's id is taken from their verified token, never from the request
   * body — see `accountService.deleteOwnAccount`.
   */
  async deleteUser(id: string): Promise<void> {
    const { error } = await adminClient.auth.admin.deleteUser(id);

    if (error) {
      logger.error({ err: error, profileId: id }, 'Failed to delete auth user');
      throw new Error(error.message);
    }
  },
};
