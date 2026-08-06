import { api, request } from '../client';
import { ApiError } from '../errors';
import { supabase } from '~/services/supabase';

jest.mock('~/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: 'token-1' } } })),
      refreshSession: jest.fn(async () => ({
        data: { session: { access_token: 'token-2' } },
        error: null,
      })),
    },
  },
}));

/**
 * The one HTTP client.
 *
 * Every cross-cutting concern in the app lives here — bearer token, refresh on
 * 401, timeout, retry, error normalisation — so these are the tests that stand
 * between a transient network blip and a red error state on a member's screen.
 */

/**
 * A typed `fetch` double.
 *
 * Declared with the real signature rather than `jest.fn()` so reading
 * `mock.calls[0][1].headers` stays type-checked — an untyped mock widens the
 * call tuple to `never` and the assertions below would silently stop meaning
 * anything.
 */
type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

function mockFetch(implementation: () => Promise<Response>): FetchMock {
  const fetchMock = jest.fn(implementation) as unknown as FetchMock;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const ok = (data: unknown, init: Partial<Response> = {}) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers({ 'x-request-id': 'req-1' }),
    json: async () => ({ data }),
    ...init,
  }) as Response;

const fail = (status: number, body: unknown) =>
  ({
    ok: false,
    status,
    headers: new Headers({ 'x-request-id': 'req-1' }),
    json: async () => body,
  }) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: { access_token: 'token-1' } } } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('request', () => {
  it('unwraps the data envelope', async () => {
    globalThis.fetch = jest.fn(async () => ok({ id: 'evt-1' })) as never;

    await expect(api.get<{ id: string }>('/events/1')).resolves.toEqual({ id: 'evt-1' });
  });

  it('attaches the bearer token', async () => {
    const fetchMock = mockFetch(async () => ok([]));

    await api.get('/me');

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-1');
  });

  it('omits the token when the caller asks for anonymous', async () => {
    const fetchMock = mockFetch(async () => ok([]));

    await request('/plans', { anonymous: true });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('repeats an array query parameter rather than joining it', async () => {
    const fetchMock = mockFetch(async () => ok([]));

    await request('/members', { query: { skills: ['Rust', 'iOS'] } });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    // The directory validator normalises repeated keys into an array; a joined
    // "Rust,iOS" would be read as one skill.
    expect(url).toContain('skills=Rust');
    expect(url).toContain('skills=iOS');
  });

  it('returns undefined for a 204 rather than parsing an empty body', async () => {
    globalThis.fetch = jest.fn(async () => ok(undefined, { status: 204 })) as never;

    await expect(api.delete('/bookings/1')).resolves.toBeUndefined();
  });

  it('maps an error envelope onto ApiError, preserving the code', async () => {
    globalThis.fetch = jest.fn(async () =>
      fail(409, {
        error: {
          code: 'slot_taken',
          message: 'Someone just took that slot.',
          requestId: 'req-1',
          retryable: false,
        },
      }),
    ) as never;

    // Screens branch on `code`, never on the status or the message, so copy
    // changes on the server cannot break error handling on the device.
    await expect(api.post('/bookings')).rejects.toMatchObject({
      code: 'slot_taken',
      status: 409,
      requestId: 'req-1',
    });
  });

  it('falls back to a readable message when the body is not the envelope', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => {
        throw new Error('not json');
      },
    })) as never;

    // A proxy returning an HTML 502 must not surface as a JSON parse crash.
    await expect(request('/events', { retry: false })).rejects.toMatchObject({
      code: 'internal_error',
      status: 502,
    });
  });

  /**
   * A token can expire between `getSession` handing it over and the server
   * checking it. Refreshing and replaying once turns that race into a
   * successful request rather than a trip to the sign-in screen.
   */
  it('refreshes once on a 401 and replays the request', async () => {
    const fetchMock = mockFetch(async () => ok({}));
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(
        fail(401, {
          error: { code: 'unauthorized', message: 'Sign in.', requestId: 'r', retryable: false },
        }),
      )
      .mockResolvedValueOnce(ok({ id: 'me' }));

    await expect(api.get('/me')).resolves.toEqual({ id: 'me' });

    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up when the refresh itself fails — the session really is gone', async () => {
    globalThis.fetch = jest.fn(async () =>
      fail(401, {
        error: { code: 'unauthorized', message: 'Sign in.', requestId: 'r', retryable: false },
      }),
    ) as never;
    jest
      .mocked(supabase.auth.refreshSession)
      .mockResolvedValue({ data: { session: null }, error: new Error('expired') } as never);

    await expect(api.get('/me')).rejects.toMatchObject({ code: 'session_expired' });
  });

  it('retries a retryable failure and succeeds', async () => {
    const fetchMock = mockFetch(async () => ok({}));
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(
        fail(503, {
          error: {
            code: 'upstream_unavailable',
            message: 'Down.',
            requestId: 'r',
            retryable: true,
          },
        }),
      )
      .mockResolvedValueOnce(ok({ ok: true }));

    await expect(api.get('/occupancy')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a non-idempotent write by default', async () => {
    const fetchMock = mockFetch(async () =>
      fail(500, {
        error: { code: 'internal_error', message: 'Boom.', requestId: 'r', retryable: true },
      }),
    );

    // Replaying a POST that creates a booking would create two.
    await expect(api.post('/bookings')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a write only when the caller opts in', async () => {
    const fetchMock = mockFetch(async () => ok({}));
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(
        fail(503, {
          error: {
            code: 'upstream_unavailable',
            message: 'Down.',
            requestId: 'r',
            retryable: true,
          },
        }),
      )
      .mockResolvedValueOnce(ok({ paymentId: 'p1' }));

    // The payment intents are idempotency-keyed, which is what makes this safe.
    await expect(
      request('/payments/donation-intent', { method: 'POST', retry: true }),
    ).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a network failure as retryable', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;

    await expect(request('/events', { retry: false })).rejects.toMatchObject({
      code: 'network_error',
      retryable: true,
    });
  });
});
