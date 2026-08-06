import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessService } from '../access.service.js';
import { accessRepository } from '../../repositories/access.repository.js';
import { AppError } from '../../utils/errors.js';
import type { DoorCredentialRow } from '../../types/database.js';

vi.mock('../../repositories/access.repository.js', () => ({
  accessRepository: {
    issueCredential: vi.fn(),
    findCredential: vi.fn(),
    log: vi.fn(),
    recentFor: vi.fn(),
    attemptsSince: vi.fn(),
  },
}));

const PROFILE = '22222222-2222-4222-8222-222222222222';

const member = {
  id: PROFILE,
  email: 'ana@reyes.dev',
  role: 'member' as const,
  accessToken: 'token',
  isActiveMember: true,
};

const guest = { ...member, isActiveMember: false, role: 'guest' as const };

const credential: DoorCredentialRow = {
  id: '33333333-3333-4333-8333-333333333333',
  profile_id: PROFILE,
  key_id: 'A7-2291-MV',
  active: true,
  issued_at: '2026-01-01T00:00:00.000Z',
  revoked_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accessRepository.findCredential).mockResolvedValue(credential);
  vi.mocked(accessRepository.attemptsSince).mockResolvedValue(0);
  vi.mocked(accessRepository.log).mockResolvedValue({
    id: 1,
    profile_id: PROFILE,
    key_id: credential.key_id,
    granted: true,
    reason: null,
    device_hint: null,
    created_at: '2026-08-05T10:00:00.000Z',
  });
});

/**
 * The door.
 *
 * What this replaced was a client-side animation that reached "Access granted"
 * without contacting anything, so a lapsed member got the same green tick as a
 * paid-up one and nothing was recorded either way. Every assertion below is
 * about a decision the server now makes and an audit row it now writes.
 */
describe('accessService.unlock', () => {
  it('grants an active member with a live credential', async () => {
    const result = await accessService.unlock(member, {});

    expect(result.granted).toBe(true);
    expect(result.keyId).toBe('A7-2291-MV');
    expect(accessRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ granted: true, reason: null }),
    );
  });

  it('refuses a member whose membership lapsed, and records why', async () => {
    await expect(accessService.unlock(guest, {})).rejects.toMatchObject({
      code: 'membership_required',
    });

    expect(accessRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ granted: false, reason: 'membership_inactive' }),
    );
  });

  it('refuses someone with no credential yet', async () => {
    vi.mocked(accessRepository.findCredential).mockResolvedValue(null);

    await expect(accessService.unlock(member, {})).rejects.toBeInstanceOf(AppError);

    expect(accessRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ granted: false, reason: 'no_credential', keyId: 'unknown' }),
    );
  });

  it('refuses a revoked credential', async () => {
    vi.mocked(accessRepository.findCredential).mockResolvedValue({
      ...credential,
      active: false,
      revoked_at: '2026-06-01T00:00:00.000Z',
    });

    await expect(accessService.unlock(member, {})).rejects.toMatchObject({ code: 'forbidden' });

    expect(accessRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ granted: false, reason: 'credential_revoked' }),
    );
  });

  /**
   * The second limiter, derived from the audit log rather than from process
   * memory — an in-process counter resets on every deploy, and a badge that
   * fires forty times a minute is a stuck button or a replay either way.
   */
  it('refuses a badge firing faster than a human could', async () => {
    vi.mocked(accessRepository.attemptsSince).mockResolvedValue(6);

    await expect(accessService.unlock(member, {})).rejects.toMatchObject({
      code: 'rate_limited',
    });

    expect(accessRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ granted: false, reason: 'rate_limited' }),
    );
  });

  it('bounds the device hint it writes to the audit row', async () => {
    await accessService.unlock(member, { deviceHint: 'x'.repeat(400) });

    const call = vi.mocked(accessRepository.log).mock.calls[0]?.[0];
    expect(call?.deviceHint?.length).toBe(120);
  });

  it('logs every refusal, so a locked-out member leaves a trace', async () => {
    vi.mocked(accessRepository.findCredential).mockResolvedValue(null);

    await accessService.unlock(member, {}).catch(() => undefined);

    expect(accessRepository.log).toHaveBeenCalledOnce();
  });
});

describe('accessService.digitalKey', () => {
  it('issues on first request', async () => {
    vi.mocked(accessRepository.issueCredential).mockResolvedValue(credential);

    const key = await accessService.digitalKey(member);

    expect(key).toEqual({ keyId: 'A7-2291-MV', active: true, issuedAt: credential.issued_at });
  });

  it('refuses a guest — there is no key to issue', async () => {
    await expect(accessService.digitalKey(guest)).rejects.toMatchObject({
      code: 'membership_required',
    });

    expect(accessRepository.issueCredential).not.toHaveBeenCalled();
  });
});
