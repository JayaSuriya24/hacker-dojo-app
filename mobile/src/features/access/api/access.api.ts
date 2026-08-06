import { api } from '~/services/api/client';
import type { DigitalKey, DoorEvent, UnlockResult } from '~/types/domain';

/**
 * Door access.
 *
 * `unlock` deliberately does not opt into the client's retry: it is not
 * idempotent in any way a member would want — a retried request is a second
 * unlock, a second audit row, and a door that opens again thirty seconds after
 * they walked through.
 */
export const accessApi = {
  key: () => api.get<DigitalKey>('/me/key'),

  unlock: (input: { deviceHint?: string }) =>
    api.post<UnlockResult>('/me/key/unlock', input, { retry: false }),

  history: () => api.get<DoorEvent[]>('/me/key/history'),
};
