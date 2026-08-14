import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `event_feed` is a `security_invoker` view, so the service-role client used to
 * serve signed-out visitors bypasses RLS entirely. Every guarantee the policies
 * express — published only, and not members-only — has to be restated in the
 * query for that one path, and a missing restatement is invisible until someone
 * marks an event members-only.
 */
const h = vi.hoisted(() => {
  const filters: Array<{ client: string; column: string; value: unknown }> = [];

  const makeClient = (name: string) => {
    const builder = {
      select: () => builder,
      order: () => builder,
      range: () => builder,
      gte: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push({ client: name, column, value });
        return builder;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      returns: async () => ({ data: [], error: null }),
    };
    return { from: () => builder };
  };

  return { filters, makeClient };
});

vi.mock('../../config/supabase.js', () => ({
  adminClient: h.makeClient('admin'),
  userClient: () => h.makeClient('user'),
}));

const { eventRepository } = await import('../event.repository.js');

const membersOnlyFilter = () =>
  h.filters.find((f) => f.column === 'members_only' && f.value === false);

beforeEach(() => {
  h.filters.length = 0;
});

describe('eventRepository.findById', () => {
  it('hides members-only events from a signed-out caller', async () => {
    await eventRepository.findById(null, 'some-id');

    // The leak this guards: the feed excluded members-only events while the
    // detail endpoint served them in full to anyone who asked for one by id.
    expect(membersOnlyFilter()).toBeDefined();
  });

  it('leaves a signed-in caller to RLS rather than filtering in the query', async () => {
    await eventRepository.findById('token', 'some-id');

    // A member is entitled to members-only events; the policies decide, and a
    // blanket filter here would hide them from the people they are for.
    expect(membersOnlyFilter()).toBeUndefined();
  });
});

describe('eventRepository.list', () => {
  it('hides members-only events from a signed-out caller', async () => {
    await eventRepository.list(null, { limit: 20, offset: 0 });

    expect(membersOnlyFilter()).toBeDefined();
  });

  it('leaves a signed-in caller to RLS', async () => {
    await eventRepository.list('token', { limit: 20, offset: 0 });

    expect(membersOnlyFilter()).toBeUndefined();
  });
});
