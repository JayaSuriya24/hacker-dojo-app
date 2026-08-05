import { z } from 'zod';
import {
  billingPeriod,
  eventCategory,
  idempotencyKey,
  isoDate,
  isoDateTime,
  paginationQuery,
  resourceKind,
  safeText,
} from './common.validators.js';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * `.strict()` is doing real work here: it rejects unknown keys outright, so a
 * request that slips `role: "admin"` into the body is a 422 rather than a field
 * silently dropped. Combined with the validator replacing `req.body` with the
 * parsed value, nothing unexpected can reach a repository's update payload.
 */
export const updateProfileSchema = z
  .object({
    full_name: z.string().trim().min(2).max(120).optional(),
    bio: safeText(600).optional(),
    company: safeText(120).optional(),
    current_project: safeText(300).optional(),
    skills: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{10,15}$/, 'Enter a mobile number with 10–15 digits.')
      .optional(),
    directory_visible: z.boolean().optional(),
    avatar_path: z.string().max(300).optional(),
  })
  .strict();

export const updateNotificationsSchema = z
  .object({
    events: z.boolean().optional(),
    bookings: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
    pushToken: z.string().min(10).max(200).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const listEventsQuery = paginationQuery.extend({
  category: eventCategory.optional(),
  today: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const hostEventSchema = z
  .object({
    title: safeText(160).pipe(z.string().min(3, 'Give your event a name.')),
    category: eventCategory,
    expectedSize: z.coerce.number().int().min(1).max(500),
    preferredDate: isoDate,
    preferredRoom: safeText(80).pipe(z.string().min(1, 'Pick a room.')),
    notes: safeText(1000).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const listResourcesQuery = z.object({ kind: resourceKind.optional() });

export const availabilityQuery = z.object({ day: isoDate });

export const createBookingSchema = z
  .object({
    resourceId: z.uuid(),
    startsAt: isoDateTime,
    // The stepper in the booking sheet caps at 4h; the ceiling is restated here
    // because the client is not the enforcement point.
    durationHours: z.coerce.number().int().min(1).max(4),
    notes: safeText(500).optional(),
  })
  .strict();

export const rescheduleBookingSchema = z
  .object({
    resourceId: z.uuid(),
    startsAt: isoDateTime,
    durationHours: z.coerce.number().int().min(1).max(4),
  })
  .strict();

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------

export const directoryQuery = paginationQuery.extend({
  search: z.string().trim().max(80).optional(),
  // Repeated `?skills=Rust&skills=iOS` arrives as an array; a single value
  // arrives as a string. Normalise both to an array.
  skills: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : Array.isArray(value) ? value : [value],
    ),
  here: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const membershipIntentSchema = z
  .object({
    planId: z.string().min(1).max(40),
    period: billingPeriod,
    idempotencyKey,
  })
  .strict();

export const donationIntentSchema = z
  .object({
    amountCents: z.coerce.number().int().min(100),
    idempotencyKey,
    receiptEmail: z.email().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Tours
// ---------------------------------------------------------------------------

export const bookTourSchema = z
  .object({
    scheduledFor: isoDateTime,
    guestName: safeText(120).optional(),
    guestEmail: z.email().optional(),
  })
  .strict();
