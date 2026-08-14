import { Linking, Platform } from 'react-native';
import { logger } from '~/services/logger';

/**
 * Hand the member over to Kisi to actually open the door.
 *
 * This app decides whether someone MAY come in — membership, credential,
 * revocation, rate limit, audit, all server side. It does not open anything.
 * The physical unlock is Kisi's, and this is the hand-off.
 *
 * Only the store listings are used, deliberately. Kisi documents no URL scheme
 * and no universal link for their app, so there is nothing to deep link *into*:
 * guessing `kisi://` would produce a link that silently fails on every device
 * where the scheme is wrong, and silently failing is the one behaviour a door
 * cannot have. The store page is the honest target — it opens the Kisi app's
 * listing, which shows OPEN when the app is installed and INSTALL when it is
 * not, so both halves of "take me to Kisi, or get me Kisi" work with no
 * guesswork.
 *
 * Identifiers verified against the live listings rather than assumed:
 *   iOS      apps.apple.com/app/id687291321
 *   Android  play.google.com/store/apps/details?id=de.kisi.android
 */

/** Kisi's App Store id. */
const IOS_APP_ID = '687291321';

/** Kisi's Android package name. */
const ANDROID_PACKAGE = 'de.kisi.android';

/**
 * `itms-apps:` and `market:` open the native store apps directly, skipping the
 * browser bounce that the https:// forms cause on device.
 */
const IOS_STORE_URL = `itms-apps://apps.apple.com/app/id${IOS_APP_ID}`;
const ANDROID_STORE_URL = `market://details?id=${ANDROID_PACKAGE}`;

/** Browser-safe equivalents, for web and as a fallback if the native one fails. */
const IOS_STORE_WEB_URL = `https://apps.apple.com/app/id${IOS_APP_ID}`;
const ANDROID_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/**
 * Kisi's own page listing both mobile apps.
 *
 * The web target, because neither store link is right in a desktop browser —
 * sending someone to an iOS listing on a Linux laptop is a dead end, and this
 * page offers both.
 */
const WEB_URL = 'https://www.getkisi.com/access-control-app';

/** Where this platform should be sent, native form first. */
function targets(): readonly string[] {
  if (Platform.OS === 'ios') return [IOS_STORE_URL, IOS_STORE_WEB_URL];
  if (Platform.OS === 'android') return [ANDROID_STORE_URL, ANDROID_STORE_WEB_URL];
  return [WEB_URL];
}

/**
 * Open Kisi, falling back through the alternatives for this platform.
 *
 * Returns whether anything opened, rather than throwing. The caller has already
 * been authorised and has an audit row written by that point; a failure to
 * launch the store is a nuisance to report, not a reason to unwind a decision
 * the server has already recorded.
 */
export async function openKisiApp(): Promise<boolean> {
  for (const url of targets()) {
    try {
      await Linking.openURL(url);
      return true;
    } catch (error) {
      // Expected for `itms-apps:`/`market:` on a simulator or emulator with no
      // store installed — which is exactly why the https form follows.
      logger.warn('Could not open Kisi target', { url, error });
    }
  }

  return false;
}
