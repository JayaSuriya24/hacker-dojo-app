import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList } from '../utils/postgrest.js';
import type {
  BoardMemberRow,
  FaqRow,
  OccupancyRow,
  PressMentionRow,
  ProgramRow,
  ProgramTrackRow,
  TestimonialRow,
  TourRow,
} from '../types/database.js';

export interface ProgramWithTracks extends ProgramRow {
  tracks: ProgramTrackRow[];
}

/**
 * Read-mostly marketing and community content. All of it is world-readable by
 * policy, so the service-role client is used purely to skip a redundant JWT
 * round trip — it grants no visibility a signed-out client wouldn't have.
 */
export const contentRepository = {
  async programs(): Promise<ProgramWithTracks[]> {
    const rows = unwrapList(
      await adminClient
        .from('programs')
        .select('*, program_tracks(*)')
        .eq('active', true)
        .order('sort_order')
        .returns<Array<ProgramRow & { program_tracks: ProgramTrackRow[] }>>(),
      'Could not load programs.',
    );

    return rows.map(({ program_tracks, ...program }) => ({
      ...program,
      tracks: [...program_tracks].sort((a, b) => a.sort_order - b.sort_order),
    }));
  },

  async testimonials(): Promise<TestimonialRow[]> {
    return unwrapList(
      await adminClient
        .from('testimonials')
        .select('*')
        .order('sort_order')
        .returns<TestimonialRow[]>(),
      'Could not load testimonials.',
    );
  },

  async press(): Promise<PressMentionRow[]> {
    return unwrapList(
      await adminClient
        .from('press_mentions')
        .select('*')
        .order('sort_order')
        .returns<PressMentionRow[]>(),
      'Could not load press mentions.',
    );
  },

  async board(): Promise<BoardMemberRow[]> {
    return unwrapList(
      await adminClient
        .from('board_members')
        .select('*')
        .order('sort_order')
        .returns<BoardMemberRow[]>(),
      'Could not load the board.',
    );
  },

  async faqs(): Promise<FaqRow[]> {
    return unwrapList(
      await adminClient.from('faqs').select('*').order('sort_order').returns<FaqRow[]>(),
      'Could not load the FAQ.',
    );
  },

  async occupancy(): Promise<OccupancyRow[]> {
    return unwrapList(
      await adminClient.from('current_occupancy').select('*').returns<OccupancyRow[]>(),
      'Could not load live occupancy.',
    );
  },

  /**
   * Whether this profile has a tour to its name that still counts.
   *
   * A cancelled tour deliberately does not count: someone who booked and then
   * called it off has not seen the space, and hiding the invitation from them
   * would strand them with no way back to it.
   *
   * Read through the caller's own token, so `tours_select_self` is what decides
   * the answer rather than a `profile_id` filter we have to remember to write.
   */
  async hasTour(accessToken: string, profileId: string): Promise<boolean> {
    const rows = unwrapList(
      await userClient(accessToken)
        .from('tours')
        .select('id')
        .eq('profile_id', profileId)
        .neq('status', 'cancelled')
        .limit(1)
        .returns<Array<Pick<TourRow, 'id'>>>(),
      'Could not check your tour history.',
    );

    return rows.length > 0;
  },

  /**
   * Tours accept anonymous bookings — a prospective member has no account yet,
   * and requiring one before they can visit is exactly backwards.
   */
  async createTour(
    accessToken: string | null,
    input: {
      profileId?: string | undefined;
      guestName?: string | undefined;
      guestEmail?: string | undefined;
      scheduledFor: string;
    },
  ): Promise<TourRow> {
    const client = accessToken ? userClient(accessToken) : adminClient;

    return unwrap(
      await client
        .from('tours')
        .insert({
          profile_id: input.profileId ?? null,
          guest_name: input.guestName ?? null,
          guest_email: input.guestEmail ?? null,
          scheduled_for: input.scheduledFor,
        })
        .select('*')
        .single<TourRow>(),
      'Could not book that tour.',
    );
  },
};
