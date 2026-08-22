import { authRepository } from '../repositories/auth.repository.js';
import { storageRepository } from '../repositories/storage.repository.js';
import { contentRepository } from '../repositories/content.repository.js';
import { paymentService } from './payment.service.js';
import { logger } from '../config/logger.js';
import type { AuthenticatedUser } from '../types/http.js';

/**
 * Account deletion.
 *
 * App Store guideline 5.1.1(v) requires an app that creates accounts to delete
 * them from inside the app, and this is the server half of that. It is also the
 * most destructive operation in the API, so the ordering below is the design
 * rather than an implementation detail.
 *
 * WHO is deleted is never a parameter. The caller is identified from their
 * verified bearer token by `requireAuth`, and this function takes that
 * `AuthenticatedUser` — there is deliberately no id argument to pass, so no
 * route, controller or future caller can express "delete somebody else".
 */

export interface AccountDeletionResult {
  /** The subscription that was cancelled, if there was one to cancel. */
  subscriptionId: string | null;
  /** Objects removed from the avatar and document buckets. */
  storageObjectsRemoved: number;
  /** Tours cancelled — they cannot survive the profile, see the service. */
  toursRemoved: number;
  /** Non-fatal storage problems, surfaced so the response is not a lie. */
  storageFailures: string[];
}

export const accountService = {
  /**
   * Delete the caller's own account.
   *
   * Four steps, in an order chosen for what each failure would leave behind:
   *
   *   1. **Billing.** Cancelled at Stripe first, and a failure ABORTS — nothing
   *      else has happened yet, so the member keeps their account and can try
   *      again. Reversed, a member could lose their account and keep the
   *      monthly charge, with nothing left to sign in and dispute it with.
   *
   *   2. **Tours.** Removed explicitly, because the cascade cannot legally
   *      rewrite them and the whole deletion fails if it tries. See
   *      `contentRepository.deleteToursForProfile` for the constraint.
   *
   *   3. **Storage.** Object storage is outside the database cascade, so the
   *      member's avatar and verification documents are removed explicitly, as
   *      the member themselves. A failure here is logged and does NOT abort:
   *      the alternative is a member unable to delete their account because of
   *      a transient storage error, and a stranded object can be swept later
   *      while a blocked deletion cannot. The count and any failures are
   *      returned rather than swallowed.
   *
   *   4. **The auth user.** One call, which cascades to `profiles` and from
   *      there to every table that references it. Last, because it is the step
   *      that destroys the identity the two above need in order to run.
   *
   * There is no local "mark it deleted" write anywhere in here. The database is
   * the record, and a row saying `deleted` next to live data would be a second
   * source of truth that can disagree with it.
   */
  async deleteOwnAccount(user: AuthenticatedUser): Promise<AccountDeletionResult> {
    logger.info({ profileId: user.id }, 'Account deletion requested');

    // 1. Money first. Throws — and stops everything — if it cannot be confirmed.
    const billing = await paymentService.cancelSubscriptionForAccountDeletion(user);

    /*
     * 2. The one row the cascade cannot legally rewrite.
     *
     * `tours.profile_id` is `on delete set null` and `tours` also requires a
     * profile OR a guest email, so cascading the profile away produces a row
     * that satisfies neither and Postgres aborts the entire `auth.users`
     * delete. Verified against a real account: a member who had booked a tour
     * could not delete their account at all, and the failure surfaced only as
     * "Database error deleting user".
     */
    const toursRemoved = await contentRepository.deleteToursForProfile(user.id);

    // 3. Objects the cascade cannot reach.
    const storage = await storageRepository.removeAllForProfile(user.accessToken, user.id);

    if (storage.failures.length > 0) {
      // Loud, because this is the branch that can leave a student ID behind.
      logger.error(
        { profileId: user.id, failures: storage.failures },
        'Account deletion could not clear every stored object — continuing, sweep required',
      );
    }

    // 4. The identity itself, and everything hanging off it.
    await authRepository.deleteUser(user.id);

    logger.info(
      {
        profileId: user.id,
        subscriptionId: billing.subscriptionId,
        storageObjectsRemoved: storage.removed,
        toursRemoved,
        storageFailures: storage.failures.length,
      },
      'Account deleted',
    );

    return {
      subscriptionId: billing.subscriptionId,
      storageObjectsRemoved: storage.removed,
      toursRemoved,
      storageFailures: storage.failures,
    };
  },
};
