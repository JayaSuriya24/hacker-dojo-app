import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

/**
 * Route tests.
 *
 * These assert the middleware chain, not the business logic — the services have
 * their own suites. What is checked here is the thing that is easy to get wrong
 * and invisible in a unit test: which routes are reachable by whom, whether a
 * write is rate limited, and whether the error envelope is the shape the mobile
 * client parses.
 *
 * Auth is stubbed at the repository boundary rather than at the middleware, so
 * the real `requireAuth` / `requireActiveMembership` / `requireRole` chain runs.
 * Stubbing the middleware would test nothing.
 */

const MEMBER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'ana@reyes.dev',
};

const STEWARD = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'steward@hackerdojo.org',
};

/** Which user, if any, the stubbed token verifier should resolve to. */
let currentUser: { id: string; email: string } | null = null;
let currentRole: 'guest' | 'member' | 'steward' | 'admin' = 'member';
let hasMembership = true;

vi.mock('../../repositories/auth.repository.js', () => ({
  authRepository: {
    getUserFromToken: vi.fn(async () => currentUser),
  },
}));

vi.mock('../../repositories/profile.repository.js', () => ({
  profileRepository: {
    findById: vi.fn(async () =>
      currentUser ? { ...currentUser, role: currentRole, full_name: 'Ana Reyes' } : null,
    ),
    hasActiveMembership: vi.fn(async () => hasMembership),
    plans: vi.fn(async () => []),
    planById: vi.fn(async () => null),
    membership: vi.fn(async () => null),
    directory: vi.fn(async () => []),
    directoryEntry: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    notificationPreferences: vi.fn(async () => ({
      profile_id: MEMBER.id,
      events: true,
      bookings: true,
      weekly_digest: false,
      push_token: null,
      push_token_at: null,
      updated_at: '',
    })),
    updateNotificationPreferences: vi.fn(async () => ({
      profile_id: MEMBER.id,
      events: false,
      bookings: true,
      weekly_digest: false,
      push_token: null,
      push_token_at: null,
      updated_at: '',
    })),
  },
}));

vi.mock('../../repositories/booking.repository.js', () => ({
  resourceRepository: { list: vi.fn(async () => []), findById: vi.fn(), busyRanges: vi.fn() },
  bookingRepository: { listForProfile: vi.fn(async () => []) },
  sessionRepository: { liveForProfile: vi.fn(async () => null) },
}));

vi.mock('../../repositories/staff.repository.js', () => ({
  staffRepository: {
    dashboard: vi.fn(async () => ({
      pendingTours: 1,
      pendingEventRequests: 0,
      pendingApplications: 0,
      pendingDocuments: 2,
      activeMembers: 40,
      onFloor: 7,
    })),
    queue: vi.fn(async () => []),
  },
  occupancyRepository: { sample: vi.fn(), prune: vi.fn(), current: vi.fn(async () => []) },
}));

/**
 * Storage and document rows. Stubbed at the repository boundary like everything
 * else here, so the real controller, validator and service still run — the
 * upload tests below are about the body parser and would prove nothing if the
 * handler itself were mocked out.
 */
vi.mock('../../repositories/storage.repository.js', () => ({
  storageRepository: {
    uploadDocument: vi.fn(async () => `${MEMBER.id}/student-id.jpg`),
    uploadAvatar: vi.fn(async () => `${MEMBER.id}/portrait.jpg`),
    publicAvatarUrl: vi.fn(() => 'https://storage.test/portrait.jpg'),
    signDocument: vi.fn(async () => 'https://storage.test/signed'),
    removeAvatar: vi.fn(async () => undefined),
    removeDocument: vi.fn(async () => undefined),
  },
  documentRepository: {
    create: vi.fn(async () => ({
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'student_id',
      file_name: 'student-id.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 1_050_000,
      status: 'submitted',
      review_note: null,
      created_at: '2026-08-14T00:00:00Z',
      reviewed_at: null,
      storage_path: `${MEMBER.id}/student-id.jpg`,
    })),
    listForProfile: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
    review: vi.fn(async () => ({})),
    listPending: vi.fn(async () => []),
  },
}));

