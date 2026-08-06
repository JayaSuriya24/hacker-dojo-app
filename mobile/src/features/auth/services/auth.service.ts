import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '~/services/supabase';
import { logger } from '~/services/logger';
import { ApiError } from '~/services/api/errors';

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

function toApiError(
  error: { message: string; status?: number } | null,
  fallback: string,
): ApiError {
  if (!error) return ApiError.unknown(fallback);

  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return new ApiError({
      code: 'unauthorized',
      message: 'Email or password is incorrect.',
      status: 401,
    });
  }
  if (message.includes('email not confirmed')) {
    return new ApiError({
      code: 'forbidden',
      message: 'Confirm your email first — check your inbox for the link.',
      status: 403,
    });
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return new ApiError({
      code: 'conflict',
      message: 'That email already has an account. Sign in instead.',
      status: 409,
    });
  }
  if (message.includes('rate limit') || error.status === 429) {
    return new ApiError({
      code: 'rate_limited',
      message: 'Too many attempts. Wait a minute and try again.',
      status: 429,
      retryable: true,
    });
  }
  if (message.includes('token has expired') || message.includes('invalid token')) {
    return new ApiError({
      code: 'unauthorized',
      message: 'That code is incorrect or expired. Request a new one.',
      status: 401,
    });
  }

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

  async signUp(input: { email: string; password: string; fullName: string }): Promise<void> {
    const { error } = await supabase.auth.signUp({
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
