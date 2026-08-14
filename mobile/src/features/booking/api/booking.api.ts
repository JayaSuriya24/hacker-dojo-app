import { api } from '~/services/api/client';
import type {
  Booking,
  LiveSession,
  PresenceChange,
  Resource,
  ResourceKind,
  RoomReservation,
  Slot,
} from '~/types/domain';

export const bookingApi = {
  resources: (kind?: ResourceKind) =>
    api.get<Resource[]>('/resources', { query: { kind }, anonymous: true }),

  /** @param day YYYY-MM-DD */
  availability: (resourceId: string, day: string) =>
    api.get<Slot[]>(`/resources/${resourceId}/availability`, { query: { day } }),

  /** Today's reservations for everyone. Anonymous, and readable signed out. */
  schedule: (kind: ResourceKind) =>
    api.get<RoomReservation[]>('/resources/schedule', { query: { kind }, anonymous: true }),

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
  /**
   * Check in to the floor — what populates `sessions` and the occupancy dial.
   * Answers with the new occupancy as well as the session; `/occupancy` is
   * cached for 15s, so re-fetching it here would read the pre-check-in number.
   */
  checkIn: (input: { resourceId?: string } = {}) => api.post<PresenceChange>('/me/session', input),
  extendSession: () => api.post<LiveSession>('/me/session/extend'),
  endSession: () => api.post<PresenceChange>('/me/session/end'),
};
