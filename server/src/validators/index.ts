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
    /**
     * Marks the skills prompt as run. Deliberately `literal(true)` and not a
     * timestamp: the client says only THAT it asked, and the server decides
     * when. It cannot be unset, so the prompt cannot be made to reappear by a
     * crafted request.
     */
    skills_prompted: z.literal(true).optional(),
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
    // Optional: the form no longer asks. Kept so an older client, or a
    // steward with a real number, can still supply one.
    expectedSize: z.coerce.number().int().min(1).max(500).default(30),
    preferredDate: isoDate,
    preferredRoom: safeText(80).pipe(z.string().min(1, 'Pick a room.')),
    notes: safeText(1000).optional(),

    /** 24-hour wall clock at the Dojo, e.g. "18:30". */
    preferredTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 18:30.')
      .default('18:00'),
    durationMinutes: z.coerce.number().int().min(15).max(1440).default(120),

    repeatMode: z.enum(['once', 'weekly']).default('once'),
    /** Postgres `dow`: 0 = Sunday … 6 = Saturday. */
    repeatWeekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    repeatIntervalWeeks: z.coerce.number().int().min(1).max(52).default(1),
    repeatUntil: isoDate.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // A weekly request with no days expands to nothing, so it is refused here
    // rather than approved into an empty series.
    if (value.repeatMode === 'weekly' && value.repeatWeekdays.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['repeatWeekdays'],
        message: 'Pick at least one day of the week.',
      });
    }
    if (value.repeatUntil && value.repeatUntil < value.preferredDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['repeatUntil'],
        message: 'The last date cannot be before the first.',
      });
    }
  });

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const listResourcesQuery = z.object({ kind: resourceKind.optional() });

export const availabilityQuery = z.object({ day: isoDate });

/** `day` is optional here: the home screen always means today. */
export const dayScheduleQuery = z.object({
  kind: resourceKind.default('room'),
  day: isoDate.optional(),
});

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

/* ---------------------------------------------------------------------------
 * Startups
 *
 * The bounds mirror the check constraints added in the startup-management
 * migration. Both exist: this returns a field-level error the form can point
 * at, the constraint makes a bad row unwritable by any caller.
 * ------------------------------------------------------------------------- */

const startupFields = {
  name: safeText(80),
  /** The monogram on the card tile — two or three characters in practice. */
  mark: safeText(4),
  tagline: safeText(200),
  stage: safeText(40),
  /** Text, matching the column. Four digits. */
  foundedYear: z.string().regex(/^[0-9]{4}$/, 'Use a four-digit year.'),
  hiring: z.boolean(),
  /**
   * Absolute http(s) only. A bare "example.com" would be handed to the browser
   * as a relative path and resolve against the app's own origin.
   */
  website: z
    .string()
    .trim()
    .regex(/^https?:\/\/[^\s]+$/i, 'Use a full web address starting with https://')
    .max(300)
    .nullish(),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
};

export const createStartupSchema = z
  .object({
    name: startupFields.name,
    mark: startupFields.mark,
    tagline: startupFields.tagline,
    stage: startupFields.stage,
    foundedYear: startupFields.foundedYear,
    hiring: startupFields.hiring.default(false),
    website: startupFields.website,
    // Omitted means "put it at the end", which the service works out.
    sortOrder: startupFields.sortOrder.optional(),
  })
  .strict();

/** Every field optional, but at least one required — an empty PATCH is a bug. */
export const updateStartupSchema = z
  .object({
    name: startupFields.name.optional(),
    mark: startupFields.mark.optional(),
    tagline: startupFields.tagline.optional(),
    stage: startupFields.stage.optional(),
    foundedYear: startupFields.foundedYear.optional(),
    hiring: startupFields.hiring.optional(),
    website: startupFields.website,
    sortOrder: startupFields.sortOrder.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Change at least one field.',
  });

export const reorderStartupsSchema = z
  .object({ orderedIds: z.array(z.uuid()).min(1).max(500) })
  .strict();

export const startupQuery = z
  .object({
    search: z.string().trim().max(80).optional(),
    stage: z.string().trim().max(40).optional(),
    // Arrives as a query string, so the literal strings are what to expect.
    hiring: z.enum(['true', 'false']).optional(),
  })
  .strict();

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

// ---------------------------------------------------------------------------
// Uploads
//
// `content` is base64 rather than multipart — see the note in
// `document.controller.ts`. The length bound is on the ENCODED string, which is
// 4/3 of the decoded size; the service re-checks the decoded byte length
// against the bucket's own limit, so this only exists to reject something
// obviously oversized before it is decoded into memory.
// ---------------------------------------------------------------------------

const base64Content = z
  .string()
  .min(16, 'That file appears to be empty.')
  .max(28_000_000, 'That file is too large to upload from the app.');

export const uploadAvatarSchema = z
  .object({
    fileName: z.string().trim().min(1).max(120),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    content: base64Content,
  })
  .strict();

export const uploadDocumentSchema = z
  .object({
    kind: z.enum(['student_id', 'veteran_proof', 'certification', 'other']),
    fileName: z.string().trim().min(1).max(120),
    mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
    content: base64Content,
  })
  .strict();

export const reviewDocumentSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    reviewNote: safeText(500).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Sessions — checking in to the floor
// ---------------------------------------------------------------------------

export const checkInSchema = z
  .object({
    // Optional: a member can be on the floor without holding a specific booth.
    resourceId: z.uuid().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const staffQueueQuery = z.object({
  status: z.string().trim().max(40).optional(),
  kind: z.enum(['tour', 'event_request', 'program_application', 'document']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const tourStatusSchema = z
  .object({ status: z.enum(['requested', 'confirmed', 'attended', 'cancelled']) })
  .strict();

export const applicationStatusSchema = z
  .object({
    status: z.enum(['submitted', 'in_review', 'accepted', 'rejected', 'withdrawn']),
  })
  .strict();

export const grantCertificationSchema = z
  .object({
    profileId: z.uuid(),
    resourceId: z.uuid(),
    expiresAt: isoDateTime.optional(),
  })
  .strict();

export const upsertContentSchema = z
  .object({
    slot: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Slots are lowercase identifiers.'),
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Keys are lowercase identifiers.'),
    label: safeText(120).pipe(z.string().min(1, 'Give this block a label.')),
    value: safeText(400).optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const upsertSettingSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Setting keys are lowercase identifiers.'),
    value: safeText(400).pipe(z.string().min(1, 'Give this setting a value.')),
    description: safeText(200).optional(),
    membersOnly: z.boolean().optional(),
  })
  .strict();
