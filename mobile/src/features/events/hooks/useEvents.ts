import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsApi, type EventFilters } from '../api/events.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import type { DojoEvent } from '~/types/domain';

export function useEvents(filters: EventFilters = {}) {
  return useQuery({
    queryKey: queryKeys.events.list({
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.today ? { today: filters.today } : {}),
    }),
    queryFn: () => eventsApi.list(filters),
    staleTime: QUERY_STALE_TIME.standard,
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: queryKeys.events.detail(id),
    queryFn: () => eventsApi.detail(id),
    enabled: Boolean(id),
    staleTime: QUERY_STALE_TIME.standard,
  });
}

/**
 * RSVP, optimistically.
 *
 * The card flips to "Going" and the head count ticks up on tap. Two details
 * make this honest rather than a lie that usually happens to be true:
 *
 * 1. Every cached list is patched, not just the one on screen — otherwise the
 *    Home rail and the Events tab disagree until a refetch.
 * 2. The server is the authority on the outcome. If capacity ran out between
 *    render and request the database downgrades the RSVP to `waitlisted`, and
 *    `onSuccess` writes back what actually happened rather than leaving the
 *    optimistic "Going" in place.
 */
export function useRsvp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => eventsApi.rsvp(eventId),

    onMutate: async (eventId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all() });

      const snapshot = queryClient.getQueriesData<DojoEvent[]>({
        queryKey: queryKeys.events.lists(),
      });

      const patch = (event: DojoEvent): DojoEvent =>
        event.id === eventId && event.rsvpStatus !== 'going'
          ? {
              ...event,
              rsvpStatus: 'going',
              goingCount: event.goingCount + 1,
              fillPercent: Math.min(
                100,
                Math.round(((event.goingCount + 1) / Math.max(1, event.capacity)) * 100),
              ),
            }
          : event;

      queryClient.setQueriesData<DojoEvent[]>({ queryKey: queryKeys.events.lists() }, (events) =>
        events?.map(patch),
      );
      queryClient.setQueryData<DojoEvent>(queryKeys.events.detail(eventId), (event) =>
        event ? patch(event) : event,
      );

      return { snapshot };
    },

    onError: (_error, _eventId, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },

    onSuccess: (result, eventId) => {
      // Reconcile with what the database decided — `going` may have become
      // `waitlisted` inside the capacity trigger.
      const reconcile = (event: DojoEvent | undefined) =>
        event && event.id === eventId
          ? { ...event, rsvpStatus: result.status, checkinCode: result.checkinCode }
          : event;

      queryClient.setQueriesData<DojoEvent[]>({ queryKey: queryKeys.events.lists() }, (events) =>
        events?.map((event) => reconcile(event) ?? event),
      );
      queryClient.setQueryData<DojoEvent>(queryKeys.events.detail(eventId), reconcile);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}

export function useCancelRsvp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => eventsApi.cancelRsvp(eventId),

    onMutate: async (eventId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all() });

      const snapshot = queryClient.getQueriesData<DojoEvent[]>({
        queryKey: queryKeys.events.lists(),
      });

      /**
       * Leaving decrements whichever list the member was actually on.
       * Treating every cancellation as a `going` cancellation left the
       * waitlist count untouched when someone gave up a waitlisted place, so
       * the card kept counting them until the next refetch.
       */
      const patch = (event: DojoEvent): DojoEvent => {
        if (event.id !== eventId || !event.rsvpStatus) return event;

        const going = event.rsvpStatus === 'going';
        return {
          ...event,
          rsvpStatus: null,
          checkinCode: null,
          goingCount: going ? Math.max(0, event.goingCount - 1) : event.goingCount,
          waitlistCount: going ? event.waitlistCount : Math.max(0, event.waitlistCount - 1),
          fillPercent: going
            ? Math.min(
                100,
                Math.round((Math.max(0, event.goingCount - 1) / Math.max(1, event.capacity)) * 100),
              )
            : event.fillPercent,
        };
      };

      queryClient.setQueriesData<DojoEvent[]>({ queryKey: queryKeys.events.lists() }, (events) =>
        events?.map(patch),
      );
      // The detail sheet is where most cancellations happen, and it was the one
      // cache the optimistic update skipped — so the sheet you tapped in was
      // the last thing to catch up. `useRsvp` patches both; this now matches.
      queryClient.setQueryData<DojoEvent>(queryKeys.events.detail(eventId), (event) =>
        event ? patch(event) : event,
      );

      return { snapshot };
    },

    onError: (_error, _eventId, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}

export function useRequestToHost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: eventsApi.requestToHost,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}