vi.mock('../../services/account.service.js', () => ({
  accountService: {
    deleteOwnAccount: vi.fn(async () => ({
      subscriptionId: 'sub_live',
      storageObjectsRemoved: 2,
      toursRemoved: 0,
      storageFailures: [],
    })),
  },
}));

const { accountService } = await import('../../services/account.service.js');
const { AppError } = await import('../../utils/errors.js');
const { createApp } = await import('../../app.js');
const app = createApp();

beforeEach(() => {
  currentUser = MEMBER;
  currentRole = 'member';
  hasMembership = true;
  vi.mocked(accountService.deleteOwnAccount).mockClear();
  vi.mocked(accountService.deleteOwnAccount).mockResolvedValue({
    subscriptionId: 'sub_live',
    storageObjectsRemoved: 2,
    toursRemoved: 0,
    storageFailures: [],
  });
});

describe('health', () => {
  it('answers without auth', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('authentication', () => {
  it('refuses an unauthenticated request to a protected route', async () => {
    const response = await request(app).get('/v1/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('returns the documented error envelope', async () => {
    const response = await request(app).get('/v1/me');

    // The mobile client parses exactly this shape and branches on `code`.
    expect(response.body).toMatchObject({
      error: {
        code: expect.any(String),
        message: expect.any(String),
        requestId: expect.any(String),
        retryable: expect.any(Boolean),
      },
    });
  });

  it('refuses a token the auth provider does not recognise', async () => {
    currentUser = null;

    const response = await request(app).get('/v1/me').set('Authorization', 'Bearer nope');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('session_expired');
  });

  it('lets an anonymous caller through on a public route', async () => {
    const response = await request(app).get('/v1/resources');
    expect(response.status).toBe(200);
  });
});

describe('membership gating', () => {
  it('refuses the directory to a signed-in guest', async () => {
    hasMembership = false;
    currentRole = 'guest';

    const response = await request(app).get('/v1/members').set('Authorization', 'Bearer t');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('membership_required');
  });

  it('allows the directory to an active member', async () => {
    const response = await request(app).get('/v1/members').set('Authorization', 'Bearer t');
    expect(response.status).toBe(200);
  });

  /**
   * The Wi-Fi PIN is the most consequential member-only credential this API
   * still issues, so it is checked explicitly rather than assumed to be covered
   * by the pattern above. It took over that role from the door unlock, which
   * this API no longer serves.
   */
  it('refuses the Wi-Fi credential to a lapsed member', async () => {
    hasMembership = false;

    const response = await request(app).get('/v1/me/wifi').set('Authorization', 'Bearer t');

    expect(response.status).toBe(403);
  });

  /**
   * Physical access belongs to Kisi. These endpoints existed and were removed,
   * and this asserts they stay removed — a re-added door route would be a
   * second authorisation path that cannot actually move the lock, which is the
   * exact drift the migration to Kisi was meant to end.
   */
  it.each(['/v1/me/key', '/v1/me/key/history'])('no longer serves %s', async (path) => {
    const response = await request(app).get(path).set('Authorization', 'Bearer t');

    expect(response.status).toBe(404);
  });

  it('no longer serves the unlock endpoint', async () => {
    const response = await request(app)
      .post('/v1/me/key/unlock')
      .set('Authorization', 'Bearer t')
      .send({});

    expect(response.status).toBe(404);
  });
});

describe('staff gating', () => {
  it('refuses a member the staff dashboard', async () => {
    const response = await request(app).get('/v1/staff/dashboard').set('Authorization', 'Bearer t');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
  });

  it('allows a steward', async () => {
    currentUser = STEWARD;
    currentRole = 'steward';

    const response = await request(app).get('/v1/staff/dashboard').set('Authorization', 'Bearer t');

    expect(response.status).toBe(200);
    expect(response.body.data.pendingDocuments).toBe(2);
  });

  it('allows an admin', async () => {
    currentUser = STEWARD;
    currentRole = 'admin';

    const response = await request(app).get('/v1/staff/queue').set('Authorization', 'Bearer t');

    expect(response.status).toBe(200);
  });
});

describe('validation', () => {
  it('rejects an unknown body key rather than dropping it silently', async () => {
    const response = await request(app)
      .patch('/v1/me')
      .set('Authorization', 'Bearer t')
      .send({ full_name: 'Ana Reyes', role: 'admin' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('reports issues per field, so the form can highlight the input', async () => {
    const response = await request(app)
      .patch('/v1/me')
      .set('Authorization', 'Bearer t')
      .send({ full_name: 'x' });

    expect(response.status).toBe(422);
    expect(response.body.error.issues[0]).toMatchObject({
      path: expect.stringContaining('full_name'),
    });
  });

  it('rejects a malformed uuid in a path parameter', async () => {
    const response = await request(app)
      .post('/v1/events/not-a-uuid/rsvp')
      .set('Authorization', 'Bearer t');

    expect(response.status).toBe(422);
  });
});

/**
 * Upload body limits.
 *
 * The global JSON parser is 256kb, and a photographed student ID is measured in
 * megabytes — so every real verification document was rejected by Express
 * before the route it was addressed to ever ran, and body-parser's 413 matched
 * no branch in the error normaliser and surfaced as a generic 500. These lock
 * down both halves: the upload routes admit a real document, and an oversized
 * body is a 4xx that says so.
 */
describe('upload body limits', () => {
  /** Valid base64 characters; length divisible by 4 so it decodes cleanly. */
  const base64Of = (chars: number) => 'A'.repeat(chars);

  /** ~1.05MB decoded — four times over the old global limit, well under 20MB. */
  const ONE_MEGABYTE_DOCUMENT = base64Of(1_400_000);

  const document = (content: string) => ({
    kind: 'student_id',
    fileName: 'student-id.jpg',
    mimeType: 'image/jpeg',
    content,
  });

  it('accepts a ~1MB document that the 256kb global limit used to reject', async () => {
    const response = await request(app)
      .post('/v1/me/documents')
      .set('Authorization', 'Bearer t')
      .send(document(ONE_MEGABYTE_DOCUMENT));

    expect(response.status).toBe(201);
  });

  it('answers a 4xx — never a 500 — when a document exceeds the ceiling', async () => {
    // Past the document parser's limit (20MB decoded, so ~26.7MB encoded).
    const response = await request(app)
      .post('/v1/me/documents')
      .set('Authorization', 'Bearer t')
      .send(document(base64Of(28_000_000)));

    expect(response.status).toBe(413);
    expect(response.status).toBeLessThan(500);
    expect(response.body.error.code).toBe('bad_request');
    // Names the ceiling that was hit rather than saying "something went wrong".
    expect(response.body.error.message).toMatch(/larger than 20MB/);
    expect(response.body.error.retryable).toBe(false);
  });

  it('sizes the avatar ceiling from its own constant, not the document one', async () => {
    // Over MAX_AVATAR_BYTES (2MB) but far under the document limit.
    const response = await request(app)
      .post('/v1/me/avatar')
      .set('Authorization', 'Bearer t')
      .send({ fileName: 'portrait.jpg', mimeType: 'image/jpeg', content: base64Of(4_000_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.message).toMatch(/larger than 2MB/);
  });

  it('still accepts an ordinary avatar', async () => {
    const response = await request(app)
      .post('/v1/me/avatar')
      .set('Authorization', 'Bearer t')
      .send({ fileName: 'portrait.jpg', mimeType: 'image/jpeg', content: base64Of(2000) });

    expect(response.status).toBe(201);
  });

  it('keeps every other route on the 256kb global limit', async () => {
    const response = await request(app)
      .patch('/v1/me')
      .set('Authorization', 'Bearer t')
      .send({ bio: 'x'.repeat(300_000) });

    // Rejected by the global parser, and still a 4xx rather than a 500.
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('bad_request');
  });

  it('still requires authentication on the document route', async () => {
    currentUser = null;

    const response = await request(app)
      .post('/v1/me/documents')
      .send(document(ONE_MEGABYTE_DOCUMENT));

    expect(response.status).toBe(401);
  });

  it('still runs document validation on a body the parser admitted', async () => {
    const response = await request(app)
      .post('/v1/me/documents')
      .set('Authorization', 'Bearer t')
      // A larger body than the old limit allowed, so this reaches the validator
      // — which must still refuse the MIME type rather than wave it through.
      .send({ ...document(ONE_MEGABYTE_DOCUMENT), mimeType: 'image/gif' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_failed');
  });
});

/**
 * Account deletion.
 *
 * The security property is the SHAPE of the route: it takes no id, anywhere.
 * A member cannot ask to delete someone else because there is no field in which
 * to name them — which is stronger than checking that the field matches.
 */
describe('account deletion', () => {
  it('refuses an unauthenticated deletion', async () => {
    currentUser = null;

    const response = await request(app).delete('/v1/me');

    expect(response.status).toBe(401);
    expect(accountService.deleteOwnAccount).not.toHaveBeenCalled();
  });

  it('deletes the account the TOKEN identifies, not one named in the request', async () => {
    const victim = '99999999-9999-4999-8999-999999999999';

    const response = await request(app)
      .delete('/v1/me')
      .set('Authorization', 'Bearer t')
      // Every channel a caller could try to smuggle another id through.
      .query({ userId: victim, id: victim })
      .send({ userId: victim, profileId: victim, id: victim });

    expect(response.status).toBe(200);

    // The service is handed the authenticated user, and nothing else.
    const [passed] = vi.mocked(accountService.deleteOwnAccount).mock.calls[0] as [{ id: string }];
    expect(passed.id).toBe(MEMBER.id);
    expect(passed.id).not.toBe(victim);
  });

  it('returns what the deletion actually did', async () => {
    const response = await request(app).delete('/v1/me').set('Authorization', 'Bearer t');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      subscriptionId: 'sub_live',
      storageObjectsRemoved: 2,
    });
  });

  it('surfaces a billing failure as a 4xx/5xx rather than a silent success', async () => {
    vi.mocked(accountService.deleteOwnAccount).mockRejectedValueOnce(
      AppError.upstream('We could not reach billing to cancel your membership.'),
    );

    const response = await request(app).delete('/v1/me').set('Authorization', 'Bearer t');

    expect(response.status).toBe(503);
    expect(response.body.error.message).toMatch(/could not reach billing/);
  });

  it('is rate limited like the other consequential actions', async () => {
    const send = () => request(app).delete('/v1/me').set('Authorization', 'Bearer t');

    // `sensitiveLimiter` allows 10 a minute.
    const responses = await Promise.all(Array.from({ length: 14 }, send));
    const limited = responses.filter((response) => response.status === 429);

    expect(limited.length).toBeGreaterThan(0);
  });
});

describe('rate limiting', () => {
  /**
   * `PATCH /me/notifications` was the one mutating route with no limiter. Every
   * write now carries one, and this test is what keeps that true — a new route
   * added without a limiter fails the equivalent assertion.
   */
  it('limits PATCH /me/notifications', async () => {
    const send = () =>
      request(app)
        .patch('/v1/me/notifications')
        .set('Authorization', 'Bearer t')
        .send({ events: false });

    // The mutation limiter allows 30 a minute; 40 attempts must trip it.
    const responses = await Promise.all(Array.from({ length: 40 }, send));
    const limited = responses.filter((response) => response.status === 429);

    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]?.body.error.code).toBe('rate_limited');
  });
});

describe('not found', () => {
  it('answers an unknown path with the same envelope', async () => {
    const response = await request(app).get('/v1/nope');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });
});
