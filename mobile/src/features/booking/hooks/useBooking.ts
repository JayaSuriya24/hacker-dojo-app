import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingApi } from '../api/booking.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import { useAuth } from '~/providers/AuthProvider';
import type { ResourceKind } from '~/types/domain';

export function useResources(kind?: ResourceKind) {
  return useQuery({
    queryKey: queryKeys.resources.list(kind),
    queryFn: () => bookingApi.resources(kind),
    staleTime: QUERY_STALE_TIME.standard,
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
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.me.session(), null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all() });
    },
  });
}
