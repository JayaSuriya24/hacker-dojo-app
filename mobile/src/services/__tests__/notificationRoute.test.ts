import { NOTIFICATION_HREF_KEY, notificationHref } from '../notificationRoute';

/**
 * Notification routing.
 *
 * The bug: the server sent `data: { route }` and this app read `data.href`, so
 * a delivered notification rendered, was tapped, and did nothing — no
 * navigation and no error. `href` is canonical; these fix that, and the second
 * block fixes the thing a naive implementation gets wrong instead, which is
 * navigating wherever a push payload says.
 */

describe('notificationHref — the canonical contract', () => {
  it('reads the canonical field', () => {
    expect(notificationHref({ href: '/(app)/(tabs)/book' })).toBe('/(app)/(tabs)/book');
  });

  it('exports the key so producers cannot misspell it', () => {
    expect(NOTIFICATION_HREF_KEY).toBe('href');
    expect(notificationHref({ [NOTIFICATION_HREF_KEY]: '/(app)/settings' })).toBe(
      '/(app)/settings',
    );
  });

  it('ignores the OLD server field rather than following it', () => {
    // `route` is the name that shipped broken. It is deliberately not honoured:
    // no server build still sends it, and accepting both is how two spellings
    // stay alive.
    expect(notificationHref({ route: '/(app)/(tabs)/events' })).toBeNull();
  });

  it('ignores `url`, which was never part of this app’s contract', () => {
    expect(notificationHref({ url: '/(app)/settings' })).toBeNull();
  });

  it('trims incidental whitespace', () => {
    expect(notificationHref({ href: '  /(app)/settings  ' })).toBe('/(app)/settings');
  });
});

describe('notificationHref — missing or unusable destinations', () => {
  it.each([
    ['no data at all', undefined],
    ['null data', null],
    ['a non-object payload', 'just a string'],
    ['an empty payload', {}],
    ['a non-string href', { href: 42 }],
  ])('returns null for %s', (_label, payload) => {
    expect(notificationHref(payload)).toBeNull();
  });

  it('treats a destination-less notification as ordinary, not an error', () => {
    // A membership renewal notice has no screen to open.
    expect(notificationHref({ title: 'Your membership renews soon' })).toBeNull();
  });
});

/**
 * The security boundary.
 *
 * This value arrives inside a push payload, so anyone who can send this device
 * a notification chooses it. `router.push` will happily accept something that
 * is not an in-app route.
 */
describe('notificationHref — refuses to leave the app', () => {
  it.each([
    ['an absolute https URL', 'https://evil.example/steal'],
    ['a custom scheme', 'hackerdojo://settings'],
    ['a javascript: payload', 'javascript:alert(1)'],
    ['a bare relative path', 'settings'],
    ['an empty string', ''],
  ])('rejects %s', (_label, href) => {
    expect(notificationHref({ href })).toBeNull();
  });

  it('rejects a PROTOCOL-RELATIVE URL — the open redirect', () => {
    // The subtle one: `startsWith('/')` is true, so a naive check lets this
    // through and the web target navigates off-origin.
    expect(notificationHref({ href: '//evil.example/steal' })).toBeNull();
    expect(notificationHref({ href: '///evil.example' })).toBeNull();
  });

  it('rejects backslash and embedded-scheme smuggling', () => {
    expect(notificationHref({ href: '/\\evil.example' })).toBeNull();
    expect(notificationHref({ href: '/https://evil.example' })).toBeNull();
    expect(notificationHref({ href: '/(app)/x?next=https://evil.example' })).toBeNull();
  });

  it('still allows the real destinations the server sends', () => {
    for (const href of [
      '/(app)/(tabs)/book',
      '/(app)/(tabs)/events',
      '/(app)/settings',
      '/(app)/event/2f1c8f7e-6a2b-4c1d-9e3f-0a1b2c3d4e5f',
      '/book',
    ]) {
      expect(notificationHref({ href })).toBe(href);
    }
  });
});
