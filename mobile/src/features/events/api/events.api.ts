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

  /**
   * Ask to host. The schedule travels with the request, because approving it is
   * what creates the event — a steward should not have to ask the host when
   * they meant, or whether it repeats.
   */
  requestToHost: (input: {
    title: string;
    category: EventCategory;
    /**
     * Optional — the form stopped asking. Capacity comes from the room's own
     * seat count at approval, so a host no longer has to predict attendance
     * before they have advertised anything.
     */
    expectedSize?: number;
    preferredDate: string;
    preferredRoom: string;
    notes?: string;
    /** 24-hour wall clock at the Dojo, e.g. "18:30". */
    preferredTime: string;
    durationMinutes: number;
    repeatMode: 'once' | 'weekly';
    /** `dow`: 0 = Sunday … 6 = Saturday. Empty unless weekly. */
    repeatWeekdays: number[];
    repeatUntil?: string;
  }) => api.post<{ reference: string }>('/event-requests', input),
};
