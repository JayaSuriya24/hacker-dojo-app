import { adminClient } from '../config/supabase.js';
import { unwrapList } from '../utils/postgrest.js';
import type { PushDeliveryStatus, PushTargetRow } from '../types/database.js';

export interface BookingReminderRow {
  booking_id: string;
  profile_id: string;
  push_token: string;
  resource_name: string;
  starts_at: string;
  ends_at: string;
}

export interface MembershipReminderRow {
  membership_id: string;
  profile_id: string;
  push_token: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

interface PreferenceRow {
  profile_id: string;
  push_token: string | null;
  bookings: boolean;
}

/**
 * Notification preferences for a set of profiles, keyed by profile id.
 *
 * Fetched on their own rather than embedded in the query that needs them.
 * `bookings`, `memberships` and `notification_preferences` all reference
 * `profiles`, but none of them reference each other, so there is no path for
 * PostgREST to embed one from another. Asking for it anyway — as
 * `notification_preferences:profile_id(push_token, …)` — resolved the embed
 * against `profiles` via the `profile_id` foreign key and failed every run with
 * "column profiles_1.push_token does not exist", which meant no booking or
 * membership reminder was ever sent. A second round trip once a minute is the
 * price of a relationship the schema does not have.
 */
async function preferencesByProfile(profileIds: string[]): Promise<Map<string, PreferenceRow>> {
  const unique = [...new Set(profileIds)];
  if (unique.length === 0) return new Map();

  const rows = unwrapList(
    await adminClient
      .from('notification_preferences')
      .select('profile_id, push_token, bookings')
      .in('profile_id', unique)
      .returns<PreferenceRow[]>(),
    'Could not load notification preferences.',
  );

  return new Map(rows.map((row) => [row.profile_id, row]));
}

/**
 * Push delivery state.
 *
 * Service role throughout: the sender is a background job with no caller, and
 * `push_deliveries` has no insert policy so nothing can forge a "we already
 * told them" row to suppress a notification.
 */
export const notificationRepository = {
  /**
   * Everyone who opted into a channel and has a live token.
   *
   * Consent is a WHERE clause rather than a filter applied after fetching, so a
   * member who turned a channel off is never loaded into memory as a candidate
   * in the first place.
   */
  /**
   * Everyone who should be emailed about a new event.
   *
   * Deliberately an OPT-OUT, which is the opposite of `audienceFor` below and
   * is the whole reason this is a separate query. That one starts from
   * `notification_preferences` and keeps rows where the channel is true — fine
   * for push, where a row only exists once a device has registered a token.
   * Email has no such prerequisite: every profile has an address from the day
   * it is created, and preference rows are NOT written on signup. Filtering the
   * same way would silently skip anyone who has never opened the settings
   * screen, which today is one profile in four.
   *
   * So: start from profiles, and remove only those who explicitly turned event
   * mail off. Never having expressed a preference is not the same as declining.
   */
  async emailAudienceForEvents(): Promise<Array<{ id: string; email: string; full_name: string }>> {
    const profiles = await unwrapList(
      await adminClient
        .from('profiles')
        .select('id, email, full_name')
        .returns<Array<{ id: string; email: string; full_name: string }>>(),
      'Could not load the announcement audience.',
    );

    const declined = await unwrapList(
      await adminClient
        .from('notification_preferences')
        .select('profile_id')
        .eq('events', false)
        .returns<Array<{ profile_id: string }>>(),
      'Could not load notification preferences.',
    );

    const optedOut = new Set(declined.map((row) => row.profile_id));

    return profiles.filter((profile) => Boolean(profile.email) && !optedOut.has(profile.id));
  },

  async audienceFor(channel: 'events' | 'bookings' | 'weekly_digest'): Promise<PushTargetRow[]> {
    return unwrapList(
      await adminClient
        .from('notification_preferences')
        .select('profile_id, push_token, events, bookings, weekly_digest')
        .not('push_token', 'is', null)
        .eq(channel, true)
        .returns<PushTargetRow[]>(),
      'Could not load the notification audience.',
    );
  },

  /**
   * Reserve a delivery.
   *
   * Returns false when this exact notification was already claimed, which the
   * unique index on `(profile_id, dedupe_key)` decides. Claiming before the
   * send — rather than recording after it — is what makes a crash mid-batch
   * safe to retry.
   */
  async claimDelivery(input: {
    profileId: string;
    dedupeKey: string;
    channel: string;
    title: string;
    body: string;
  }): Promise<boolean> {
    const { error } = await adminClient.from('push_deliveries').insert({
      profile_id: input.profileId,
      dedupe_key: input.dedupeKey,
      channel: input.channel,
      title: input.title,
      body: input.body,
    });

    if (!error) return true;
    if (error.code === '23505') return false;
    throw new Error(error.message);
  },

  async markDelivery(
    profileId: string,
    dedupeKey: string,
    outcome: { status: PushDeliveryStatus; ticketId?: string | null; error?: string | null },
  ): Promise<void> {
    const { error } = await adminClient
      .from('push_deliveries')
      .update({
        status: outcome.status,
        ticket_id: outcome.ticketId ?? null,
        error: outcome.error?.slice(0, 500) ?? null,
      })
      .eq('profile_id', profileId)
      .eq('dedupe_key', dedupeKey);

    if (error) throw new Error(error.message);
  },

  /** Expo told us this device is gone; keeping the token would retry it forever. */
  async clearPushToken(profileId: string): Promise<void> {
    const { error } = await adminClient
      .from('notification_preferences')
      .update({ push_token: null, push_token_at: null })
      .eq('profile_id', profileId);

    if (error) throw new Error(error.message);
  },

  /**
   * Confirmed bookings starting inside the window, for members who want
   * reminders and have a token.
   *
   * The dedupe key upstream is the booking id, so a booking whose reminder
   * already went out is filtered by the unique index rather than by a
   * `reminded_at` column — one less piece of state to keep correct.
   */
  async upcomingBookingsNeedingReminder(withinMinutes: number): Promise<BookingReminderRow[]> {
    const now = new Date();
    const horizon = new Date(now.getTime() + withinMinutes * 60_000);

    const rows = unwrapList(
      await adminClient
        .from('bookings')
        .select('id, profile_id, starts_at, ends_at, resources(name)')
        .eq('status', 'confirmed')
        .gte('starts_at', now.toISOString())
        .lte('starts_at', horizon.toISOString())
        .returns<
          Array<{
            id: string;
            profile_id: string;
            starts_at: string;
            ends_at: string;
            resources: { name: string } | null;
          }>
        >(),
      'Could not load bookings needing a reminder.',
    );

    const preferences = await preferencesByProfile(rows.map((row) => row.profile_id));

    return rows.flatMap((row) => {
      const preference = preferences.get(row.profile_id);
      // Consent and a live token are both required, and the token is narrowed
      // here so the mapping below does not have to assert it.
      if (!preference?.bookings || !preference.push_token) return [];

      return [
        {
          booking_id: row.id,
          profile_id: row.profile_id,
          push_token: preference.push_token,
          resource_name: row.resources?.name ?? 'Your reservation',
          starts_at: row.starts_at,
          ends_at: row.ends_at,
        },
      ];
    });
  },

  /** Memberships whose period ends inside the window, for members with a token. */
  async membershipsExpiringWithin(daysAhead: number): Promise<MembershipReminderRow[]> {
    const now = new Date();
    const horizon = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const rows = unwrapList(
      await adminClient
        .from('memberships')
        .select('id, profile_id, current_period_end, cancel_at_period_end')
        .in('status', ['active', 'trialing'])
        .not('current_period_end', 'is', null)
        .gte('current_period_end', now.toISOString())
        .lte('current_period_end', horizon.toISOString())
        .returns<
          Array<{
            id: string;
            profile_id: string;
            current_period_end: string;
            cancel_at_period_end: boolean;
          }>
        >(),
      'Could not load memberships needing a reminder.',
    );

    const preferences = await preferencesByProfile(rows.map((row) => row.profile_id));

    // No consent flag here on purpose: a membership about to lapse is account
    // news rather than a channel someone opted into, so a live token is the
    // only condition.
    return rows.flatMap((row) => {
      const pushToken = preferences.get(row.profile_id)?.push_token;
      if (!pushToken) return [];

      return [
        {
          membership_id: row.id,
          profile_id: row.profile_id,
          push_token: pushToken,
          current_period_end: row.current_period_end,
          cancel_at_period_end: row.cancel_at_period_end,
        },
      ];
    });
  },
};
