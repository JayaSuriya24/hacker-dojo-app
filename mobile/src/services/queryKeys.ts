/**
 * Query keys, in one place.
 *
 * Every key is built from this factory so invalidation is precise. Scattering
 * literal arrays across features is how you end up with a mutation that
 * invalidates `['events']` while the list is cached under `['events', 'list',
 * filters]` and nothing refetches.
 *
 * The hierarchy is deliberate: invalidating `events.all()` clears every event
 * query, `events.lists()` clears just the lists and leaves detail caches warm.
 */
export const queryKeys = {
  me: {
    all: () => ['me'] as const,
    profile: () => ['me', 'profile'] as const,
    notifications: () => ['me', 'notifications'] as const,
    bookings: () => ['me', 'bookings'] as const,
    session: () => ['me', 'session'] as const,
  },

  events: {
    all: () => ['events'] as const,
    lists: () => ['events', 'list'] as const,
    list: (filters: { category?: string; today?: boolean }) => ['events', 'list', filters] as const,
    detail: (id: string) => ['events', 'detail', id] as const,
  },

  resources: {
    all: () => ['resources'] as const,
    list: (kind?: string) => ['resources', 'list', kind ?? 'all'] as const,
    availability: (resourceId: string, day: string) =>
      ['resources', 'availability', resourceId, day] as const,
  },

  community: {
    all: () => ['community'] as const,
    directory: (filters: { search?: string; skills?: string[]; here?: boolean }) =>
      ['community', 'directory', filters] as const,
    member: (id: string) => ['community', 'member', id] as const,
    startups: () => ['community', 'startups'] as const,
  },

  dojo: {
    plans: () => ['dojo', 'plans'] as const,
    programs: () => ['dojo', 'programs'] as const,
    about: () => ['dojo', 'about'] as const,
    occupancy: () => ['dojo', 'occupancy'] as const,
  },
} as const;
