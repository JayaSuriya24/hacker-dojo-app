import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { communityApi, type DirectoryFilters } from '../api/community.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import { useIsActiveMember } from '~/features/profile/hooks/useProfile';

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

export function useStartups() {
  return useQuery({
    queryKey: queryKeys.community.startups(),
    queryFn: communityApi.startups,
    staleTime: QUERY_STALE_TIME.static,
  });
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
  return useMutation({ mutationFn: communityApi.bookTour });
}
