import { profileRepository, type DirectoryQuery } from '../repositories/profile.repository.js';
import { contentRepository } from '../repositories/content.repository.js';
import type { AuthenticatedUser } from '../types/http.js';

export interface MemberCardView {
  id: string;
  name: string;
  initials: string;
  avatarPath: string | null;
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

export const communityService = {
  async directory(user: AuthenticatedUser, query: DirectoryQuery): Promise<MemberCardView[]> {
    const rows = await profileRepository.directory(user.accessToken, query);

    return rows.map((row) => ({
      id: row.id,
      name: row.full_name,
      initials: row.initials,
      avatarPath: row.avatar_path,
      company: row.company,
      bio: row.bio,
      currentProject: row.current_project,
      skills: row.skills,
      memberSince: row.member_since,
      zoneName: row.zone_name,
      isHere: row.is_here,
      skillLine: [...row.skills, row.company].filter(Boolean).join(' · '),
    }));
  },

  async member(user: AuthenticatedUser, id: string): Promise<MemberCardView> {
    const row = await profileRepository.directoryEntry(user.accessToken, id);

    return {
      id: row.id,
      name: row.full_name,
      initials: row.initials,
      avatarPath: row.avatar_path,
      company: row.company,
      bio: row.bio,
      currentProject: row.current_project,
      skills: row.skills,
      memberSince: row.member_since,
      zoneName: row.zone_name,
      isHere: row.is_here,
      skillLine: [...row.skills, row.company].filter(Boolean).join(' · '),
    };
  },

  async startups() {
    return contentRepository.startups();
  },

  /**
   * Live occupancy for the Home dial.
   *
   * The per-zone breakdown and the total come from the same query so the ring
   * and the caption can never disagree — a real risk if the client summed the
   * zones itself while the server reported a separately-sampled total.
   */
  async occupancy(): Promise<{
    total: number;
    capacity: number;
    percent: number;
    zones: Array<{ name: string; headCount: number; capacity: number }>;
  }> {
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
