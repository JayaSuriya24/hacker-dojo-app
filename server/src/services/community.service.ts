import { profileRepository, type DirectoryQuery } from '../repositories/profile.repository.js';
import { contentRepository } from '../repositories/content.repository.js';
import { storageRepository } from '../repositories/storage.repository.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { MemberDirectoryRow } from '../types/database.js';

/**
 * The Home dial. Exported because check-in and check-out return one of these
 * alongside the session, so the app can put the new number on screen without a
 * second request — see `bookingService.checkIn`.
 */
export interface OccupancyView {
  total: number;
  capacity: number;
  percent: number;
  zones: Array<{ name: string; headCount: number; capacity: number }>;
}

export interface MemberCardView {
  id: string;
  name: string;
  initials: string;
  /** The storage path, kept for callers that need to address the object. */
  avatarPath: string | null;
  /**
   * The resolved public URL, or null when there is no avatar.
   *
   * The client used to be handed `avatarPath` under the name `imageUrl` and
   * pass it straight to `expo-image`, which failed silently — and because the
   * value was truthy, the initials fallback never rendered either. Resolving it
   * here means the app never constructs a storage URL itself.
   */
  avatarUrl: string | null;
  company: string | null;
  bio: string | null;
  currentProject: string | null;
  skills: string[];
  memberSince: string | null;
  zoneName: string | null;
  isHere: boolean;
  /** "Rust · Systems · Ferrite" — the mono line under each directory card. */
  skillLine: string;
}

function toMemberCard(row: MemberDirectoryRow): MemberCardView {
  return {
    id: row.id,
    name: row.full_name,
    initials: row.initials,
    avatarPath: row.avatar_path,
    avatarUrl: storageRepository.publicAvatarUrl(row.avatar_path),
    company: row.company,
    bio: row.bio,
    currentProject: row.current_project,
    skills: row.skills,
    memberSince: row.member_since,
    zoneName: row.zone_name,
    isHere: row.is_here,
    skillLine: [...row.skills, row.company].filter(Boolean).join(' · '),
  };
}

export const communityService = {
  async directory(user: AuthenticatedUser, query: DirectoryQuery): Promise<MemberCardView[]> {
    const rows = await profileRepository.directory(user.accessToken, query);

    return rows.map(toMemberCard);
  },

  async member(user: AuthenticatedUser, id: string): Promise<MemberCardView> {
    const row = await profileRepository.directoryEntry(user.accessToken, id);

    return toMemberCard(row);
  },

  /**
   * Startups founded at the Dojo.
   *
   * Mapped rather than returned raw: this was the last endpoint handing the
   * client a database row, so `founded_year` was the one snake_case field in an
   * otherwise camelCase domain type.
   */
  /**
   * Live occupancy for the Home dial.
   *
   * The per-zone breakdown and the total come from the same query so the ring
   * and the caption can never disagree — a real risk if the client summed the
   * zones itself while the server reported a separately-sampled total.
   */
  async occupancy(): Promise<OccupancyView> {
    const rows = await contentRepository.occupancy();

    const total = rows.reduce((sum, row) => sum + row.head_count, 0);
    const capacity = rows.reduce((sum, row) => sum + row.capacity, 0) || 100;

    return {
      total,
      capacity,
      percent: Math.min(100, Math.round((total / capacity) * 100)),
      zones: rows.map((row) => ({
        name: row.zone_name,
        headCount: row.head_count,
        capacity: row.capacity,
      })),
    };
  },
};
