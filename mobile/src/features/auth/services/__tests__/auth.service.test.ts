import { authService } from '../auth.service';
import type { ApiError } from '~/services/api/errors';
import { supabase } from '~/services/supabase';

// Imported at module load by the service under test. Only their presence
// matters here — every assertion below is about error translation.
jest.mock('expo-linking', () => ({ createURL: (path: string) => `hackerdojo://${path}` }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('~/services/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}));

const auth = supabase.auth as unknown as {
  signInWithPassword: jest.Mock;
  signUp: jest.Mock;
  signInWithOtp: jest.Mock;
  verifyOtp: jest.Mock;
  resetPasswordForEmail: jest.Mock;
};

/** The shape Supabase returns: a stable `code`, plus prose that may change. */
const fail = (code: string, message: string, status = 400) => ({
  data: {},
  error: { code, message, status },
});

/**
 * Translation of Supabase's auth failures into messages a member can act on.
 *
 * The codes asserted here are the real ones, captured from the live project
 * rather than guessed — in particular `otp_disabled`, whose prose ("Signups not
 * allowed for otp") gives no hint that it means "this address has no account".
 */
describe('auth error translation', () => {
  beforeEach(() => jest.clearAllMocks());

  async function caught(run: () => Promise<unknown>): Promise<ApiError> {
    try {
      await run();
    } catch (error) {
      return error as ApiError;
    }
    throw new Error('expected the call to reject');
  }

  it('will not say whether an address has an account when a sign-in fails', async () => {
    // Supabase returns `invalid_credentials` for BOTH a wrong password and an
    // unknown address. Distinguishing them here would make the sign-in form an
    // account-enumeration oracle, so both must produce identical copy.
    auth.signInWithPassword.mockResolvedValue(
      fail('invalid_credentials', 'Invalid login credentials'),
    );

    const wrongPassword = await caught(() => authService.signInWithPassword('a@b.com', 'nope'));
    const noSuchUser = await caught(() => authService.signInWithPassword('ghost@b.com', 'nope'));

    expect(wrongPassword.message).toBe('Email or password is incorrect.');
    expect(noSuchUser.message).toBe(wrongPassword.message);
    expect(wrongPassword.code).toBe('unauthorized');
  });

  it('tells someone requesting a code that the address has no account', async () => {
    auth.signInWithOtp.mockResolvedValue(fail('otp_disabled', 'Signups not allowed for otp', 422));

    const error = await caught(() => authService.sendEmailOtp('ghost@b.com'));

    expect(error.code).toBe('not_found');
    expect(error.message).toBe(
      'We could not find an account for that email. Create one to get started.',
    );
  });

  it('points an existing member at sign-in rather than reporting a fault', async () => {
    auth.signUp.mockResolvedValue(fail('user_already_exists', 'User already registered', 422));

    const error = await caught(() =>
      authService.signUp({ email: 'a@b.com', password: 'DojoTest123', fullName: 'A B' }),
    );

    expect(error.code).toBe('conflict');
    expect(error.message).toBe('That email already has an account. Sign in instead.');
  });

  it('marks rate limits retryable so the UI can offer to try again', async () => {
    auth.signInWithOtp.mockResolvedValue(
      fail('over_email_send_rate_limit', 'Email rate limit exceeded', 429),
    );

    const error = await caught(() => authService.sendEmailOtp('a@b.com'));

    expect(error.code).toBe('rate_limited');
    expect(error.retryable).toBe(true);
  });

  it('routes an expired session back to sign-in', async () => {
    auth.verifyOtp.mockResolvedValue(fail('session_expired', 'Session expired', 401));

    const error = await caught(() => authService.verifyOtp({ email: 'a@b.com', token: '123456' }));

    expect(error.isAuthFailure).toBe(true);
  });

  it('falls back to prose when an error carries no code', async () => {
    // Older releases omit `code`; the message table is the safety net.
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials', status: 400 },
    });

    const error = await caught(() => authService.signInWithPassword('a@b.com', 'nope'));

    expect(error.message).toBe('Email or password is incorrect.');
  });

  it("keeps the caller's own sentence for a code it does not know", async () => {
    auth.signUp.mockResolvedValue(fail('some_future_code', 'Something new', 400));

    const error = await caught(() =>
      authService.signUp({ email: 'a@b.com', password: 'DojoTest123', fullName: 'A B' }),
    );

    expect(error.code).toBe('internal_error');
    expect(error.message).toBe('We could not create your account. Try again.');
  });

  it('stays silent about whether a reset address is registered', async () => {
    // Enumeration again: this one resolves rather than throwing, so the screen
    // shows the same "if that address is registered" copy either way.
    auth.resetPasswordForEmail.mockResolvedValue(fail('user_not_found', 'User not found', 404));

    await expect(authService.sendPasswordReset('ghost@b.com')).resolves.toBeUndefined();
  });
});
