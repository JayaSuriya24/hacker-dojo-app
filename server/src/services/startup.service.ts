import { startupRepository, type StartupWrite } from '../repositories/startup.repository.js';
import { AppError } from '../utils/errors.js';
import type { StartupRow } from '../types/database.js';

/**
 * Startups.
 *
 * This was a single read on `communityService` that turned six seeded rows into
 * JSON. It is now the module that owns them, but the public contract is
 * deliberately unchanged: `GET /v1/startups` returns the same shape, in
 * `sort_order`, to anyone — signed in or not. Everything added here is either
 * a new read or a staff-only write beside it.
 *
 * A startup is editorial content about the space, not member data. It has no
 * owner, no profile link, and no membership requirement to view. That is why
 * the list is public and why writes are staff-only rather than
 * author-scoped — there is no author.
 */

export interface StartupView {
  id: string;
  slug: string;
  name: string;
  mark: string;
  tagline: string;
  stage: string;
  foundedYear: string;
  hiring: boolean;
  website: string | null;
  sortOrder: number;
}

export interface StartupFilter {
  /** Only startups that are hiring, or only those that are not. */
  hiring?: boolean | undefined;
  /** Exact stage match, e.g. "Seed". Case-insensitive. */
  stage?: string | undefined;
}

function toView(row: StartupRow & { slug?: string }): StartupView {
  return {
    id: row.id,
    slug: row.slug ?? '',
    name: row.name,
    mark: row.mark,
    tagline: row.tagline,
    stage: row.stage,
    foundedYear: row.founded_year,
    hiring: row.hiring,
    website: row.website,
    sortOrder: row.sort_order,
  };
}

