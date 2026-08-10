import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '~/services/supabase';
import { logger } from '~/services/logger';
import { ApiError, type ApiErrorCode } from '~/services/api/errors';

/**
 * Authentication.
 *
 * Every call funnels Supabase's error shapes into `ApiError`, so a screen shows
 * the same kind of message whether a sign-in failed on the network, on the
 * credentials, or on a rate limit.
 *
 * The error text here is written to be shown verbatim. Supabase's own strings
 * ("Invalid login credentials") are technically accurate and unhelpful to
 * someone who mistyped their password.
 */

const REDIRECT_URL = Linking.createURL('/auth/callback');

/**
 * Supabase's own error shape. `code` is the stable machine string
 * (`invalid_credentials`, `otp_disabled`, …); `message` is English prose that
 * changes between releases, which is why it is only ever a fallback here.
 */
interface SupabaseAuthError {
  message: string;
  status?: number;
  code?: string;
}

interface Mapped {
  code: ApiErrorCode;
  message: string;
  status: number;
  retryable?: boolean;
}

/**
 * Supabase auth codes to the message a member should read.
 *
 * Two of these are worth explaining, because the obvious version is wrong:
 *
 * `invalid_credentials` is returned for BOTH a wrong password and an address
 * with no account — Supabase does not distinguish them, and neither should we.
 * Answering "no account with that email" would turn the sign-in form into an
 * account-enumeration oracle: anyone could test addresses for membership. The
 * deliberately ambiguous wording is the security property, not an oversight.
 *
 * `otp_disabled` is the opposite call. It means "no account, and this flow may
 * not create one", and it IS surfaced plainly. The member is sitting on a
 * screen waiting for a code that will never arrive, Supabase already returns a
 * distinguishable code to anyone calling the API directly, so silence here buys
 * nothing and strands someone who simply mistyped their address.
 */
const BY_CODE: Record<string, Mapped> = {
  // Credentials and identity
  invalid_credentials: {
    code: 'unauthorized',
    message: 'Email or password is incorrect.',
    status: 401,
  },
  user_not_found: {
    code: 'not_found',
    message: 'We could not find an account for that email.',
    status: 404,
  },
  otp_disabled: {
    code: 'not_found',
    message: 'We could not find an account for that email. Create one to get started.',
    status: 404,
  },
  user_already_exists: {
    code: 'conflict',
    message: 'That email already has an account. Sign in instead.',
    status: 409,
  },
  email_exists: {
    code: 'conflict',
    message: 'That email already has an account. Sign in instead.',
    status: 409,
  },
  phone_exists: {
    code: 'conflict',
    message: 'That phone number already has an account. Sign in instead.',
    status: 409,
  },
  user_banned: {
    code: 'forbidden',
    message: 'That account is suspended. Email staff@hackerdojo.org to sort it out.',
    status: 403,
  },

  // Confirmation
  email_not_confirmed: {
    code: 'forbidden',
    message: 'Confirm your email first — check your inbox for the link.',
    status: 403,
  },
  phone_not_confirmed: {
    code: 'forbidden',
    message: 'Confirm your phone number first — check your texts for the code.',
    status: 403,
  },

  // One-time codes
  otp_expired: {
    code: 'unauthorized',
    message: 'That code is incorrect or expired. Request a new one.',
    status: 401,
  },

  // Passwords
  weak_password: {
    code: 'validation_failed',
    message: 'Use at least 8 characters, with an uppercase letter and a number.',
    status: 422,
  },
  same_password: {
    code: 'bad_request',
    message: 'Pick a password you have not used here before.',
    status: 400,
  },

  // Addresses
  email_address_invalid: {
    code: 'validation_failed',
    message: 'That email address does not look right.',
    status: 422,
  },
  validation_failed: {
    code: 'validation_failed',
    message: 'Check the details you entered and try again.',
    status: 422,
  },

  // Rate limits — all retryable, which is what drives the retry affordance.
  over_email_send_rate_limit: {
    code: 'rate_limited',
    message: 'Too many emails just went out. Wait a minute and try again.',
    status: 429,
    retryable: true,
  },
  over_sms_send_rate_limit: {
    code: 'rate_limited',
    message: 'Too many texts just went out. Wait a minute and try again.',
    status: 429,
    retryable: true,
  },
  over_request_rate_limit: {
    code: 'rate_limited',
    message: 'Too many attempts. Wait a minute and try again.',
    status: 429,
    retryable: true,
  },

  // Sessions — these route back to sign-in via `ApiError.isAuthFailure`.
  session_expired: {
    code: 'session_expired',
    message: 'Your session expired. Sign in again.',
    status: 401,
  },
  session_not_found: {
    code: 'session_expired',
    message: 'Your session expired. Sign in again.',
    status: 401,
  },
  bad_jwt: {
    code: 'session_expired',
    message: 'Your session expired. Sign in again.',
    status: 401,
  },
  refresh_token_not_found: {
    code: 'session_expired',
    message: 'Your session expired. Sign in again.',
    status: 401,
  },

  // Provider availability
  signup_disabled: {
    code: 'forbidden',
    message: 'New accounts are closed right now. Email staff@hackerdojo.org.',
    status: 403,
  },
  email_provider_disabled: {
    code: 'upstream_unavailable',
    message: 'Email sign-in is unavailable right now. Try another method.',
    status: 503,
    retryable: true,
  },
  captcha_failed: {
    code: 'bad_request',
    message: 'That security check did not pass. Try again.',
    status: 400,
    retryable: true,
  },
};

/**
 * Prose fallbacks, for errors that arrive without a `code`.
 *
 * Older Supabase releases and a few network-layer failures omit it. Matching on
 * text is brittle, which is exactly why it sits behind the code table rather
 * than in front of it.
 */
