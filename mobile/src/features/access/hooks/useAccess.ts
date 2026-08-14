import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accessApi } from '../api/access.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import { useIsActiveMember } from '~/features/profile/hooks/useProfile';

/**
 * Member credentials that this app still owns.
 *
 * Door access is deliberately absent: it belongs entirely to Kisi now, which
 * holds the credential, makes the decision and keeps the history. The Wi-Fi PIN
 * below is ours because nothing else issues it.
 */

/**
 * The member's own Wi-Fi credential.
 *
 * Gated on membership: a guest firing this can only get a 403 back, and the
 * guest network they actually want is in site settings, which needs no account
 * at all.
 *
 * Cached at the static tier — a PIN changes only when its owner rotates it, and
 * that path updates the cache directly.
 */
export function useWifiCredential() {
  const isMember = useIsActiveMember();

  return useQuery({
    queryKey: queryKeys.access.wifi(),
    queryFn: accessApi.wifi,
    enabled: isMember,
    staleTime: QUERY_STALE_TIME.static,
  });
}

/** Roll a new PIN. The answer is the new credential, so it replaces the cache. */
export function useRotateWifiPin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: accessApi.rotateWifi,
    onSuccess: (credential) => {
      queryClient.setQueryData(queryKeys.access.wifi(), credential);
    },
  });
}
