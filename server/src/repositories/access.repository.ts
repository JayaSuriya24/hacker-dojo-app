import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList, unwrapMaybe } from '../utils/postgrest.js';
import type { DoorAccessLogRow, DoorCredentialRow } from '../types/database.js';

/**
 * Door credentials and their audit trail.
 *
 * Issuing runs as the service role through `issue_door_credential`, because a
 * credential is the building's decision and not the member's — the table has a
 * select policy and no write policy at all, exactly like `payments`.
 *
 * The audit log is append-only from here and readable by its owner and staff.
 * It is written for every attempt, granted or refused: a refusal at 2am is the
 * row someone actually needs when a member says the door would not open.
 */
export const accessRepository = {
  /** Issue on first use, reactivate if it was revoked, otherwise return as-is. */
  async issueCredential(profileId: string): Promise<DoorCredentialRow> {
    const { data, error } = await adminClient
      .rpc('issue_door_credential', { p_profile_id: profileId })
      .single<DoorCredentialRow>();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('issue_door_credential returned no row');
    return data;
  },

  async findCredential(accessToken: string, profileId: string): Promise<DoorCredentialRow | null> {
    return unwrapMaybe(
      await userClient(accessToken)
        .from('door_credentials')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle<DoorCredentialRow>(),
      'Could not load your key.',
    );
  },

  /**
   * Record an unlock attempt.
   *
   * Service role: an append-only audit trail that the subject can suppress is
   * not an audit trail. Failures to write are surfaced rather than swallowed —
   * an unlock we cannot account for should not report success.
   */
  async log(input: {
    profileId: string;
    keyId: string;
    granted: boolean;
    reason: string | null;
    deviceHint: string | null;
  }): Promise<DoorAccessLogRow> {
    return unwrap(
      await adminClient
        .from('door_access_logs')
        .insert({
          profile_id: input.profileId,
          key_id: input.keyId,
          granted: input.granted,
          reason: input.reason,
          device_hint: input.deviceHint,
        })
        .select('*')
        .single<DoorAccessLogRow>(),
      'Could not record that door event.',
    );
  },

  /** Recent attempts, for the member's own history and for staff investigation. */
  async recentFor(
    accessToken: string,
    profileId: string,
    limit: number,
  ): Promise<DoorAccessLogRow[]> {
    return unwrapList(
      await userClient(accessToken)
        .from('door_access_logs')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(limit)
        .returns<DoorAccessLogRow[]>(),
      'Could not load your door history.',
    );
  },

  /**
   * How many unlocks this profile attempted inside the window.
   *
   * A second limiter behind the HTTP one: the rate limiter is keyed per process
   * and resets on deploy, and "how many times did this badge fire in a minute"
   * is a property of the building rather than of one API instance.
   */
  async attemptsSince(profileId: string, since: Date): Promise<number> {
    const { count, error } = await adminClient
      .from('door_access_logs')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .gte('created_at', since.toISOString());

    if (error) throw new Error(error.message);
    return count ?? 0;
  },
};
