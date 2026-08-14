import { api } from '~/services/api/client';
import type {
  AboutContent,
  MemberCard,
  Occupancy,
  Program,
  SiteSettings,
  Startup,
  StartupInput,
} from '~/types/domain';

export interface DirectoryFilters {
  search?: string | undefined;
  skills?: string[] | undefined;
  here?: boolean | undefined;
  limit?: number;
  offset?: number;
}

export const communityApi = {
  directory: (filters: DirectoryFilters = {}) =>
    api.get<MemberCard[]>('/members', {
      query: {
        search: filters.search || undefined,
        skills: filters.skills?.length ? filters.skills : undefined,
        here: filters.here ? 'true' : undefined,
        limit: filters.limit ?? 30,
        offset: filters.offset ?? 0,
      },
    }),

  member: (id: string) => api.get<MemberCard>(`/members/${id}`),

  /**
   * The public list. Search and filter are query parameters on the same
   * endpoint, so an unfiltered call is exactly the request this always made.
   */
  startups: (query?: { search?: string; stage?: string; hiring?: string }) =>
    api.get<Startup[]>('/startups', { query, anonymous: true }),

  /** Takes a uuid or a slug. Public, like the list. */
  startup: (key: string) => api.get<Startup>(`/startups/${key}`, { anonymous: true }),

  createStartup: (input: StartupInput) => api.post<Startup>('/startups', input, { retry: false }),

  updateStartup: (id: string, patch: Partial<StartupInput>) =>
    api.patch<Startup>(`/startups/${id}`, patch),

  deleteStartup: (id: string) => api.delete<void>(`/startups/${id}`, { retry: false }),

  reorderStartups: (orderedIds: string[]) =>
    api.patch<Startup[]>('/startups/reorder', { orderedIds }),

  occupancy: () => api.get<Occupancy>('/occupancy', { anonymous: true }),

  programs: () => api.get<Program[]>('/programs', { anonymous: true }),

  about: () => api.get<AboutContent>('/about', { anonymous: true }),

  /**
   * Wi-Fi and lab status.
   *
   * NOT anonymous: the Wi-Fi password is a members-only row, and sending the
   * bearer token is what lets RLS decide whether it comes back. A guest gets
   * the same shape with nulls, which is what the card gates on.
   */
  settings: () => api.get<SiteSettings>('/settings'),

  bookTour: (input: { scheduledFor: string; guestName?: string; guestEmail?: string }) =>
    api.post<{ id: string; scheduledFor: string; status: string }>('/tours', input),
};