/**
 * `The New Thing!` -> `the-new-thing`.
 *
 * Matches the expression the migration used to backfill the existing rows, so
 * a startup created through the API is addressable the same way as one that
 * was seeded.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const startupService = {
  /** Every startup, in display order. The public list. */
  async getStartup(): Promise<StartupView[]> {
    return (await startupRepository.list()).map(toView);
  },

  async getStartupById(id: string): Promise<StartupView> {
    const row = await startupRepository.findById(id);
    if (!row) throw AppError.notFound('That startup is no longer listed.');
    return toView(row);
  },

  async getStartupBySlug(slug: string): Promise<StartupView> {
    const row = await startupRepository.findBySlug(slug);
    if (!row) throw AppError.notFound('That startup is no longer listed.');
    return toView(row);
  },

  /**
   * Resolve either form.
   *
   * The detail route takes one path segment and a uuid is a valid slug as far
   * as the URL is concerned, so the shape decides which lookup to run rather
   * than trying one and falling back — a fallback would turn a genuine 404 on
   * an id into a second query that also 404s, twice as slowly.
   */
  async getStartupByIdOrSlug(key: string): Promise<StartupView> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    return isUuid ? this.getStartupById(key) : this.getStartupBySlug(key);
  },

  /** Free-text over name, tagline and stage. Empty term returns the list. */
  async searchStartups(term: string): Promise<StartupView[]> {
    return (await startupRepository.search(term)).map(toView);
  },

  /**
   * Narrow a list by hiring and/or stage.
   *
   * Applied in memory rather than in SQL because it always runs against a set
   * that is already bounded — the whole table, or one search's results — and a
   * list a steward curates by hand is not going to reach a size where that
   * matters. Keeping it here also means search and filter compose without a
   * second query shape.
   */
  filterStartups(startups: StartupView[], filter: StartupFilter): StartupView[] {
    return startups.filter((startup) => {
      if (filter.hiring !== undefined && startup.hiring !== filter.hiring) return false;
      if (filter.stage && startup.stage.toLowerCase() !== filter.stage.toLowerCase()) return false;
      return true;
    });
  },

  /**
   * The rules a startup must satisfy, beyond what Zod already checked.
   *
   * Zod validates the SHAPE of one request in isolation. This is for the rules
   * that need the rest of the table: uniqueness of the name and slug. Returns
   * the issues rather than throwing so the caller can report all of them at
   * once instead of one per round trip.
   */
  async validateStartup(
    input: { name: string; slug: string },
    excludeId?: string,
  ): Promise<string[]> {
    const issues: string[] = [];

    const byName = (await startupRepository.list()).filter(
      (row) => row.id !== excludeId && row.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (byName.length > 0) issues.push('A startup with that name is already listed.');

    const bySlug = await startupRepository.findBySlug(input.slug);
    if (bySlug && bySlug.id !== excludeId) {
      issues.push('That name produces a web address already in use.');
    }

    return issues;
  },

  async createStartup(input: {
    name: string;
    mark: string;
    tagline: string;
    stage: string;
    foundedYear: string;
    hiring: boolean;
    website?: string | null | undefined;
    sortOrder?: number | undefined;
  }): Promise<StartupView> {
    const slug = slugify(input.name);
    if (!slug) throw AppError.badRequest('That name cannot be turned into a web address.');

    const issues = await this.validateStartup({ name: input.name, slug });
    if (issues.length > 0) throw AppError.conflict('conflict', issues.join(' '));

    /*
     * Default to the end of the list. Inserting at 0 would silently reorder
     * everything a steward had already arranged, which is the opposite of what
     * "add a startup" implies.
     */
    const existing = await startupRepository.list();
    const nextOrder =
      input.sortOrder ?? existing.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1;

    const write: StartupWrite = {
      name: input.name.trim(),
      slug,
      mark: input.mark.trim(),
      tagline: input.tagline.trim(),
      stage: input.stage.trim(),
      foundedYear: input.foundedYear,
      hiring: input.hiring,
      website: input.website?.trim() || null,
      sortOrder: nextOrder,
    };

    return toView(await startupRepository.create(write));
  },

  async updateStartup(
    id: string,
    patch: {
      name?: string | undefined;
      mark?: string | undefined;
      tagline?: string | undefined;
      stage?: string | undefined;
      foundedYear?: string | undefined;
      hiring?: boolean | undefined;
      website?: string | null | undefined;
      sortOrder?: number | undefined;
    },
  ): Promise<StartupView> {
    const current = await startupRepository.findById(id);
    if (!current) throw AppError.notFound('That startup is no longer listed.');

    const write: Partial<StartupWrite> = {};

    // The slug follows the name, so renaming re-addresses the startup. Only
    // recomputed when the name actually changes, so an unrelated edit cannot
    // quietly break a link someone shared.
    if (patch.name !== undefined && patch.name.trim() !== current.name) {
      const slug = slugify(patch.name);
      if (!slug) throw AppError.badRequest('That name cannot be turned into a web address.');

      const issues = await this.validateStartup({ name: patch.name, slug }, id);
      if (issues.length > 0) throw AppError.conflict('conflict', issues.join(' '));

      write.name = patch.name.trim();
      write.slug = slug;
    }

    if (patch.mark !== undefined) write.mark = patch.mark.trim();
    if (patch.tagline !== undefined) write.tagline = patch.tagline.trim();
    if (patch.stage !== undefined) write.stage = patch.stage.trim();
    if (patch.foundedYear !== undefined) write.foundedYear = patch.foundedYear;
    if (patch.hiring !== undefined) write.hiring = patch.hiring;
    if (patch.website !== undefined) write.website = patch.website?.trim() || null;
    if (patch.sortOrder !== undefined) write.sortOrder = patch.sortOrder;

    if (Object.keys(write).length === 0) return toView(current);

    const updated = await startupRepository.update(id, write);
    if (!updated) throw AppError.notFound('That startup is no longer listed.');
    return toView(updated);
  },

  async deleteStartup(id: string): Promise<void> {
    const removed = await startupRepository.remove(id);
    if (!removed) throw AppError.notFound('That startup is no longer listed.');
  },

  /**
   * Set the display order from an ordered list of ids.
   *
   * Every id is checked against the table BEFORE anything is written: a partial
   * reorder is worse than a rejected one, because the half that applied leaves
   * the list in an order nobody chose.
   */
  async reorderStartups(orderedIds: string[]): Promise<StartupView[]> {
    if (orderedIds.length === 0) throw AppError.badRequest('Send the startups in their new order.');

    const unique = new Set(orderedIds);
    if (unique.size !== orderedIds.length) {
      throw AppError.badRequest('That order lists the same startup twice.');
    }

    const known = new Set(await startupRepository.existingIds());
    const missing = orderedIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw AppError.notFound('That order refers to a startup that is no longer listed.');
    }

    await startupRepository.applyOrder(
      orderedIds.map((id, index) => ({ id, sortOrder: index + 1 })),
    );

    return this.getStartup();
  },
};
