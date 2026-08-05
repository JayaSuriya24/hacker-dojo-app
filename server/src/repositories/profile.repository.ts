import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList, unwrapMaybe } from '../utils/postgrest.js';
import type {
  MemberDirectoryRow,
  MembershipRow,
  NotificationPreferencesRow,
  PlanRow,
  ProfileRow,
} from '../types/database.js';

export interface DirectoryQuery {
  search?: string | undefined;
  skills?: string[] | undefined;
  onlyHere?: boolean | undefined;
  limit: number;
  offset: number;
}

/** Fields a member is allowed to change on their own card. */
export type ProfilePatch = Partial<
  Pick<
    ProfileRow,
    | 'full_name'
    | 'bio'
    | 'company'
    | 'current_project'
    | 'skills'
    | 'phone'
    | 'directory_visible'
    | 'avatar_path'
  >
>;

export const profileRepository = {
  /**
   * Used by the auth middleware before a caller identity exists, so it runs as
   * the service role. Everything else in this file runs as the caller.
   */
  async findById(id: string): Promise<ProfileRow | null> {
    return unwrapMaybe(
      await adminClient.from('profiles').select('*').eq('id', id).maybeSingle<ProfileRow>(),
      'Could not load that profile.',
    );
  },

  async hasActiveMembership(profileId: string): Promise<boolean> {
    const { data, error } = await adminClient
      .from('memberships')
      .select('id, current_period_end')
      .eq('profile_id', profileId)
      .in('status', ['active', 'trialing'])
      .limit(1);

    if (error) return false;
    const row = data?.[0];
    if (!row) return false;
    return row.current_period_end === null || new Date(row.current_period_end) > new Date();
  },

  async update(accessToken: string, id: string, patch: ProfilePatch): Promise<ProfileRow> {
    return unwrap(
      await userClient(accessToken)
        .from('profiles')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single<ProfileRow>(),
      'Could not save your profile.',
    );
  },

  /**
   * The community directory.
   *
   * Filtering happens in the database, not in Node: the alternative is paging
   * the whole member table into memory to run `Array.filter`, which is fine at
   * twelve members and ruinous at twelve thousand.
   */
  async directory(accessToken: string, query: DirectoryQuery): Promise<MemberDirectoryRow[]> {
    let request = userClient(accessToken)
      .from('member_directory')
      .select('*')
      .order('is_here', { ascending: false })
      .order('full_name', { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);

    if (query.onlyHere) request = request.eq('is_here', true);

    if (query.skills?.length) {
      // `overlaps` → the array && operator, served by the GIN index on skills.
      request = request.overlaps('skills', query.skills);
    }

    if (query.search) {
      // Escape PostgREST's filter delimiters so a comma or paren in the search
      // box can't break out of the `or(...)` expression.
      const term = query.search.replace(/[,()\\]/g, ' ').trim();
      if (term) {
        request = request.or(`full_name.ilike.%${term}%,company.ilike.%${term}%`);
      }
    }

    return unwrapList(
      await request.returns<MemberDirectoryRow[]>(),
      'Could not load the directory.',
    );
  },

  async directoryEntry(accessToken: string, id: string): Promise<MemberDirectoryRow> {
    return unwrap(
      await userClient(accessToken)
        .from('member_directory')
        .select('*')
        .eq('id', id)
        .single<MemberDirectoryRow>(),
      'Could not load that member.',
    );
  },

  async membership(accessToken: string, profileId: string): Promise<MembershipRow | null> {
    return unwrapMaybe(
      await userClient(accessToken)
        .from('memberships')
        .select('*')
        .eq('profile_id', profileId)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<MembershipRow>(),
      'Could not load your membership.',
    );
  },

  async plans(): Promise<PlanRow[]> {
    return unwrapList(
      await adminClient
        .from('plans')
        .select('*')
        .eq('active', true)
        .order('sort_order')
        .returns<PlanRow[]>(),
      'Could not load membership plans.',
    );
  },

  async planById(id: string): Promise<PlanRow | null> {
    return unwrapMaybe(
      await adminClient.from('plans').select('*').eq('id', id).maybeSingle<PlanRow>(),
      'Could not load that plan.',
    );
  },

  async notificationPreferences(
    accessToken: string,
    profileId: string,
  ): Promise<NotificationPreferencesRow> {
    const client = userClient(accessToken);

    const existing = unwrapMaybe(
      await client
        .from('notification_preferences')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle<NotificationPreferencesRow>(),
      'Could not load your notification settings.',
    );
    if (existing) return existing;

    // Create defaults on first read rather than at signup, so the row exists
    // exactly when something needs it.
    return unwrap(
      await client
        .from('notification_preferences')
        .insert({ profile_id: profileId })
        .select('*')
        .single<NotificationPreferencesRow>(),
      'Could not create your notification settings.',
    );
  },

  async updateNotificationPreferences(
    accessToken: string,
    profileId: string,
    patch: Partial<
      Pick<NotificationPreferencesRow, 'events' | 'bookings' | 'weekly_digest' | 'push_token'>
    >,
  ): Promise<NotificationPreferencesRow> {
    const payload = {
      profile_id: profileId,
      ...patch,
      ...(patch.push_token !== undefined ? { push_token_at: new Date().toISOString() } : {}),
    };

    return unwrap(
      await userClient(accessToken)
        .from('notification_preferences')
        .upsert(payload, { onConflict: 'profile_id' })
        .select('*')
        .single<NotificationPreferencesRow>(),
      'Could not save your notification settings.',
    );
  },
};
