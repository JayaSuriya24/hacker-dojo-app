import { authProviders } from '../providers';

/**
 * Which providers the UI offers.
 *
 * The rule this protects is that the Apple button and the Supabase Apple
 * provider turn on together. A rendered Apple button backed by an unconfigured
 * provider fails with `invalid_client` only AFTER the member has committed to
 * that sign-in route, which is worse than not offering it at all — so the flag
 * is DERIVED from build configuration rather than being a literal that can be
 * flipped on its own and drift from the server.
 *
 * `appleAuthEnabled` is stubbed true here: with a hardcoded `apple: false` the
 * first assertion fails, which is exactly the regression worth catching.
 */
jest.mock('~/constants/config', () => ({
  appConfig: { appleAuthEnabled: true },
  dojo: {},
  QUERY_STALE_TIME: { realtime: 1, standard: 1, static: 1 },
}));

describe('authProviders', () => {
  it('offers Apple when the build says the provider is configured', () => {
    expect(authProviders.apple).toBe(true);
  });

  it('leaves Google enabled', () => {
    expect(authProviders.google).toBe(true);
  });

  it('keeps phone sign-in off — no Twilio credentials exist for the project', () => {
    expect(authProviders.phone).toBe(false);
  });
});
