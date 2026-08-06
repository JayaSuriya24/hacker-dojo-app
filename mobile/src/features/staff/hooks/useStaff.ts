import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '../api/staff.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import { useMe } from '~/features/profile/hooks/useProfile';
import type { ApplicationStatus, StaffQueueKind, TourStatus } from '~/types/domain';

/**
 * Whether the signed-in member is a steward.
 *
 * Read from the profile the server returned, never from anything the client
 * decides — and it only gates *rendering*. Every staff route is independently
 * gated by `requireRole` and by `is_staff()` in the RLS policy, so a member who
 * forced the screen open would see an empty list and a 403, not data.
 */
export function useIsStaff(): boolean {
  const { data } = useMe();
  return data?.role === 'steward' || data?.role === 'admin';
}

export function useStaffDashboard() {
  const isStaff = useIsStaff();

  return useQuery({
    queryKey: queryKeys.staff.dashboard(),
    queryFn: staffApi.dashboard,
    enabled: isStaff,
    // Counts drive a badge someone acts on; a stale one sends a steward to an
    // empty queue.
    staleTime: QUERY_STALE_TIME.realtime,
  });
}

export function useStaffQueue(filters: { kind?: StaffQueueKind; status?: string } = {}) {
  const isStaff = useIsStaff();

  return useQuery({
    queryKey: queryKeys.staff.queue({
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    }),
    queryFn: () => staffApi.queue(filters),
    enabled: isStaff,
    staleTime: QUERY_STALE_TIME.realtime,
    placeholderData: (previous) => previous,
  });
}

/**
 * Every decision invalidates the queue AND the dashboard.
 *
 * They are two views of the same rows, and a steward confirming a tour while
 * the badge still says "3 pending" reads as the app not having registered the
 * tap.
 */
function useQueueMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff.all() });
    },
  });
}

export function useSetTourStatus() {
  return useQueueMutation(({ id, status }: { id: string; status: TourStatus }) =>
    staffApi.setTourStatus(id, status),
  );
}

export function useSetEventRequestStatus() {
  return useQueueMutation(({ id, status }: { id: string; status: ApplicationStatus }) =>
    staffApi.setEventRequestStatus(id, status),
  );
}

export function useSetApplicationStatus() {
  return useQueueMutation(({ id, status }: { id: string; status: ApplicationStatus }) =>
    staffApi.setApplicationStatus(id, status),
  );
}

export function usePendingDocuments() {
  const isStaff = useIsStaff();

  return useQuery({
    queryKey: queryKeys.staff.documents(),
    queryFn: staffApi.pendingDocuments,
    enabled: isStaff,
    staleTime: QUERY_STALE_TIME.realtime,
  });
}

export function useReviewDocument() {
  return useQueueMutation(
    ({
      id,
      status,
      reviewNote,
    }: {
      id: string;
      status: 'approved' | 'rejected';
      reviewNote?: string;
    }) => staffApi.reviewDocument(id, { status, ...(reviewNote ? { reviewNote } : {}) }),
  );
}
