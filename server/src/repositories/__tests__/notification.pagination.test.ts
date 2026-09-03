import { describe, expect, it, vi } from 'vitest';

/**
 * Keyset pagination over the real repository code.
 *
 * The fake client below holds more rows than a single PostgREST response can
 * return (`max_rows = 200`) and honours `order`/`limit`/`gt`, so this exercises
 * the actual cursor logic rather than a mocked-out result. The bug it guards
 * against is the original one: a single unordered `select` came back holding
 * 200 arbitrary rows and reported success, and everyone past them was silently
 * never notified.
 */

const h = vi.hoisted(() => {
  const TOTAL = 501;
  const ROWS = Array.from({ length: TOTAL }, (_, i) => ({
    profile_id: `p-${String(i).padStart(4, '0')}`,
    push_token: `tok-${i}`,
    events: true,
    bookings: true,
    weekly_digest: true,
  }));
  /**
   * A stand-in for PostgREST that honours `order`/`limit`/`gt` and caps every
   * response at `max_rows`, so the repository's real cursor logic is exercised.
   *
   * A FRESH builder per `from()`, because each query carries its own cursor —
   * sharing one would let state leak between queries in a way the real client
   * never does.
   */
  const MAX_ROWS = 200;
  const makeClient = () => ({
    from: () => {
      let cursor: string | null = null;
      let size = MAX_ROWS;
      const builder: Record<string, unknown> = {
        select: () => builder,
        not: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: (n: number) => {
          size = Math.min(n, MAX_ROWS);
          return builder;
        },
        gt: (_column: string, value: string) => {
          cursor = value;
          return builder;
        },
        returns: async () => {
          const after = cursor;
          const start = after === null ? 0 : ROWS.findIndex((row) => row.profile_id > after);
          const slice = start < 0 ? [] : ROWS.slice(start, start + size);
          return { data: slice, error: null };
        },
      };
      return builder;
    },
  });
  return { ROWS, makeClient };
});

vi.mock('../../config/supabase.js', () => ({
  adminClient: h.makeClient(),
  userClient: () => h.makeClient(),
}));

const { notificationRepository } = await import('../notification.repository.js');

async function walk(): Promise<{ ids: string[]; pages: number[] }> {
  const ids: string[] = [];
  const pages: number[] = [];
  for await (const page of notificationRepository.audiencePages('weekly_digest')) {
    pages.push(page.length);
    for (const row of page) ids.push(row.profile_id);
  }
  return { ids, pages };
}

describe('audiencePages walks the whole audience', () => {
  it('reaches every recipient past the 200-row ceiling', async () => {
    const { ids } = await walk();

    // 501 rows behind a 200-row response cap — the case that silently truncated.
    expect(ids).toHaveLength(501);
  });

  it('returns each recipient exactly once', async () => {
    const { ids } = await walk();

    expect(new Set(ids).size).toBe(501);
  });

  it('skips nobody: the walk is the full ordered set', async () => {
    const { ids } = await walk();

    expect(ids).toEqual([...ids].sort());
    expect(ids[0]).toBe('p-0000');
    expect(ids[ids.length - 1]).toBe('p-0500');
  });

  it('reads in bounded pages rather than one unbounded query', async () => {
    const { pages } = await walk();

    // 100 at a time: comfortably under `max_rows`, and exactly Expo's batch.
    expect(Math.max(...pages)).toBeLessThanOrEqual(100);
    expect(pages.length).toBeGreaterThan(1);
  });
});
