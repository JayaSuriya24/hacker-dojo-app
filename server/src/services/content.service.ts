import { contentRepository } from '../repositories/content.repository.js';
import {
  contentBlockRepository,
  siteSettingRepository,
} from '../repositories/settings.repository.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { ContentBlockRow } from '../types/database.js';

export interface AboutView {
  testimonials: Array<{ id: string; name: string; role: string; quote: string; initials: string }>;
  press: Array<{ id: string; outlet: string; year: string; headline: string; url: string | null }>;
  board: Array<{ id: string; name: string; role: string; initials: string }>;
  faqs: Array<{ id: string; question: string; answer: string }>;
  /**
   * `key` is the list identity, and it is sent because the client had nothing
   * else to use. It was keying on `name` — editable free text, which two staff
   * could set to the same thing without either of them doing anything wrong.
   * `content_blocks` already carries `unique (slot, key)`, so the uniqueness the
   * client needs is a constraint in the database rather than a convention.
   */
  pillars: Array<{ key: string; name: string; line: string }>;
}

export interface SiteSettingsView {
  /** Public facts. Always present. */
  labStatus: string | null;
  labHours: string | null;
  /**
   * The guest network. Public on purpose: its password is posted on the wall,
   * and a visitor who cannot see it is exactly who it exists for.
   */
  wifiGuestSsid: string | null;
  wifiGuestPassword: string | null;
  /**
   * The member network's name. Public too — knowing a network exists is not
   * access to it. The credential that opens it is per-member and comes from
   * `/me/wifi`, never from here.
   */
  wifiSsid: string | null;
}

/** Initials from a display name, used wherever an avatar falls back. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

function blocksIn(rows: ContentBlockRow[], slot: string): ContentBlockRow[] {
  return rows.filter((row) => row.slot === slot);
}

export const contentService = {
  async programs() {
    const rows = await contentRepository.programs();
    return rows.map((program) => ({
      id: program.id,
      name: program.name,
      meta: program.meta,
      blurb: program.blurb,
      tracks: program.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        description: track.description,
        audience: track.audience,
        outcome: track.outcome,
      })),
    }));
  },

  /**
   * Everything the Dojo tab renders below the fold, in one round trip.
   *
   * `pillars` used to be a literal array in this file, so changing a line was a
   * deploy. They are `content_blocks` rows now.
   *
   * There is no `impact` any more. The Impact report was four figures with no
   * source behind them; 0007 deleted three, the fourth — "years running" — was
   * derived here from the 2009 founding, and then the section was dropped
   * outright. Nothing consumed the field once the section was gone, so it went
   * with it rather than staying on as a computed value with no reader.
   *
   * Every list here can legitimately come back empty, and after 0007 most of
   * them do. The client renders no section rather than an empty card for each —
   * an empty testimonials list means the Dojo has not collected a real quote
   * yet, which is a true thing to say by saying nothing.
   */
  async about(): Promise<AboutView> {
    const [testimonials, press, board, faqs, blocks] = await Promise.all([
      contentRepository.testimonials(),
      contentRepository.press(),
      contentRepository.board(),
      contentRepository.faqs(),
      contentBlockRepository.bySlots(['pillars']),
    ]);

    return {
      testimonials: testimonials.map((t) => ({
        id: t.id,
        name: t.name,
        role: t.role,
        quote: t.quote,
        initials: initialsOf(t.name),
      })),
      press: press.map((p) => ({
        id: p.id,
        outlet: p.outlet,
        year: p.year,
        headline: p.headline,
        url: p.url,
      })),
      board: board.map((b) => ({
        id: b.id,
        name: b.name,
        role: b.role,
        initials: initialsOf(b.name),
      })),
      faqs: faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer })),
      pillars: blocksIn(blocks, 'pillars').map((block) => ({
        key: block.key,
        name: block.label,
        line: block.value ?? '',
      })),
    };
  },

  /**
   * Site settings for the caller.
   *
   * The Wi-Fi password was a string literal in a mobile component, which put it
   * in every installed copy of the app and made rotating it an App Store
   * release. Nothing secret is returned here any more: the guest password is
   * posted on the wall, and the member credential is per-member and served from
   * `/me/wifi` behind an active-membership check.
   */
  async settings(user: AuthenticatedUser | undefined): Promise<SiteSettingsView> {
    const rows = await siteSettingRepository.visibleTo(user?.accessToken ?? null);
    const value = (key: string): string | null =>
      rows.find((row) => row.key === key)?.value ?? null;

    return {
      labStatus: value('lab_status'),
      labHours: value('lab_hours'),
      wifiGuestSsid: value('wifi_guest_ssid'),
      wifiGuestPassword: value('wifi_guest_password'),
      wifiSsid: value('wifi_ssid'),
    };
  },

  /**
   * Book a tour. Open to signed-out visitors by design — requiring an account
   * before someone can come and look at the space would be exactly backwards.
   */
  async bookTour(
    user: AuthenticatedUser | undefined,
    input: {
      scheduledFor: string;
      guestName?: string | undefined;
      guestEmail?: string | undefined;
    },
  ) {
    const when = new Date(input.scheduledFor);
    if (Number.isNaN(when.getTime())) throw AppError.badRequest('That time is not valid.');
    if (when.getTime() < Date.now()) throw AppError.badRequest('Pick a time in the future.');

    if (!user && !input.guestEmail) {
      throw AppError.badRequest('Leave an email so we can confirm your tour.');
    }

    const row = await contentRepository.createTour(user?.accessToken ?? null, {
      profileId: user?.id,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      scheduledFor: when.toISOString(),
    });

    return { id: row.id, scheduledFor: row.scheduled_for, status: row.status };
  },

  /** Staff: the full block list, including the ones toggled off. */
  async listContentBlocks(user: AuthenticatedUser) {
    const rows = await contentBlockRepository.listAll(user.accessToken);
    return rows.map((row) => ({
      id: row.id,
      slot: row.slot,
      key: row.key,
      label: row.label,
      value: row.value,
      sortOrder: row.sort_order,
      active: row.active,
    }));
  },

  async upsertContentBlock(
    user: AuthenticatedUser,
    input: {
      slot: string;
      key: string;
      label: string;
      value?: string | undefined;
      sortOrder?: number | undefined;
      active?: boolean | undefined;
    },
  ) {
    const row = await contentBlockRepository.upsert(user.accessToken, {
      slot: input.slot,
      key: input.key,
      label: input.label,
      value: input.value ?? null,
      sortOrder: input.sortOrder ?? 0,
      active: input.active ?? true,
    });

    return {
      id: row.id,
      slot: row.slot,
      key: row.key,
      label: row.label,
      value: row.value,
      sortOrder: row.sort_order,
      active: row.active,
    };
  },

  async upsertSetting(
    user: AuthenticatedUser,
    input: { key: string; value: string; description?: string | undefined; membersOnly?: boolean },
  ) {
    const row = await siteSettingRepository.upsert(user.accessToken, {
      key: input.key,
      value: input.value,
      description: input.description ?? null,
      membersOnly: input.membersOnly ?? false,
    });

    return {
      key: row.key,
      value: row.value,
      description: row.description,
      membersOnly: row.members_only,
    };
  },
};
