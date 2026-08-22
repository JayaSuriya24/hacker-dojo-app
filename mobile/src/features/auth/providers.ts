import { appConfig } from '~/constants/config';

/**
 * Which Supabase auth providers are actually enabled on the project.
 *
 * This mirrors `supabase/config.toml`. A provider that is switched off server
 * side still renders a perfectly good button — the failure only appears after a
 * member taps it and Supabase answers `validation_failed`, by which point they
 * have already committed to a sign-in route that cannot work. Offering it at
 * all is the bug; these flags are what keep the UI honest about it.
 */
export const authProviders = {
  /** `[auth.external.google]` — client id and secret are set in `supabase/.env`. */
  google: true,

  /**
   * `[auth.external.apple]` — driven by build configuration rather than a
   * literal, because this flag and the Supabase provider have to agree and a
   * hardcoded boolean is what let them drift.
   *
   * The whole native flow is implemented and ready: `signInWithApple` in
   * `auth.service.ts` uses `expo-apple-authentication` + `signInWithIdToken`,
   * `SocialSignIn` renders Apple's own button on iOS, and the entitlement and
   * plugin are declared in `app.config.ts`. What is missing is a Services ID
   * and an ES256 signing key, which cannot be invented.
   *
   * To turn on — both halves, in the same change:
   *   1. Create the Services ID and `.p8` key in the Apple Developer portal,
   *      mint the client secret JWT, and put both in `supabase/.env` as
   *      `SUPABASE_AUTH_APPLE_CLIENT_ID` / `SUPABASE_AUTH_APPLE_SECRET`.
   *   2. Set `[auth.external.apple] enabled = true` in `supabase/config.toml`
   *      and run `supabase config push`.
   *   3. Build with `EXPO_PUBLIC_APPLE_AUTH_ENABLED=true`.
   *
   * NOTE: App Store Review guideline 4.8 requires Sign in with Apple wherever
   * another social login is offered. Shipping the Google button on iOS without
   * this one is a rejection, so step 3 is not optional for an iOS release — it
   * is the release blocker.
   */
  apple: appConfig.appleAuthEnabled,

  /** `[auth.sms]` — off. No Twilio credentials are configured for the project. */
  phone: false,
} as const;
