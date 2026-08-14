import { api } from '~/services/api/client';
import type { WifiCredential } from '~/types/domain';

/**
 * Member credentials.
 *
 * Door endpoints used to live here. They are gone: physical access is Kisi's
 * entirely, so this app neither issues a door credential nor asks anything to
 * open. What remains is the Wi-Fi PIN, which nothing else mints.
 */
export const accessApi = {
  wifi: () => api.get<WifiCredential>('/me/wifi'),

  /** Not idempotent: a retry would mint a second new PIN. */
  rotateWifi: () => api.post<WifiCredential>('/me/wifi/rotate', undefined, { retry: false }),
};
