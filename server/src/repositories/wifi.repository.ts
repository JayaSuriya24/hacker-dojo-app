import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapMaybe } from '../utils/postgrest.js';
import type { WifiCredentialRow } from '../types/database.js';

/**
 * Member wireless credentials.
 *
 * Same shape of rule as `door_credentials`: the table has a select policy and
 * no write policy, so issuing is the service role's job and a member can only
 * ever read their own row.
 */
export const wifiRepository = {
  /**
   * The caller's own credential, read as the caller so RLS is what decides.
   */
  async findByProfile(accessToken: string, profileId: string): Promise<WifiCredentialRow | null> {
    return unwrapMaybe(
      await userClient(accessToken)
        .from('wifi_credentials')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle<WifiCredentialRow>(),
      'Could not load your Wi-Fi details.',
    );
  },

  /**
   * Issue a PIN if this profile has none, and report whether that happened.
   *
   * `ignoreDuplicates` makes the insert the idempotency mechanism rather than a
   * read-then-write: the subscription webhook fires on every renewal and status
   * change, and re-issuing on each one would silently change the PIN under a
   * member who is already on the network. The primary key is what decides, so
   * two webhook deliveries racing cannot produce two PINs.
   *
   * `issued` distinguishes "there is a credential" from "there is a NEW
   * credential", which is what the caller needs in order to send the welcome
   * mail exactly once.
   */
  async issueIfAbsent(
    profileId: string,
    pin: string,
  ): Promise<{ credential: WifiCredentialRow; issued: boolean }> {
    // `upsert` with `ignoreDuplicates` is INSERT … ON CONFLICT DO NOTHING, so a
    // second caller gets an empty result rather than an error or an overwrite.
    const inserted = await adminClient
      .from('wifi_credentials')
      .upsert({ profile_id: profileId, pin }, { onConflict: 'profile_id', ignoreDuplicates: true })
      .select('*')
      .maybeSingle<WifiCredentialRow>();

    if (inserted.error) throw new Error(inserted.error.message);
    if (inserted.data) return { credential: inserted.data, issued: true };

    // The insert was ignored, so a row was already there. Read it back rather
    // than assuming what it holds.
    const existing = unwrap(
      await adminClient
        .from('wifi_credentials')
        .select('*')
        .eq('profile_id', profileId)
        .single<WifiCredentialRow>(),
      'Could not read the existing Wi-Fi credential.',
    );

    return { credential: existing, issued: false };
  },

  /** Replace the PIN on an existing credential — the member asked to roll it. */
  async rotate(profileId: string, pin: string): Promise<WifiCredentialRow> {
    return unwrap(
      await adminClient
        .from('wifi_credentials')
        .update({ pin, rotated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .select('*')
        .single<WifiCredentialRow>(),
      'Could not change your Wi-Fi PIN.',
    );
  },
};
