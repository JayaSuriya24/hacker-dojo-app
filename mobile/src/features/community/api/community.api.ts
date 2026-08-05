import { api } from '~/services/api/client';
import type { AboutContent, MemberCard, Occupancy, Program, Startup } from '~/types/domain';

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

  startups: () => api.get<Startup[]>('/startups', { anonymous: true }),

  occupancy: () => api.get<Occupancy>('/occupancy', { anonymous: true }),

  programs: () => api.get<Program[]>('/programs', { anonymous: true }),

  about: () => api.get<AboutContent>('/about', { anonymous: true }),

  bookTour: (input: { scheduledFor: string; guestName?: string; guestEmail?: string }) =>
    api.post<{ id: string; scheduledFor: string; status: string }>('/tours', input),
};