function fromMessage(message: string): Mapped | undefined {
  if (message.includes('invalid login credentials')) return BY_CODE['invalid_credentials'];
  if (message.includes('email not confirmed')) return BY_CODE['email_not_confirmed'];
  if (message.includes('already registered') || message.includes('already been registered')) {
    return BY_CODE['user_already_exists'];
  }
  if (message.includes('signups not allowed')) return BY_CODE['otp_disabled'];
  if (message.includes('token has expired') || message.includes('invalid token')) {
    return BY_CODE['otp_expired'];
  }
  if (message.includes('rate limit')) return BY_CODE['over_request_rate_limit'];
  return undefined;
}

function toApiError(error: SupabaseAuthError | null, fallback: string): ApiError {
  if (!error) return ApiError.unknown(fallback);

  const mapped =
    (error.code ? BY_CODE[error.code] : undefined) ?? fromMessage(error.message.toLowerCase());

  if (mapped) return new ApiError(mapped);

  // A 429 that named no code we know is still a rate limit; the retry
  // affordance matters more than the exact wording.
  if (error.status === 429) return new ApiError(BY_CODE['over_request_rate_limit'] as Mapped);

  // Log the unmapped shape so the table can grow, but show the caller's own
  // sentence — it is written for the specific flow that failed.
  logger.warn('Unmapped Supabase auth error', { code: error.code, status: error.status });
  return new ApiError({ code: 'internal_error', message: fallback, status: error.status ?? 500 });
}

export const authService = {
  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw toApiError(error, 'We could not sign you in. Try again.');
  },

  /**
   * Create an account.
   *
   * Returns whether the member still has to confirm their email, which is the
   * difference between "you are signed in" and "go and check your inbox".
   * Supabase signals it by returning a user with NO session: the account exists
   * but cannot act yet. Discarding that distinction is how a successful signup
   * ended up navigating to a screen the auth guard immediately bounced, leaving
   * nothing on screen at all.
   */
  async signUp(input: {
    email: string;
    password: string;
    fullName: string;
  }): Promise<{ needsEmailConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        // Read by the `handle_new_user` trigger to populate `profiles.full_name`
        // in the same transaction as the signup.
        data: { full_name: input.fullName.trim() },
        emailRedirectTo: REDIRECT_URL,
      },
    });
    if (error) throw toApiError(error, 'We could not create your account. Try again.');
    return { needsEmailConfirmation: data.session === null };
  },

  /** Email a one-time code. `shouldCreateUser: false` keeps this a sign-in path. */
  async sendEmailOtp(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    if (error) throw toApiError(error, 'We could not send that code. Try again.');
  },

  async sendPhoneOtp(phone: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      phone: phone.replace(/[^0-9+]/g, ''),
      options: { shouldCreateUser: false },
    });
    if (error) throw toApiError(error, 'We could not text that code. Try again.');
  },

  async verifyOtp(input: { email?: string; phone?: string; token: string }): Promise<void> {
    const { error } = input.phone
      ? await supabase.auth.verifyOtp({
          phone: input.phone.replace(/[^0-9+]/g, ''),
          token: input.token,
          type: 'sms',
        })
      : await supabase.auth.verifyOtp({
          email: (input.email ?? '').trim().toLowerCase(),
          token: input.token,
          type: 'email',
        });

    if (error) throw toApiError(error, 'We could not verify that code.');
  },

  async sendMagicLink(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: REDIRECT_URL, shouldCreateUser: false },
    });
    if (error) throw toApiError(error, 'We could not send that link. Try again.');
  },

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: Linking.createURL('/auth/reset'),
    });
    // Deliberately not surfaced: telling an anonymous caller whether an address
    // is registered turns this endpoint into an account-enumeration oracle. The
    // UI says "if the address is registered" either way.
    if (error) logger.warn('Password reset request failed', { error });
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw toApiError(error, 'We could not update your password.');
  },

  /**
   * Google, via the system browser.
   *
   * `openAuthSessionAsync` uses ASWebAuthenticationSession on iOS and Custom
   * Tabs on Android — both of which run outside the app's process, so the app
   * never sees the member's Google password. An embedded WebView would, and
   * Google blocks it for exactly that reason.
   */
  async signInWithGoogle(): Promise<void> {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw toApiError(error, 'We could not reach Google. Try again.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);
    if (result.type !== 'success') {
      // Cancelling is a choice, not a failure — no error surfaces to the screen.
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      throw ApiError.unknown('Google sign-in did not complete.');
    }

    await this.completeOAuthRedirect(result.url);
  },

  /**
   * Sign in with Apple. Required by App Store Review guideline 4.8 wherever a
   * third-party social login is offered, and it is the native flow on iOS —
   * hence the platform guard rather than a browser fallback.
   */
  async signInWithApple(): Promise<void> {
    if (Platform.OS !== 'ios') {
      throw ApiError.unknown('Sign in with Apple is available on iPhone and iPad.');
    }

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw ApiError.unknown('Apple did not return a sign-in token.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw toApiError(error, 'We could not sign you in with Apple.');
    } catch (error) {
      // Apple reports a user-cancelled sheet as an error; it is not one.
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        return;
      }
      throw error;
    }
  },

  /** Exchange the PKCE code carried on a deep-link callback for a session. */
  async completeOAuthRedirect(url: string): Promise<void> {
    const parsed = Linking.parse(url);
    const code = parsed.queryParams?.['code'];

    if (typeof code !== 'string') return;

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw toApiError(error, 'We could not finish signing you in.');
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    // A failed sign-out still clears local state — the session is gone from the
    // device either way, and blocking on the network here would strand someone
    // signed in on a shared device.
    if (error) logger.warn('Sign-out request failed', { error });
  },
};
