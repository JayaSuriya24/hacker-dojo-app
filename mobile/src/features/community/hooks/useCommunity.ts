import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { communityApi, type DirectoryFilters } from '../api/community.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import { useIsActiveMember } from '~/features/profile/hooks/useProfile';
import type { StartupInput } from '~/types/domain';

/**
 * Debounce a value.
 *
 * The directory search field fires a query per keystroke without this. At 300ms
 * a normal typing speed produces one request per word rather than one per
 * letter, which matters because the search hits a trigram index over the whole
 * member table.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * The member directory.
 *
 * Gated on active membership — the API refuses non-members anyway, so running
 * the query for a guest would spend a round trip to earn a 403 and a red error
 * state where the UI should be showing a join prompt instead.
 */
export function useDirectory(filters: DirectoryFilters = {}) {
  const isMember = useIsActiveMember();

  return useQuery({
    queryKey: queryKeys.community.directory({
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.skills?.length ? { skills: filters.skills } : {}),
      ...(filters.here ? { here: filters.here } : {}),
    }),
    queryFn: () => communityApi.directory(filters),
    enabled: isMember,
    staleTime: QUERY_STALE_TIME.standard,
    // Keep the previous page visible while a new filter loads, so the list does
    // not blank out on every chip tap.
    placeholderData: (previous) => previous,
  });
}

export function useMember(id: string) {
  const isMember = useIsActiveMember();

  return useQuery({
    queryKey: queryKeys.community.member(id),
    queryFn: () => communityApi.member(id),
    enabled: isMember && Boolean(id),
    staleTime: QUERY_STALE_TIME.standard,
  });
}

/**
 * The public startup list.
 *
 * Static stale time as before — a curated list changes when a steward changes
 * it, not on its own. Filters are part of the key so each combination caches
 * separately instead of clobbering the unfiltered list.
 */
export function useStartups(filters?: { search?: string; stage?: string; hiring?: string }) {
  const query = {
    ...(filters?.search ? { search: filters.search } : {}),
    ...(filters?.stage ? { stage: filters.stage } : {}),
    ...(filters?.hiring ? { hiring: filters.hiring } : {}),
  };

  return useQuery({
    queryKey: queryKeys.community.startups(query),
    queryFn: () => communityApi.startups(query),
    staleTime: QUERY_STALE_TIME.static,
  });
}

/** One startup, by uuid or slug. Public, so no membership gate. */
export function useStartup(key: string) {
  return useQuery({
    queryKey: queryKeys.community.startup(key),
    queryFn: () => communityApi.startup(key),
    enabled: Boolean(key),
    staleTime: QUERY_STALE_TIME.static,
  });
}

/**
 * Staff writes.
 *
 * Each invalidates every startup query — list, filtered lists and details —
 * because a rename changes a slug and a reorder changes every row's position,
 * so patching one cache entry would leave the others disagreeing.
 */
function useStartupMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.community.all() });
    },
  });
}

export function useCreateStartup() {
  return useStartupMutation((input: StartupInput) => communityApi.createStartup(input));
}

export function useUpdateStartup() {
  return useStartupMutation((args: { id: string; patch: Partial<StartupInput> }) =>
    communityApi.updateStartup(args.id, args.patch),
  );
}

export function useDeleteStartup() {
  return useStartupMutation((id: string) => communityApi.deleteStartup(id));
}

export function useReorderStartups() {
  return useStartupMutation((orderedIds: string[]) => communityApi.reorderStartups(orderedIds));
}

/** Live occupancy. Polls while the app is foregrounded — the dial is the point. */
export function useOccupancy() {
  return useQuery({
    queryKey: queryKeys.dojo.occupancy(),
    queryFn: communityApi.occupancy,
    staleTime: QUERY_STALE_TIME.realtime,
    refetchInterval: 60_000,
    // React Query keeps polling a backgrounded app by default, which burns
    // battery for data nobody is looking at.
    refetchIntervalInBackground: false,
  });
}

export function usePrograms() {
  return useQuery({
    queryKey: queryKeys.dojo.programs(),
    queryFn: communityApi.programs,
    staleTime: QUERY_STALE_TIME.static,
  });
}

export function useAbout() {
  return useQuery({
    queryKey: queryKeys.dojo.about(),
    queryFn: communityApi.about,
    staleTime: QUERY_STALE_TIME.static,
  });
}

export function useBookTour() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: communityApi.bookTour,
    /**
     * `hasBookedTour` lives on the profile, and the tour invitation across the
     * app is rendered from it. Without this the guest books a tour, dismisses
     * the sheet, and is invited to take a tour again by the screen underneath.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.profile() });
    },
  });
}

/**
 * Site settings — Wi-Fi, lab status.
 *
 * Not gated on membership in the client: a guest gets the same shape with the
 * members-only fields null, and the Home card renders "Members only" rather
 * than disappearing. Which fields come back is decided by the RLS policy on
 * `site_settings`, not by a branch here.
 */
export function useSiteSettings() {
  return useQuery({
    queryKey: queryKeys.dojo.settings(),
    queryFn: communityApi.settings,
    staleTime: QUERY_STALE_TIME.static,
  });
}
