import { staffRepository } from '../repositories/staff.repository.js';
import { formatDojoRange } from '../utils/time.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { ApplicationStatus, TourStatus } from '../types/database.js';

export interface QueueItemView {
  kind: 'tour' | 'event_request' | 'program_application' | 'document';
  id: string;
  requesterName: string;
  requesterEmail: string | null;
  status: string;
  summary: string;
  detail: string | null;
  createdAt: string;
}

export interface DashboardView {
  pendingTours: number;
  pendingEventRequests: number;
  pendingApplications: number;
  pendingDocuments: number;
  activeMembers: number;
  onFloor: number;
  /** Sum of the four pending counts — the badge on the admin tab. */
  totalPending: number;
}

export interface CertificationView {
  id: string;
  profileId: string;
  resourceId: string;
  grantedAt: string;
  expiresAt: string | null;
}

/**
 * The steward's surface.
 *
 * Members were already creating tours, event requests, program applications and
 * verification documents, and none of them could be actioned: the rows were
 * readable only by their author, and there was no screen. This service is the
 * other half of those flows.
 *
 * Authorisation is doubled deliberately. `requireRole('steward', 'admin')` gates
 * the routes, and every query below runs as the caller so `is_staff()` in the
 * RLS policies has to agree. Either one alone would be enough on a good day;
 * both mean a routing mistake is not a data breach.
 */
export const staffService = {
  async dashboard(user: AuthenticatedUser): Promise<DashboardView> {
    const counts = await staffRepository.dashboard(user.accessToken);

    return {
      ...counts,
      totalPending:
        counts.pendingTours +
        counts.pendingEventRequests +
        counts.pendingApplications +
        counts.pendingDocuments,
    };
  },

  async queue(
    user: AuthenticatedUser,
    input: { status?: string | undefined; kind?: string | undefined; limit: number },
  ): Promise<QueueItemView[]> {
    const rows = await staffRepository.queue(user.accessToken, input);

    return rows.map((row) => ({
      kind: row.kind,
      id: row.id,
      requesterName: row.requester_name,
      requesterEmail: row.requester_email,
      status: row.status,
      summary: row.summary,
      // A tour's detail is an instant; rendering it in the Dojo's zone here
      // means a steward in another timezone still reads the local appointment.
      detail:
        row.kind === 'tour' && row.detail ? formatDojoRange(row.detail, row.detail) : row.detail,
      createdAt: row.created_at,
    }));
  },

  async setTourStatus(user: AuthenticatedUser, id: string, status: TourStatus) {
    const row = await staffRepository.setTourStatus(user.accessToken, id, status);
    return { id: row.id, status: row.status };
  },

  async setEventRequestStatus(user: AuthenticatedUser, id: string, status: ApplicationStatus) {
    const row = await staffRepository.setEventRequestStatus(user.accessToken, id, status);
    return { id: row.id, reference: row.reference, title: row.title, status: row.status };
  },

  async setApplicationStatus(user: AuthenticatedUser, id: string, status: ApplicationStatus) {
    const row = await staffRepository.setApplicationStatus(user.accessToken, id, status);
    return { id: row.id, status: row.status };
  },

  /**
   * Grant a certification.
   *
   * This is the one staff action with a safety consequence: `validate_booking`
   * refuses a booking for a `requires_cert` resource unless a live row exists,
   * so this is what lets someone book the laser cutter.
   */
  async grantCertification(
    user: AuthenticatedUser,
    input: { profileId: string; resourceId: string; expiresAt?: string | undefined },
  ): Promise<CertificationView> {
    const row = await staffRepository.grantCertification(user.accessToken, {
      profileId: input.profileId,
      resourceId: input.resourceId,
      expiresAt: input.expiresAt ?? null,
      grantedBy: user.id,
    });

    return {
      id: row.id,
      profileId: row.profile_id,
      resourceId: row.resource_id,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at,
    };
  },

  async revokeCertification(user: AuthenticatedUser, id: string): Promise<void> {
    await staffRepository.revokeCertification(user.accessToken, id);
  },

  async listCertifications(
    user: AuthenticatedUser,
    profileId: string,
  ): Promise<CertificationView[]> {
    const rows = await staffRepository.listCertifications(user.accessToken, profileId);

    return rows.map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      resourceId: row.resource_id,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at,
    }));
  },
};
