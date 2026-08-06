import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList, unwrapMaybe } from '../utils/postgrest.js';
import type {
  BookingRow,
  BookingWithResourceRow,
  LiveSessionRow,
  ResourceAvailabilityRow,
  ResourceKind,
  SessionRow,
} from '../types/database.js';

export interface CreateBookingInput {
  profileId: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  notes?: string | undefined;
}

export const resourceRepository = {
  async list(kind?: ResourceKind): Promise<ResourceAvailabilityRow[]> {
    let request = adminClient.from('resource_availability').select('*').order('name');
    if (kind) request = request.eq('kind', kind);

    return unwrapList(
      await request.returns<ResourceAvailabilityRow[]>(),
      'Could not load the equipment list.',
    );
  },

  async findById(id: string): Promise<ResourceAvailabilityRow | null> {
    return unwrapMaybe(
      await adminClient
        .from('resource_availability')
        .select('*')
        .eq('id', id)
        .maybeSingle<ResourceAvailabilityRow>(),
      'Could not load that resource.',
    );
  },

  /**
   * Busy ranges for one resource on one day.
   *
   * Deliberately selects only the time columns and runs as the service role:
   * the availability grid needs to know a slot is taken, and nothing more.
   * Returning `profile_id` here would leak who is in which phone booth to
   * anyone who can open the booking sheet.
   */
  async busyRanges(
    resourceId: string,
    dayStart: string,
    dayEnd: string,
  ): Promise<Array<{ starts_at: string; ends_at: string }>> {
    return unwrapList(
      await adminClient
        .from('bookings')
        .select('starts_at, ends_at')
        .eq('resource_id', resourceId)
        .eq('status', 'confirmed')
        .lt('starts_at', dayEnd)
        .gt('ends_at', dayStart)
        .order('starts_at')
        .returns<Array<{ starts_at: string; ends_at: string }>>(),
      'Could not load availability.',
    );
  },
};

export const bookingRepository = {
  async listForProfile(accessToken: string, profileId: string): Promise<BookingWithResourceRow[]> {
    return unwrapList(
      await userClient(accessToken)
        .from('bookings')
        .select('*, resources(id, name, kind, model)')
        .eq('profile_id', profileId)
        .eq('status', 'confirmed')
        .gte('ends_at', new Date().toISOString())
        .order('starts_at')
        .returns<BookingWithResourceRow[]>(),
      'Could not load your reservations.',
    );
  },

  async findById(accessToken: string, id: string): Promise<BookingRow | null> {
    return unwrapMaybe(
      await userClient(accessToken)
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle<BookingRow>(),
      'Could not load that reservation.',
    );
  },

  /**
   * Insert and let the database arbitrate.
   *
   * There is no availability check before this call on purpose. Checking then
   * inserting is a time-of-check/time-of-use race; the `bookings_no_overlap`
   * exclusion constraint decides, and a loser gets a 409 translated from
   * SQLSTATE 23P01.
   */
  async create(accessToken: string, input: CreateBookingInput): Promise<BookingRow> {
    return unwrap(
      await userClient(accessToken)
        .from('bookings')
        .insert({
          profile_id: input.profileId,
          resource_id: input.resourceId,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          notes: input.notes ?? null,
        })
        .select('*')
        .single<BookingRow>(),
      'Could not create that reservation.',
    );
  },

  async reschedule(
    accessToken: string,
    id: string,
    patch: { resourceId: string; startsAt: string; endsAt: string },
  ): Promise<BookingRow> {
    return unwrap(
      await userClient(accessToken)
        .from('bookings')
        .update({ resource_id: patch.resourceId, starts_at: patch.startsAt, ends_at: patch.endsAt })
        .eq('id', id)
        .select('*')
        .single<BookingRow>(),
      'Could not move that reservation.',
    );
  },

  /** Soft cancel — the row survives for the audit trail; the slot frees immediately. */
  async cancel(accessToken: string, id: string): Promise<BookingRow> {
    return unwrap(
      await userClient(accessToken)
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select('*')
        .single<BookingRow>(),
      'Could not cancel that reservation.',
    );
  },
};

export interface CreateSessionInput {
  profileId: string;
  resourceId: string | null;
  expiresAt: string;
}

export const sessionRepository = {
  /**
   * The caller's live session, through `live_session_view` rather than the bare
   * table: the countdown card needs the name of the thing being held, and
   * returning the row alone is why it said "Phone Booth B" for every session.
   */
  async liveForProfile(accessToken: string, profileId: string): Promise<LiveSessionRow | null> {
    return unwrapMaybe(
      await userClient(accessToken)
        .from('live_session_view')
        .select('*')
        .eq('profile_id', profileId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle<LiveSessionRow>(),
      'Could not load your session.',
    );
  },

  /**
   * Check in. No pre-check for an existing session: the partial unique index on
   * `(profile_id) where ended_at is null` decides, and a check-then-insert would
   * lose the race between two taps on a flaky connection.
   */
  async create(accessToken: string, input: CreateSessionInput): Promise<LiveSessionRow> {
    const inserted = unwrap(
      await userClient(accessToken)
        .from('sessions')
        .insert({
          profile_id: input.profileId,
          resource_id: input.resourceId,
          expires_at: input.expiresAt,
        })
        .select('id')
        .single<{ id: string }>(),
      'Could not check you in.',
    );

    return unwrap(
      await userClient(accessToken)
        .from('live_session_view')
        .select('*')
        .eq('id', inserted.id)
        .single<LiveSessionRow>(),
      'Could not read your session back.',
    );
  },

  async extend(accessToken: string, id: string, expiresAt: string): Promise<SessionRow> {
    return unwrap(
      await userClient(accessToken)
        .from('sessions')
        .update({ expires_at: expiresAt })
        .eq('id', id)
        .select('*')
        .single<SessionRow>(),
      'Could not extend your session.',
    );
  },

  async end(accessToken: string, id: string): Promise<SessionRow> {
    return unwrap(
      await userClient(accessToken)
        .from('sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single<SessionRow>(),
      'Could not end your session.',
    );
  },
};
