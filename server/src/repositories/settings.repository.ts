import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList } from '../utils/postgrest.js';
import type { ContentBlockRow, SiteSettingRow } from '../types/database.js';

/**
 * Editable content and single-valued settings.
 *
 * The impact figures and the pillars were literal arrays inside
 * `content.service.ts`, so changing "6,400+ members served" meant a deploy.
 * The Wi-Fi password was worse: a string in a mobile component, which put it in
 * every installed copy of the app and made rotating it an App Store release.
 *
 * Reads of public content use the service role to skip a redundant JWT round
 * trip — the policy makes it world-readable anyway. The members-only settings
 * deliberately do NOT: they go through `userClient` so the split in
 * `site_settings_select_members` is what decides, not a branch in a service.
 */
export const contentBlockRepository = {
  async bySlot(slot: string): Promise<ContentBlockRow[]> {
    return unwrapList(
      await adminClient
        .from('content_blocks')
        .select('*')
        .eq('slot', slot)
        .eq('active', true)
        .order('sort_order')
        .returns<ContentBlockRow[]>(),
      'Could not load that content.',
    );
  },

  /** Several slots in one round trip — the Dojo tab needs impact and pillars together. */
  async bySlots(slots: string[]): Promise<ContentBlockRow[]> {
    return unwrapList(
      await adminClient
        .from('content_blocks')
        .select('*')
        .in('slot', slots)
        .eq('active', true)
        .order('slot')
        .order('sort_order')
        .returns<ContentBlockRow[]>(),
      'Could not load content.',
    );
  },

  async listAll(accessToken: string): Promise<ContentBlockRow[]> {
    return unwrapList(
      await userClient(accessToken)
        .from('content_blocks')
        .select('*')
        .order('slot')
        .order('sort_order')
        .returns<ContentBlockRow[]>(),
      'Could not load content.',
    );
  },

  async upsert(
    accessToken: string,
    input: {
      slot: string;
      key: string;
      label: string;
      value: string | null;
      sortOrder: number;
      active: boolean;
    },
  ): Promise<ContentBlockRow> {
    return unwrap(
      await userClient(accessToken)
        .from('content_blocks')
        .upsert(
          {
            slot: input.slot,
            key: input.key,
            label: input.label,
            value: input.value,
            sort_order: input.sortOrder,
            active: input.active,
          },
          { onConflict: 'slot,key' },
        )
        .select('*')
        .single<ContentBlockRow>(),
      'Could not save that content.',
    );
  },
};

export const siteSettingRepository = {
  /**
   * Settings the caller is entitled to see.
   *
   * `accessToken` is optional: a signed-out visitor gets the public rows, a
   * member additionally gets the members-only ones. That split is the RLS
   * policy's job, which is why an anonymous read goes through the anon client
   * rather than the service role — the service role would return the Wi-Fi
   * password to the world.
   */
  async visibleTo(accessToken: string | null): Promise<SiteSettingRow[]> {
    const client = accessToken ? userClient(accessToken) : adminClient;

    let request = client.from('site_settings').select('*');
    // The service role bypasses RLS, so the public-only filter has to be
    // restated explicitly for the anonymous path.
    if (!accessToken) request = request.eq('members_only', false);

    return unwrapList(await request.returns<SiteSettingRow[]>(), 'Could not load settings.');
  },

  async upsert(
    accessToken: string,
    input: { key: string; value: string; description: string | null; membersOnly: boolean },
  ): Promise<SiteSettingRow> {
    return unwrap(
      await userClient(accessToken)
        .from('site_settings')
        .upsert(
          {
            key: input.key,
            value: input.value,
            description: input.description,
            members_only: input.membersOnly,
          },
          { onConflict: 'key' },
        )
        .select('*')
        .single<SiteSettingRow>(),
      'Could not save that setting.',
    );
  },
};
