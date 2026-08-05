import { api } from '~/services/api/client';
import type { DojoEvent, EventCategory, RsvpStatus } from '~/types/domain';

export interface EventFilters {
  category?: EventCategory | undefined;
  today?: boolean | undefined;
  limit?: number;
  offset?: number;
}

export interface RsvpResult {
  status: RsvpStatus;
  checkinCode: string;
  message: string;
}

export const eventsApi = {
  list: (filters: EventFilters = {}) =>
    api.get<DojoEvent[]>('/events', {
      query: {
        category: filters.category,
        today: filters.today ? 'true' : undefined,
        limit: filters.limit ?? 25,
        offset: filters.offset ?? 0,
      },
    }),

  detail: (id: string) => api.get<DojoEvent>(`/events/${id}`),

  rsvp: (id: string) => api.post<RsvpResult>(`/events/${id}/rsvp`),

  cancelRsvp: (id: string) => api.delete<void>(`/events/${id}/rsvp`),

  requestToHost: (input: {
    title: string;
    category: EventCategory;
    expectedSize: number;
    preferredDate: string;
    preferredRoom: string;
    notes?: string;
  }) => api.post<{ reference: string }>('/event-requests', input),
};
