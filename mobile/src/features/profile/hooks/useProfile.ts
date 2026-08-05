import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profileApi } from '../api/profile.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import { useAuth } from '~/providers/AuthProvider';
import type { Me, NotificationPreferences } from '~/types/domain';

/**
 * The signed-in member.
 *
 * `isActiveMember` from this query is the single gate every member-only surface
 * reads. It comes from the server — the client never decides its own membership
 * status, and the API enforces the same rule independently on every write.
 */
export function useMe() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.me.profile(),
    queryFn: profileApi.me,
    enabled: isAuthenticated,
    staleTime: QUERY_STALE_TIME.standard,
  });
}

/** Convenience for the many places that only need the gate. */
export function useIsActiveMember(): boolean {
  const { data } = useMe();
  return data?.isActiveMember ?? false;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: profileApi.update,
    // The server returns the full updated profile, so seed the cache with it
    // rather than invalidating and paying for a second round trip.
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.me.profile(), updated);
      // The member's own card in the directory is now stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.community.all() });
    },
  });
}

export function useNotificationPreferences() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.me.notifications(),
    queryFn: profileApi.notifications,
    enabled: isAuthenticated,
    staleTime: QUERY_STALE_TIME.static,
  });
}

/**
 * Toggling a notification switch is optimistic: the switch moves instantly and
 * rolls back if the write fails. Waiting ~200ms for a round trip before a
 * toggle animates makes the control feel broken.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: profileApi.updateNotifications,

    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me.notifications() });
      const previous = queryClient.getQueryData<NotificationPreferences>(
        queryKeys.me.notifications(),
      );

      if (previous) {
        queryClient.setQueryData<NotificationPreferences>(queryKeys.me.notifications(), {
          ...previous,
          ...(patch.events !== undefined ? { events: patch.events } : {}),
          ...(patch.bookings !== undefined ? { bookings: patch.bookings } : {}),
          ...(patch.weeklyDigest !== undefined ? { weeklyDigest: patch.weeklyDigest } : {}),
        });
      }

      return { previous };
    },

    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.me.notifications(), context.previous);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.notifications() });
    },
  });
}

export function usePlans() {
  return useQuery({
    queryKey: queryKeys.dojo.plans(),
    queryFn: profileApi.plans,
    staleTime: QUERY_STALE_TIME.static,
  });
}

export type { Me };
