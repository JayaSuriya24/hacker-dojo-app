import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { accessApi } from '../api/access.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import { useIsActiveMember } from '~/features/profile/hooks/useProfile';

/**
 * The digital key.
 *
 * Gated on membership so a guest never fires a request that can only come back
 * 403 — the dashed card on Home is what they see instead. The key itself
 * changes about never, so it is cached at the static tier.
 */
export function useDigitalKey() {
  const isMember = useIsActiveMember();

  return useQuery({
    queryKey: queryKeys.access.key(),
    queryFn: accessApi.key,
    enabled: isMember,
    staleTime: QUERY_STALE_TIME.static,
  });
}

/**
 * A short description of the device, recorded on the audit row.
 *
 * `Device.modelName` is null on a simulator and on web, so the platform is the
 * fallback — an audit trail entry reading "unknown" helps nobody investigating
 * a badge that would not scan.
 */
function deviceHint(): string {
  const model = Device.modelName;
  return model ? `${model} (${Platform.OS})` : Platform.OS;
}

/**
 * Unlock the front door.
 *
 * Deliberately NOT optimistic and deliberately not retried. The previous
 * implementation was neither a mutation nor a request: the card ran a local
 * three-state animation and reached "Access granted" without contacting
 * anything, so a member with a lapsed membership got the same green tick as a
 * paid-up one. The server decides now, and a refusal surfaces as an error the
 * card renders verbatim.
 */
export function useUnlockDoor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => accessApi.unlock({ deviceHint: deviceHint() }),
    onSuccess: () => {
      // The history list on the same screen has a new row.
      void queryClient.invalidateQueries({ queryKey: queryKeys.access.history() });
    },
  });
}

export function useDoorHistory() {
  const isMember = useIsActiveMember();

  return useQuery({
    queryKey: queryKeys.access.history(),
    queryFn: accessApi.history,
    enabled: isMember,
    staleTime: QUERY_STALE_TIME.standard,
  });
}
