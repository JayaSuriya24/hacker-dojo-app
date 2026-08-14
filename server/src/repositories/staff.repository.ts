import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList } from '../utils/postgrest.js';
import type {
  ApplicationStatus,
  CertificationRow,
  EventRequestRow,
  OccupancyRow,
  StaffQueueRow,
  TourStatus,
} from '../types/database.js';

/**
 * The steward's surface.
 *
 * Everything here runs as the caller, not the service role — `is_staff()` in
 * the RLS policies is the gate, and the `requireRole` middleware in front of
 * these routes is the second one. Two independent checks, because "the admin
 * screen is only linked from the admin tab" is not an access control.
 */
export const staffRepository = {
  /**
   * Everything awaiting a decision, in one query.
   *
   * `staff_queue` unions tours, event requests, program applications and
   * documents into one shape so the triage list is one round trip and one sort,
   * rather than four requests interleaved on the device.
   */
  async queue(
    accessToken: string,
    input: { status?: string | undefined; kind?: string | undefined; limit: number },
  ): Promise<StaffQueueRow[]> {
    let request = userClient(accessToken)
      .from('staff_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(input.limit);

    if (input.status) request = request.eq('status', input.status);
    if (input.kind) request = request.eq('kind', input.kind);

    return unwrapList(await request.returns<StaffQueueRow[]>(), 'Could not load the queue.');
  },

  async setTourStatus(
    accessToken: string,
    id: string,
    status: TourStatus,
  ): Promise<{ id: string; status: TourStatus }> {
    return unwrap(
      await userClient(accessToken)
        .from('tours')
        .update({ status })
        .eq('id', id)
        .select('id, status')
        .single<{ id: string; status: TourStatus }>(),
      'Could not update that tour.',
    );
  },

  async setEventRequestStatus(
    accessToken: string,
    id: string,
    status: ApplicationStatus,
  ): Promise<EventRequestRow> {
    return unwrap(
      await userClient(accessToken)
        .from('event_requests')
        .update({ status })
        .eq('id', id)
        .select('*')
        .single<EventRequestRow>(),
      'Could not update that request.',
    );
  },

  async setApplicationStatus(
    accessToken: string,
    id: string,
    status: ApplicationStatus,
  ): Promise<{ id: string; status: ApplicationStatus }> {
    return unwrap(
      await userClient(accessToken)
        .from('program_applications')
        .update({ status })
        .eq('id', id)
        .select('id, status')
        .single<{ id: string; status: ApplicationStatus }>(),
      'Could not update that application.',
    );
  },

  /**
   * Grant a certification.
   *
   * This is what unlocks the laser cutter: `validate_booking` refuses a booking
   * for a resource with `requires_cert` unless a live row exists here. Upserted
   * so re-certifying someone extends rather than duplicates.
   */
  async grantCertification(
    accessToken: string,
    input: {
      profileId: string;
      resourceId: string;
      expiresAt: string | null;
      grantedBy: string;
    },
  ): Promise<CertificationRow> {
    return unwrap(
      await userClient(accessToken)
        .from('certifications')
        .upsert(
          {
            profile_id: input.profileId,
            resource_id: input.resourceId,
            expires_at: input.expiresAt,
            granted_by: input.grantedBy,
            granted_at: new Date().toISOString(),
          },
          { onConflict: 'profile_id,resource_id' },
        )
        .select('*')
        .single<CertificationRow>(),
      'Could not record that certification.',
    );
  },

  async revokeCertification(accessToken: string, id: string): Promise<void> {
    const { error } = await userClient(accessToken).from('certifications').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async listCertifications(accessToken: string, profileId: string): Promise<CertificationRow[]> {
    return unwrapList(
      await userClient(accessToken)
        .from('certifications')
        .select('*')
        .eq('profile_id', profileId)
        .returns<CertificationRow[]>(),
      'Could not load certifications.',
    );
  },

  /**
   * Headline counts for the admin dashboard.
   *
   * `head: true` with an exact count means Postgres returns the number and no
   * rows — six counts cost six cheap queries rather than six page fetches the
   * dashboard would immediately throw away.
   */
  async dashboard(accessToken: string): Promise<{
    pendingTours: number;
    pendingEventRequests: number;
    pendingApplications: number;
    pendingDocuments: number;
    activeMembers: number;
    onFloor: number;
  }> {
    const client = userClient(accessToken);
    const now = new Date().toISOString();

    const [tours, requests, applications, documents, members, floor] = await Promise.all([
      client.from('tours').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
      client
        .from('event_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted'),
      client
        .from('program_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted'),
      client
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted'),
      client
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'trialing']),
      client
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .is('ended_at', null)
        .gt('expires_at', now),
    ]);

    for (const result of [tours, requests, applications, documents, members, floor]) {
      if (result.error) throw new Error(result.error.message);
    }

    return {
      pendingTours: tours.count ?? 0,
      pendingEventRequests: requests.count ?? 0,
      pendingApplications: applications.count ?? 0,
      pendingDocuments: documents.count ?? 0,
      activeMembers: members.count ?? 0,
      onFloor: floor.count ?? 0,
    };
  },
};

/**
 * Occupancy sampling.
 *
 * Service role by design: the sampler is a background job with no caller, and
 * `occupancy_samples` has no insert policy precisely so that no client can
 * inflate the dial.
 */
export const occupancyRepository = {
  async sample(): Promise<number> {
    const { data, error } = await adminClient.rpc('sample_occupancy');
    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : 0;
  },

  async prune(): Promise<number> {
    const { data, error } = await adminClient.rpc('prune_occupancy_samples');
    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : 0;
  },

  async current(): Promise<OccupancyRow[]> {
    return unwrapList(
      await adminClient.from('current_occupancy').select('*').returns<OccupancyRow[]>(),
      'Could not load live occupancy.',
    );
  },

  /**
   * Close every session that ran past its expiry without a checkout.
   *
   * The floor empties by people leaving, not by people pressing a button, so
   * most sessions end by timing out. Nothing wrote `ended_at` in that case,
   * which left rows that no read counted as live but that the partial unique
   * index still treated as live — see `sessionRepository.endExpiredFor`, which
   * digs out the caller's own row on demand. This is the same repair applied to
   * everyone on a timer, so a member is not relying on the check-in path to
   * clean up after them and the table matches what the dial says.
   *
   * Each row is stamped with its own expiry rather than with now: they are
   * closed as a batch, but they did not all end at the same moment.
   */
  async endExpiredSessions(): Promise<number> {
    const stale = unwrapList(
      await adminClient
        .from('sessions')
        .select('id, expires_at')
        .is('ended_at', null)
        .lt('expires_at', new Date().toISOString())
        .returns<Array<{ id: string; expires_at: string }>>(),
      'Could not list expired sessions.',
    );

    for (const row of stale) {
      const { error } = await adminClient
        .from('sessions')
        .update({ ended_at: row.expires_at })
        .eq('id', row.id);
      if (error) throw new Error(error.message);
    }

    return stale.length;
  },
};
