import { api } from '~/services/api/client';
import type { Booking, LiveSession, Resource, ResourceKind, Slot } from '~/types/domain';

export const bookingApi = {
  resources: (kind?: ResourceKind) =>
    api.get<Resource[]>('/resources', { query: { kind }, anonymous: true }),

  /** @param day YYYY-MM-DD */
  availability: (resourceId: string, day: string) =>
    api.get<Slot[]>(`/resources/${resourceId}/availability`, { query: { day } }),

  myBookings: () => api.get<Booking[]>('/me/bookings'),

  create: (input: {
    resourceId: string;
    startsAt: string;
    durationHours: number;
    notes?: string;
  }) => api.post<Booking>('/bookings', input),

  reschedule: (
    id: string,
    input: { resourceId: string; startsAt: string; durationHours: number },
  ) => api.patch<Booking>(`/bookings/${id}`, input),

  cancel: (id: string) => api.delete<void>(`/bookings/${id}`),

  liveSession: () => api.get<LiveSession | null>('/me/session'),
  /** Check in to the floor — what populates `sessions` and the occupancy dial. */
  checkIn: (input: { resourceId?: string } = {}) => api.post<LiveSession>('/me/session', input),
  extendSession: () => api.post<LiveSession>('/me/session/extend'),
  endSession: () => api.post<LiveSession>('/me/session/end'),
};
