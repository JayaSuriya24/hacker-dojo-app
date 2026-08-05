import { contentRepository } from '../repositories/content.repository.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/http.js';

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

  /** Everything the Dojo tab renders below the fold, in one round trip. */
  async about() {
    const [testimonials, press, board, faqs] = await Promise.all([
      contentRepository.testimonials(),
      contentRepository.press(),
      contentRepository.board(),
      contentRepository.faqs(),
    ]);

    return {
      testimonials: testimonials.map((t) => ({
        id: t.id,
        name: t.name,
        role: t.role,
        quote: t.quote,
        initials: t.name
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0] ?? '')
          .join('')
          .toUpperCase(),
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
        initials: b.name
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0] ?? '')
          .join('')
          .toUpperCase(),
      })),
      faqs: faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer })),
      impact: [
        { value: '6,400+', label: 'Members served since 2009' },
        { value: '1,180', label: 'Events hosted' },
        { value: '42', label: 'Startups launched here' },
        { value: '17', label: 'Years running' },
      ],
      pillars: [
        { name: 'Access', line: 'Tools and space for anyone who shows up' },
        { name: 'Community', line: "Neighbours who've made your mistakes" },
        { name: 'Potential', line: 'Talent before credentials' },
        { name: 'Build', line: 'Finish the thing, then show it' },
        { name: 'Experiment', line: 'Cheap failure, in public' },
        { name: 'Improve', line: 'Leave the bench better' },
      ],
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
};
