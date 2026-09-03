import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList, unwrapMaybe } from '../utils/postgrest.js';
import { translatePostgrestError } from '../utils/postgrest.js';
import type { StartupRow } from '../types/database.js';

/**
 * Startups.
 *
 * Reads run as the service role for the same reason they always did: the list
 * is public, RLS on the table already says so, and going through the admin
 * client keeps the anonymous path from needing a token at all.
 *
 * WRITES also run as the service role, which bypasses RLS — so the staff check
 * that actually protects them is `staffOnly` on the route, not the policies in
 * the migration. Those policies exist for anything reaching the table with a
 * member's own token. Neither is redundant: one guards this API, the other
 * guards everything else.
 */

export interface StartupWrite {
  name: string;
  slug: string;
  mark: string;
  tagline: string;
  stage: string;
  foundedYear: string;
  hiring: boolean;
  website: string | null;
  sortOrder: number;
}

/** Snake-cased for the table; the service speaks camel. */
function toRow(input: Partial<StartupWrite>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row['name'] = input.name;
  if (input.slug !== undefined) row['slug'] = input.slug;
  if (input.mark !== undefined) row['mark'] = input.mark;
  if (input.tagline !== undefined) row['tagline'] = input.tagline;
  if (input.stage !== undefined) row['stage'] = input.stage;
  if (input.foundedYear !== undefined) row['founded_year'] = input.foundedYear;
  if (input.hiring !== undefined) row['hiring'] = input.hiring;
  if (input.website !== undefined) row['website'] = input.website;
  if (input.sortOrder !== undefined) row['sort_order'] = input.sortOrder;
  return row;
}

export const startupRepository = {
  /**
   * The whole list, in display order.
   *
   * Unchanged from what `contentRepository.startups()` did — same query, same
   * ordering — so the public endpoint behaves exactly as before.
   */
  async list(): Promise<StartupRow[]> {
    return unwrapList(
      await adminClient.from('startups').select('*').order('sort_order').returns<StartupRow[]>(),
      'Could not load startups.',
    );
  },

  async findById(id: string): Promise<StartupRow | null> {
    return unwrapMaybe(
      await adminClient.from('startups').select('*').eq('id', id).maybeSingle<StartupRow>(),
      'Could not load that startup.',
    );
  },

  async findBySlug(slug: string): Promise<StartupRow | null> {
    return unwrapMaybe(
      await adminClient.from('startups').select('*').eq('slug', slug).maybeSingle<StartupRow>(),
      'Could not load that startup.',
    );
  },

  /**
   * Search by name, tagline or stage.
   *
   * `mark` is excluded deliberately: it is a two-letter monogram, so including
   * it would make almost any short query match almost every row.
   */
  async search(term: string): Promise<StartupRow[]> {
    const safe = term.replace(/[%,()]/g, ' ').trim();
    if (!safe) return this.list();

    return unwrapList(
      await adminClient
        .from('startups')
        .select('*')
        .or(`name.ilike.%${safe}%,tagline.ilike.%${safe}%,stage.ilike.%${safe}%`)
        .order('sort_order')
        .returns<StartupRow[]>(),
      'Could not search startups.',
    );
  },

  /*
   * The writes run as the CALLER, not as the service role.
   *
   * `startups_insert_staff` / `_update_staff` / `_delete_staff` gate these on
   * `is_staff()`, and the service role bypasses RLS — so on `adminClient` those
   * three policies never ran, and `requireRole` in the route chain was the only
   * thing standing between a routing mistake and an open write endpoint. The
   * comment above `staffOnly` promises two independent gates; this is what makes
   * the second one real. Reads stay on `adminClient`: `startups_select_all` is
   * `using (true)`, so there is nothing for RLS to decide.
   */
  async create(accessToken: string, input: StartupWrite): Promise<StartupRow> {
    return unwrap(
      await userClient(accessToken)
        .from('startups')
        .insert(toRow(input))
        .select('*')
        .single<StartupRow>(),
      'Could not create that startup.',
    );
  },

  async update(
    accessToken: string,
    id: string,
    patch: Partial<StartupWrite>,
  ): Promise<StartupRow | null> {
    return unwrapMaybe(
      await userClient(accessToken)
        .from('startups')
        .update(toRow(patch))
        .eq('id', id)
        .select('*')
        .maybeSingle<StartupRow>(),
      'Could not update that startup.',
    );
  },

  async remove(accessToken: string, id: string): Promise<boolean> {
    const { data, error } = await userClient(accessToken)
      .from('startups')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle<{ id: string }>();

    if (error) throw translatePostgrestError(error, 'Could not remove that startup.');
    return Boolean(data);
  },

  /**
   * Write a new display order.
   *
   * One statement per row rather than a bulk upsert: an upsert would need every
   * column of every row restated, and a caller that sent a stale copy of a
   * startup alongside its new position would silently overwrite an edit made
   * in between. Only `sort_order` is touched.
   */
  async applyOrder(
    accessToken: string,
    entries: Array<{ id: string; sortOrder: number }>,
  ): Promise<void> {
    const client = userClient(accessToken);
    for (const entry of entries) {
      const { error } = await client
        .from('startups')
        .update({ sort_order: entry.sortOrder })
        .eq('id', entry.id);

      if (error) throw translatePostgrestError(error, 'Could not reorder the startups.');
    }
  },

  /** Ids that exist, for validating a reorder before any of it is applied. */
  async existingIds(): Promise<string[]> {
    const rows = await unwrapList(
      await adminClient.from('startups').select('id').returns<Array<{ id: string }>>(),
      'Could not load startups.',
    );
    return rows.map((row) => row.id);
  },
};
