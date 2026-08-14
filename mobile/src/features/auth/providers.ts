/**
 * Which Supabase auth providers are actually enabled on the project.
 *
 * This mirrors `supabase/config.toml`. A provider that is switched off server
 * side still renders a perfectly good button — the failure only appears after a
 * member taps it and Supabase answers `validation_failed`, by which point they
 * have already committed to a sign-in route that cannot work. Offering it at
 * all is the bug; these flags are what keep the UI honest about it.
 *
 * Flip a flag here in the SAME change that enables the provider in
 * `supabase/config.toml`, or the two drift apart again.
 */
export const authProviders = {
  /** `[auth.external.google]` — client id and secret are set in `supabase/.env`. */
  google: true,

  /**
   * `[auth.external.apple]` — off. `SUPABASE_AUTH_APPLE_CLIENT_ID` and
   * `SUPABASE_AUTH_APPLE_SECRET` are both empty, so there is no Services ID or
   * signing key to authenticate against.
   *
   * NOTE: App Store Review guideline 4.8 requires Sign in with Apple wherever
   * another social login is offered. Shipping the Google button on iOS without
   * this one is a rejection risk, so the resolution is to configure Apple —
   * not to leave it hidden indefinitely.
   */
  apple: false,

  /** `[auth.sms]` — off. No Twilio credentials are configured for the project. */
  phone: false,
} as const;
