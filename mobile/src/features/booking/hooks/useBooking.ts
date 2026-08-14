import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { bookingApi } from '../api/booking.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import { useAuth } from '~/providers/AuthProvider';
import type { Occupancy, ResourceKind } from '~/types/domain';

export function useResources(kind?: ResourceKind) {
  return useQuery({
    queryKey: queryKeys.resources.list(kind),
    queryFn: () => bookingApi.resources(kind),
    staleTime: QUERY_STALE_TIME.standard,
  });
}

/**
 * Today's reservations, as everyone sees them.
 *
 * Kept at the realtime tier rather than `standard`: this is the difference
 * between "walk over to the Event Hall" and "it is taken until noon", and a
 * two-minute-old answer is long enough to send someone across the building for
 * nothing. It carries no member — the API does not send one.
 */
export function useRoomSchedule(kind: ResourceKind = 'room') {
  return useQuery({
    queryKey: queryKeys.resources.schedule(kind),
    queryFn: () => bookingApi.schedule(kind),
    staleTime: QUERY_STALE_TIME.realtime,
  });
}

/**
 * Slot availability for one resource on one day.
 *
 * Short stale time and a refetch on focus: a slot that was free when the sheet
 * opened may not be by the time someone finishes reading the safety checklist,
 * and showing it as available until they tap is a worse experience than a
 * quiet refresh.
 */
export function useAvailability(resourceId: string | null, day: string) {
  return useQuery({
    queryKey: queryKeys.resources.availability(resourceId ?? '', day),
    queryFn: () => bookingApi.availability(resourceId as string, day),
    enabled: Boolean(resourceId),
    staleTime: QUERY_STALE_TIME.realtime,
    refetchOnWindowFocus: true,
  });
}

export function useMyBookings() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.me.bookings(),
    queryFn: bookingApi.myBookings,
    enabled: isAuthenticated,
    staleTime: QUERY_STALE_TIME.standard,
  });
}

/**
 * Create a reservation.
 *
 * Deliberately NOT optimistic. Two members can race for the same slot, and the
 * exclusion constraint in Postgres decides who wins — so showing a confirmed
 * booking before the server has agreed would sometimes show a reservation that
 * does not exist. The sheet shows a spinner instead and reports the real answer.
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bookingApi.create,
    onSuccess: (_booking, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.bookings() });
      // The slot just taken must disappear from the grid behind the sheet.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.resources.availability(variables.resourceId, ''),
        exact: false,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all() });
    },
  });
}

export function useRescheduleBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      resourceId: string;
      startsAt: string;
      durationHours: number;
    }) => bookingApi.reschedule(id, input),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.bookings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all() });
    },
  });
}

/**
 * Cancelling IS optimistic: it frees a slot the member already holds, so the
 * only way it fails is a network error, and the rollback covers that.
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => bookingApi.cancel(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me.bookings() });
      const previous = queryClient.getQueryData(queryKeys.me.bookings());

      queryClient.setQueryData(queryKeys.me.bookings(), (bookings: { id: string }[] | undefined) =>
        bookings?.filter((booking) => booking.id !== id),
      );

      return { previous };
    },

    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.me.bookings(), context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.bookings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all() });
    },
  });
}

/** The live phone-booth session that drives the countdown on Home. */
export function useLiveSession() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.me.session(),
    queryFn: bookingApi.liveSession,
    enabled: isAuthenticated,
    staleTime: QUERY_STALE_TIME.realtime,
  });
}

/**
 * Put the occupancy that rode along with a presence change straight into the
 * cache.
 *
 * Refetching instead would look equivalent and is not: `/occupancy` is served
 * with a 15s `max-age` so the morning stampede hits a cache rather than the
 * database, which means the refetch fired on check-in is answered from the
 * device's HTTP cache with the number from *before* the check-in. The dial then
 * sits wrong until the poll comes round and the button reads as broken. Writing
 * the count the server computed as part of the act is what makes the dial move
 * on the tap that moved it.
 *
 * Falls back to an invalidate when the server could not resample, since a
 * refetch that is merely stale still beats a number that is definitely wrong.
 */
function applyOccupancy(queryClient: QueryClient, occupancy: Occupancy | null) {
  if (occupancy) {
    queryClient.setQueryData(queryKeys.dojo.occupancy(), occupancy);
    return;
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.dojo.occupancy() });
}

/**
 * Check in to the floor.
 *
 * This is the only thing that puts a row in `sessions`, and `sessions` is the
 * only thing the occupancy dial counts — unlocking the door writes an audit row
 * and nothing else, so without this the number can never leave zero.
 */
export function useCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bookingApi.checkIn,
    onSuccess: ({ session, occupancy }) => {
      queryClient.setQueryData(queryKeys.me.session(), session);
      applyOccupancy(queryClient, occupancy);
    },
  });
}

export function useExtendSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bookingApi.extendSession,
    onSuccess: (session) => queryClient.setQueryData(queryKeys.me.session(), session),
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bookingApi.endSession,
    // The session is cleared rather than written back: the response describes
    // the session that just ended, and holding it would leave Home showing a
    // countdown for someone who has left.
    onSuccess: ({ occupancy }) => {
      queryClient.setQueryData(queryKeys.me.session(), null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all() });
      // Same reason as check-in: leaving changes the count too.
      applyOccupancy(queryClient, occupancy);
    },
  });
}
