import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountService } from '../account.service.js';
import { authRepository } from '../../repositories/auth.repository.js';
import { storageRepository } from '../../repositories/storage.repository.js';
import { contentRepository } from '../../repositories/content.repository.js';
import { paymentService } from '../payment.service.js';
import { AppError } from '../../utils/errors.js';

/**
 * Account deletion.
 *
 * Stubbed at the repository boundary like the rest of the suite, so the real
 * ordering logic runs. What these assert is the ORDER and the failure
 * behaviour, because that is where the damage lives: billing has to stop before
 * the account disappears, and a failure to stop it has to abort rather than
 * leave a member charged for an account they can no longer sign into.
 */

vi.mock('../../repositories/auth.repository.js', () => ({
  authRepository: { deleteUser: vi.fn(), getUserFromToken: vi.fn() },
}));

vi.mock('../../repositories/storage.repository.js', () => ({
  storageRepository: { removeAllForProfile: vi.fn() },
  documentRepository: {},
}));

vi.mock('../../repositories/content.repository.js', () => ({
  contentRepository: { deleteToursForProfile: vi.fn() },
}));

vi.mock('../payment.service.js', () => ({
  paymentService: { cancelSubscriptionForAccountDeletion: vi.fn() },
}));

const USER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'ana@reyes.dev',
  role: 'member' as const,
  accessToken: 'token-1',
  isActiveMember: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(paymentService.cancelSubscriptionForAccountDeletion).mockResolvedValue({
    subscriptionId: 'sub_live',
    wasAlreadyInactive: false,
  });
  vi.mocked(storageRepository.removeAllForProfile).mockResolvedValue({
    removed: 2,
    failures: [],
  });
  vi.mocked(contentRepository.deleteToursForProfile).mockResolvedValue(1);
});

describe('accountService.deleteOwnAccount', () => {
  it('deletes only the caller, identified from their own session', async () => {
    await accountService.deleteOwnAccount(USER);

    // The id comes from the verified token, never from a request field. There
    // is no parameter through which another member's id could arrive.
    expect(authRepository.deleteUser).toHaveBeenCalledWith(USER.id);
    expect(storageRepository.removeAllForProfile).toHaveBeenCalledWith(USER.accessToken, USER.id);
  });

  it('cancels billing BEFORE deleting the account', async () => {
    await accountService.deleteOwnAccount(USER);

    const cancelledAt = vi.mocked(paymentService.cancelSubscriptionForAccountDeletion).mock
      .invocationCallOrder[0] as number;
    const deletedAt = vi.mocked(authRepository.deleteUser).mock.invocationCallOrder[0] as number;

    expect(cancelledAt).toBeLessThan(deletedAt);
  });

  it('aborts entirely when the subscription cannot be cancelled', async () => {
    vi.mocked(paymentService.cancelSubscriptionForAccountDeletion).mockRejectedValue(
      AppError.upstream('We could not reach billing to cancel your membership.'),
    );

    await expect(accountService.deleteOwnAccount(USER)).rejects.toThrow(/could not reach billing/);

    // The member keeps their account — and their ability to complain about it.
    expect(authRepository.deleteUser).not.toHaveBeenCalled();
    expect(storageRepository.removeAllForProfile).not.toHaveBeenCalled();
  });

  it('deletes the account when there was no subscription to cancel', async () => {
    vi.mocked(paymentService.cancelSubscriptionForAccountDeletion).mockResolvedValue({
      subscriptionId: null,
      wasAlreadyInactive: true,
    });

    const result = await accountService.deleteOwnAccount(USER);

    expect(authRepository.deleteUser).toHaveBeenCalledWith(USER.id);
    expect(result.subscriptionId).toBeNull();
  });

  it('clears stored objects before the account goes', async () => {
    await accountService.deleteOwnAccount(USER);

    const storageAt = vi.mocked(storageRepository.removeAllForProfile).mock
      .invocationCallOrder[0] as number;
    const deletedAt = vi.mocked(authRepository.deleteUser).mock.invocationCallOrder[0] as number;

    // Storage runs as the member, so it has to happen while they still exist.
    expect(storageAt).toBeLessThan(deletedAt);
  });

  it('still deletes the account when an object could not be removed, and says so', async () => {
    vi.mocked(storageRepository.removeAllForProfile).mockResolvedValue({
      removed: 1,
      failures: ['documents: network error'],
    });

    const result = await accountService.deleteOwnAccount(USER);

    // A transient storage error must not trap someone in an account they asked
    // to delete — but it is reported rather than swallowed.
    expect(authRepository.deleteUser).toHaveBeenCalledOnce();
    expect(result.storageFailures).toEqual(['documents: network error']);
  });

  /**
   * The bug a real end-to-end deletion found, and mocks never would have.
   *
   * `tours.profile_id` is `on delete set null`, and `tours` also carries
   * `check (profile_id is not null or guest_email is not null)`. Cascading the
   * profile away writes a row satisfying neither, Postgres refuses, and the
   * whole `auth.users` delete fails as "Database error deleting user" — so a
   * member who had ever booked a tour could not delete their account at all.
   */
  it('clears the member tours that would otherwise block the delete', async () => {
    await accountService.deleteOwnAccount(USER);

    expect(contentRepository.deleteToursForProfile).toHaveBeenCalledWith(USER.id);

    const toursAt = vi.mocked(contentRepository.deleteToursForProfile).mock
      .invocationCallOrder[0] as number;
    const deletedAt = vi.mocked(authRepository.deleteUser).mock.invocationCallOrder[0] as number;

    // Must happen BEFORE the cascade would try to null them out.
    expect(toursAt).toBeLessThan(deletedAt);
  });

  it('reports what it removed', async () => {
    const result = await accountService.deleteOwnAccount(USER);

    expect(result).toEqual({
      subscriptionId: 'sub_live',
      storageObjectsRemoved: 2,
      toursRemoved: 1,
      storageFailures: [],
    });
  });

  it('surfaces a failure to delete the auth user rather than reporting success', async () => {
    // `Once`, so the rejection does not leak into the next test — `clearAllMocks`
    // resets recorded calls but keeps implementations.
    vi.mocked(authRepository.deleteUser).mockRejectedValueOnce(new Error('auth admin unavailable'));

    await expect(accountService.deleteOwnAccount(USER)).rejects.toThrow('auth admin unavailable');
  });

  /**
   * A second request from a client that retried, or a member tapping twice.
   * The first call removed the auth user, so the second cannot authenticate at
   * all — `requireAuth` rejects it before this service is reached. Here we only
   * assert the service itself is not stateful about it.
   */
  it('is safe to call again for a caller who somehow still has a token', async () => {
    await accountService.deleteOwnAccount(USER);
    await accountService.deleteOwnAccount(USER);

    expect(authRepository.deleteUser).toHaveBeenCalledTimes(2);
    expect(authRepository.deleteUser).toHaveBeenLastCalledWith(USER.id);
  });
});
