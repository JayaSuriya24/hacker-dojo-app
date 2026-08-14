import { randomInt } from 'node:crypto';
import { wifiRepository } from '../repositories/wifi.repository.js';
import { siteSettingRepository } from '../repositories/settings.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { emailService } from './email.service.js';
import { logger } from '../config/logger.js';
import type { AuthenticatedUser } from '../types/http.js';

/**
 * Member wireless credentials.
 *
 * The Dojo runs two networks. The guest one takes a posted password and is
 * described entirely by site settings. The member one authenticates each person
 * as themselves — email address as the username, a five-digit PIN as the
 * password — which is what this issues and reads.
 *
 * A five-digit PIN is 100,000 possibilities. That is a deliberate trade for a
 * credential typed into an OS network prompt, and it holds up only because
 * guessing happens against the access point, which rate-limits, rather than
 * against this API — nothing here verifies a PIN, so there is nothing here to
 * brute-force. If a verification endpoint is ever added, it needs its own
 * lockout before it goes anywhere near the internet.
 */

/** Digits in a member PIN. Five, because it is typed on a phone keyboard. */
const PIN_LENGTH = 5;

export interface WifiCredentialView {
  /** The member network's name, from site settings. */
  ssid: string | null;
  /** What the member types as the username — their own email address. */
  username: string;
  pin: string;
  issuedAt: string;
  rotatedAt: string | null;
}

/**
 * A uniformly random PIN, from the CSPRNG rather than `Math.random`.
 *
 * `randomInt` is rejection-sampled, so every value in the range is equally
 * likely — taking `Math.random() * 100000` would be both predictable and
 * slightly biased, and predictability is the whole problem with a credential.
 * Padded rather than range-limited so `00042` is as available as `94210`;
 * excluding the leading-zero space would throw away a tenth of the keyspace.
 */
function generatePin(): string {
  return String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
}

async function memberSsid(): Promise<string | null> {
  const rows = await siteSettingRepository.visibleTo(null);
  return rows.find((row) => row.key === 'wifi_ssid')?.value ?? null;
}

export const wifiService = {
  /**
   * The caller's own Wi-Fi details.
   *
   * A member who joined before this existed has no row, so one is issued on
   * first read rather than left absent — the alternative is a card that says
   * "no PIN" to someone whose membership is perfectly valid.
   */
  async credentialFor(user: AuthenticatedUser): Promise<WifiCredentialView> {
    let row = await wifiRepository.findByProfile(user.accessToken, user.id);

    if (!row) {
      const { credential } = await wifiRepository.issueIfAbsent(user.id, generatePin());
      row = credential;
    }

    return {
      ssid: await memberSsid(),
      username: user.email,
      pin: row.pin,
      issuedAt: row.issued_at,
      rotatedAt: row.rotated_at,
    };
  },

  /** Roll a new PIN, for a member who thinks theirs has got out. */
  async rotateFor(user: AuthenticatedUser): Promise<WifiCredentialView> {
    const existing = await wifiRepository.findByProfile(user.accessToken, user.id);
    if (!existing) {
      // Nothing to rotate yet — issuing one is the same outcome the member
      // wanted, so do that instead of refusing.
      return this.credentialFor(user);
    }

    const row = await wifiRepository.rotate(user.id, generatePin());

    return {
      ssid: await memberSsid(),
      username: user.email,
      pin: row.pin,
      issuedAt: row.issued_at,
      rotatedAt: row.rotated_at,
    };
  },

  /**
   * Issue a PIN for a member who has just been granted a membership, and send
   * the welcome mail that carries it.
   *
   * Called from the subscription webhook, which is the only place membership is
   * granted. Everything here is best-effort: Stripe has already taken the
   * money, so a failure to issue or to email must not throw and turn a
   * successful payment into a retried webhook. The member can always read the
   * PIN from the app, and `credentialFor` issues one on first read if this did
   * not manage to.
   */
  async onMembershipActivated(profileId: string): Promise<void> {
    try {
      const { credential, issued } = await wifiRepository.issueIfAbsent(profileId, generatePin());

      // Only a brand-new credential is worth an email. Subscription events fire
      // on every renewal and status change, and a welcome mail on each one is
      // how a member ends up muting the sender.
      if (!issued) return;

      const profile = await profileRepository.findById(profileId);
      if (!profile?.email) {
        logger.warn({ profileId }, 'Wi-Fi PIN issued but the profile has no email to send it to');
        return;
      }

      const rows = await siteSettingRepository.visibleTo(null);
      const value = (key: string) => rows.find((row) => row.key === key)?.value ?? null;

      await emailService.sendMembershipWelcome({
        to: profile.email,
        name: profile.full_name,
        memberSsid: value('wifi_ssid') ?? 'the member network',
        guestSsid: value('wifi_guest_ssid') ?? 'Hacker Dojo Free',
        guestPassword: value('wifi_guest_password') ?? 'hackerdojo',
        pin: credential.pin,
      });
    } catch (error) {
      logger.error({ err: error, profileId }, 'Could not issue Wi-Fi credential on activation');
    }
  },
};
