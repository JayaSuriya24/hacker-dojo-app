import { accessRepository } from '../repositories/access.repository.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/http.js';

export interface DigitalKeyView {
  keyId: string;
  active: boolean;
  issuedAt: string;
}

export interface UnlockResultView {
  granted: boolean;
  keyId: string;
  /** Seconds the strike stays released. Rendered in the confirmation copy. */
  unlockSeconds: number;
  at: string;
  message: string;
}

export interface DoorEventView {
  id: number;
  keyId: string;
  granted: boolean;
  reason: string | null;
  at: string;
}

/** How long the strike is released. Matches the controller's own dwell time. */
const UNLOCK_SECONDS = 8;

/** A badge that fires more than this in a minute is a stuck button or a replay. */
const MAX_ATTEMPTS_PER_MINUTE = 6;

/**
 * The front door.
 *
 * The app previously drew this entirely client-side: a hardcoded key id and a
 * three-state animation that reached "Access granted" without contacting
 * anything. Nothing was authorised and nothing was recorded, so a member locked
 * out at midnight left no trace to look at.
 *
 * Every attempt now goes through here and every attempt is written to
 * `door_access_logs` — refusals especially, because those are the rows someone
 * needs when a member says the door would not open. The result the client
 * renders is the result the server decided.
 */
export const accessService = {
  /**
   * The member's key, minted on first request.
   *
   * Gated on an active membership: a guest has no key, which is what the
   * dashed-border card on Home is telling them.
   */
  async digitalKey(user: AuthenticatedUser): Promise<DigitalKeyView> {
    if (!user.isActiveMember) {
      throw AppError.membershipRequired('Door access is a member benefit.');
    }

    const credential = await accessRepository.issueCredential(user.id);

    return {
      keyId: credential.key_id,
      active: credential.active,
      issuedAt: credential.issued_at,
    };
  },

  /**
   * Attempt an unlock.
   *
   * Four things have to hold, and each failure is logged with its own reason so
   * the audit trail says *why* rather than just "denied":
   *
   *   1. The caller has an active membership.
   *   2. They hold a credential.
   *   3. That credential has not been revoked.
   *   4. They are not hammering the reader.
   *
   * A refusal is a 403 with a sentence, not a silent false — the member is
   * standing at the door and needs to know whether to call a steward or fix
   * their billing.
   */
  async unlock(
    user: AuthenticatedUser,
    input: { deviceHint?: string | undefined },
  ): Promise<UnlockResultView> {
    const deviceHint = input.deviceHint?.slice(0, 120) ?? null;

    const credential = await accessRepository.findCredential(user.accessToken, user.id);
    const keyId = credential?.key_id ?? 'unknown';

    const deny = async (reason: string, error: AppError): Promise<never> => {
      await accessRepository.log({
        profileId: user.id,
        keyId,
        granted: false,
        reason,
        deviceHint,
      });
      logger.warn({ profileId: user.id, reason }, 'Door unlock refused');
      throw error;
    };

    if (!user.isActiveMember) {
      await deny(
        'membership_inactive',
        AppError.membershipRequired('Your membership is not active, so the door will not open.'),
      );
    }

    if (!credential) {
      await deny(
        'no_credential',
        AppError.forbidden('You do not have a door key yet. Ask a steward at the front desk.'),
      );
    }

    if (!credential?.active) {
      await deny(
        'credential_revoked',
        AppError.forbidden('That key has been revoked. Ask a steward at the front desk.'),
      );
    }

    const attempts = await accessRepository.attemptsSince(user.id, new Date(Date.now() - 60_000));
    if (attempts >= MAX_ATTEMPTS_PER_MINUTE) {
      await deny(
        'rate_limited',
        new AppError(429, 'rate_limited', 'Too many unlock attempts. Wait a moment and try again.'),
      );
    }

    const record = await accessRepository.log({
      profileId: user.id,
      keyId,
      granted: true,
      reason: null,
      deviceHint,
    });

    logger.info({ profileId: user.id, keyId }, 'Door unlocked');

    return {
      granted: true,
      keyId,
      unlockSeconds: UNLOCK_SECONDS,
      at: record.created_at,
      message: `Front door open for ${UNLOCK_SECONDS} seconds`,
    };
  },

  /** The member's own recent attempts. Their history, not the building's. */
  async history(user: AuthenticatedUser, limit: number): Promise<DoorEventView[]> {
    const rows = await accessRepository.recentFor(user.accessToken, user.id, limit);

    return rows.map((row) => ({
      id: row.id,
      keyId: row.key_id,
      granted: row.granted,
      reason: row.reason,
      at: row.created_at,
    }));
  },
};
