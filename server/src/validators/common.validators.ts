import { z } from 'zod';
import { EVENT_CATEGORIES } from '../types/database.js';

/** Building blocks shared across request schemas. */

export const uuidParam = z.object({ id: z.uuid('That identifier is not valid.') });

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const isoDateTime = z.iso.datetime({
  offset: true,
  message: 'Provide an ISO-8601 timestamp.',
});

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Provide a date as YYYY-MM-DD.');

/**
 * Client-generated idempotency key. Constrained to a UUID rather than accepting
 * arbitrary text: it is used as a unique index value and passed to Stripe, and
 * a free-form key invites collisions between unrelated clients.
 */
export const idempotencyKey = z.uuid('Provide a valid idempotency key.');

/**
 * Free text that will be rendered back to other members.
 *
 * Angle brackets are stripped rather than escaped. React Native's Text renders
 * strings literally so this is not an XSS vector on the device — but the same
 * field surfaces in emails and the admin web console, and defending at the
 * boundary means each consumer does not have to remember to.
 */
export const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((value) => value.replace(/[<>]/g, ''));

// Derived from the one list in `database.ts`, so a category added to the enum
// cannot be accepted here and then be missing there, or the reverse.
export const eventCategory = z.enum(EVENT_CATEGORIES);
export const resourceKind = z.enum(['hardware', 'room']);
export const billingPeriod = z.enum(['month', 'year']);
