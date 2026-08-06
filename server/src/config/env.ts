import { z } from 'zod';

/**
 * Environment contract.
 *
 * Parsed once, at import time, and the process refuses to start if anything is
 * missing or malformed. A server that boots with a blank Stripe key and only
 * discovers it on the first checkout is a worse outcome than a server that
 * never booted.
 *
 * Values arrive from the process environment. `server/.env` is read into it by
 * Node's own `--env-file-if-exists` flag in the npm scripts — "if exists"
 * because a deployed container is configured by its orchestrator and has no
 * such file, and the strict `--env-file` would refuse to start there.
 */

/**
 * Treat a not-yet-configured value as absent rather than as a value.
 *
 * Two shapes arrive looking like configuration while meaning "I haven't set
 * this up", and both used to produce a misleading failure:
 *
 *   · `KEY=` with nothing after it. Node's env-file loader reads that as an
 *     empty string, which is *present*, so `.optional()` never fires and the
 *     operator is told "expected string to have >=1 characters" rather than
 *     that the key is missing.
 *   · The placeholders shipped in `.env.example` — `sk_test_...`, `whsec_...`.
 *     Those satisfy a `startsWith` check, so copying the example booted a
 *     server that looked healthy and failed on the first Stripe call.
 */
function unsetPlaceholder(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' || trimmed.endsWith('...') ? undefined : trimmed;
}

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /** Comma-separated list of origins allowed to call this API. */
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),

    SUPABASE_URL: z.url(),
    /** Anon key — used only to verify a caller's JWT. Safe to ship to clients. */
    SUPABASE_ANON_KEY: z.string().min(20),
    /**
     * Service-role key. Bypasses RLS, so it lives here and NOWHERE near the
     * mobile bundle. Only the repository layer is allowed to use the client
     * built from it.
     */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

    /**
     * Stripe. Optional outside production on purpose.
     *
     * Bookings, events, the directory and the door do not involve Stripe, and
     * demanding a payment credential before any of them can be worked on is
     * friction with no safety benefit. While it is unset the payment routes
     * answer 503 with a sentence saying so, and the refinement below makes
     * production refuse to start without it.
     */
    STRIPE_SECRET_KEY: z.preprocess(unsetPlaceholder, z.string().startsWith('sk_').optional()),
    STRIPE_WEBHOOK_SECRET: z.preprocess(
      unsetPlaceholder,
      z.string().startsWith('whsec_').optional(),
    ),

    /**
     * Where Stripe returns a member after the Billing Portal. A deep link into
     * the app rather than a web page, so cancelling a plan does not strand
     * someone in a browser.
     */
    BILLING_PORTAL_RETURN_URL: z.url().default('https://app.hackerdojo.org/settings'),

    /**
     * Expo push access token. Optional: without it the notification service
     * records deliveries and logs, but sends nothing — which is the correct
     * behaviour in a local environment rather than a hard startup failure.
     */
    EXPO_ACCESS_TOKEN: z.preprocess(unsetPlaceholder, z.string().min(1).optional()),

    /** How often the API samples live sessions into `occupancy_samples`. */
    OCCUPANCY_SAMPLE_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(15_000)
      .max(3_600_000)
      .default(60_000),

    /**
     * Set on exactly one instance in a multi-instance deployment. The scheduler
     * is not distributed, so every replica running it would multiply the
     * samples and the digest sends.
     */
    RUN_SCHEDULER: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),

    /** Printed on donation receipts. Here rather than in code so it is auditable. */
    DOJO_EIN: z.string().min(4).default('26-4812213'),

    /** Ceiling on a single donation, in cents. Guards against fat fingers and abuse. */
    MAX_DONATION_CENTS: z.coerce.number().int().positive().default(2_000_000),

    /** Ceiling on an uploaded verification document, in bytes. Matches the bucket. */
    MAX_DOCUMENT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(20 * 1024 * 1024),

    /** Ceiling on an uploaded avatar, in bytes. Matches the bucket. */
    MAX_AVATAR_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(2 * 1024 * 1024),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    /** Trust proxy hop count — set to 1 behind a single load balancer. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must be set explicitly in production — no wildcard fallback.',
      });
    }
    // What development may omit, production must have.
    if (!env.STRIPE_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'STRIPE_SECRET_KEY is required in production — checkout would be dead.',
      });
    }
    if (!env.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_WEBHOOK_SECRET'],
        message:
          'STRIPE_WEBHOOK_SECRET is required in production — memberships are granted by webhook.',
      });
    }
    if (env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'Refusing to start production with a Stripe test key.',
      });
    }
    // Without a push token the notification service degrades to logging, which
    // is right locally and wrong in production — a member who enabled booking
    // reminders would silently never receive one.
    if (!env.EXPO_ACCESS_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['EXPO_ACCESS_TOKEN'],
        message: 'EXPO_ACCESS_TOKEN is required in production — push would silently no-op.',
      });
    }
    if (env.BILLING_PORTAL_RETURN_URL.startsWith('http://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['BILLING_PORTAL_RETURN_URL'],
        message: 'The billing portal return URL must be https in production.',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  · ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Deliberately raw stderr: the logger itself depends on this module.
    process.stderr.write(`\nInvalid environment configuration:\n${detail}\n\n`);
    process.exit(1);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
