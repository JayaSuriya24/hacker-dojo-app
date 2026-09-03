import { writeSync } from 'node:fs';
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
 *   · The placeholders shipped in `.env.example` — `sk_test_...`, `whsec_...`,
 *     `eyJhbGciOi...`. Those satisfy a `startsWith` check, so copying the
 *     example booted a server that looked healthy and failed on first use.
 *
 * Applied to the whole environment rather than to the few fields that once
 * needed it. Per-field `z.preprocess` meant a blank `NODE_ENV=` was a fatal
 * enum error instead of the documented default, and — worse, because it was
 * silent — a blank `TRUST_PROXY_HOPS=` coerced through `Number('')` to 0,
 * overriding the default of 1 and quietly making every request behind the load
 * balancer share one rate-limit bucket.
 */
function unsetPlaceholder(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' || trimmed.endsWith('...') ? undefined : trimmed;
}

/** Drop the not-yet-configured keys entirely, so schema defaults can fire. */
function sanitize(source: NodeJS.ProcessEnv): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const kept = unsetPlaceholder(value);
    if (kept !== undefined) cleaned[key] = kept;
  }
  return cleaned;
}

/**
 * `new URL`, without the throw.
 *
 * Zod runs a chained `.refine()` even when the check before it FAILED, so any
 * refinement that parses a URL is handed malformed input as a matter of course.
 * One that called `new URL` directly threw an uncaught TypeError and took the
 * process down with a stack trace — replacing the very message this module
 * exists to print.
 */
function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * The form a browser would actually send for this value, or null if it is not
 * an http(s) URL at all.
 *
 * The CORS allowlist is compared to the `Origin` header by exact string match,
 * so any entry that differs from the browser's own spelling — a trailing slash,
 * a path, an upper-case host, a redundant `:443` — matches nothing and silently
 * blocks the very origin it was added to allow. `URL.origin` is precisely that
 * normalisation, so comparing against it both detects the mistake and produces
 * the corrected value to put in the message.
 */
function normalisedOrigin(value: string): string | null {
  const parsed = parseUrl(value);
  if (parsed === null) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.origin;
}

/**
 * A real HTTPS check.
 *
 * `startsWith('http://')` was not one: it passes `javascript:alert(1)`,
 * `ftp://…` and the uppercase `HTTP://…`, all of which `z.url()` accepts.
 */
function isHttps(value: string): boolean {
  return parseUrl(value)?.protocol === 'https:';
}

/**
 * Which Supabase role a key grants, or null when that cannot be read from it.
 *
 * Current-format keys say so in a prefix. Legacy keys are JWTs whose payload is
 * plain base64url — `{"iss":"supabase","role":"anon",…}` — and reading a claim
 * needs no signature check, because this is not authenticating anything. It is
 * asking which of two credentials the operator pasted.
 *
 * Returns null for anything unrecognised, which keeps stand-in values (the
 * suite's `test-anon-key-000000000000`) from being judged as either role.
 */
function supabaseKeyRole(value: string): string | null {
  if (value.startsWith('sb_publishable_')) return 'anon';
  if (value.startsWith('sb_secret_')) return 'service_role';

  const parts = value.split('.');
  const payloadPart = parts.length === 3 ? parts[1] : undefined;
  if (payloadPart === undefined) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    const role = (payload as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/**
 * The sub-paths supabase-js appends to the project URL itself.
 *
 * A URL ending in one of these was pasted from an API example rather than from
 * the project settings, and the client would build `/rest/v1/rest/v1` from it.
 * A path prefix on its own is legitimate — a self-hosted gateway at
 * `https://example.com/supabase` works — so only this doubling is rejected.
 */
const SUPABASE_API_PATH = /\/(rest|auth|storage|realtime|functions)\/v\d+\/?$/;

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(4000),

    /**
     * Interface to bind. Unset — the default — is Node's own behaviour: listen
     * on every interface, which is what a container needs to be reachable at
     * all. Set it to `127.0.0.1` to keep a development server off the local
     * network, or to a specific address to pin one interface.
     *
     * Deliberately NOT defaulted to `0.0.0.0`. That string binds IPv4 only,
     * whereas omitting the host binds dual-stack `::` and falls back to
     * `0.0.0.0` where IPv6 is unavailable — so hardcoding the "container-safe"
     * value is the one choice that would break an IPv6 health check.
     */
    HOST: z.string().min(1).optional(),

    /**
     * Pino's levels, including `silent` — which pino accepts (it maps to
     * `Infinity`, so nothing passes) and which the test setup selects. It was
     * missing from this enum, so the one level the codebase actually sets
     * programmatically was the one an operator could not configure.
     */
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

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

    /**
     * The project root. Required in every environment — unlike Stripe, push and
     * email, there is no version of this API that runs without a database, so
     * there is nothing to degrade to.
     *
     * The scheme is checked here rather than left to supabase-js. It rejects a
     * non-http(s) URL too, but it does so by throwing while `config/supabase.ts`
     * is being imported — after this module has already reported the
     * configuration good. Config errors belong in the one message that explains
     * them and exits 1.
     */
    SUPABASE_URL: z
      .url({
        // "expected string, received undefined" is accurate but says nothing
        // about where the value comes from. This is the variable an operator is
        // most likely to be setting for the first time.
        error: (issue) =>
          issue.input === undefined
            ? 'SUPABASE_URL is required — the Project URL from Supabase → Settings → API.'
            : 'SUPABASE_URL must be a valid URL, e.g. https://your-project.supabase.co.',
      })
      // Silent when the value does not parse at all: `z.url()` has already said
      // so, and a second message about schemes would only crowd it out.
      .refine((value) => parseUrl(value) === null || normalisedOrigin(value) !== null, {
        message: 'SUPABASE_URL must be an http(s) URL — supabase-js accepts no other scheme.',
      })
      .refine((value) => !SUPABASE_API_PATH.test(parseUrl(value)?.pathname ?? ''), {
        message:
          'SUPABASE_URL is the project root, not an API endpoint. supabase-js appends /rest/v1 and /auth/v1 itself, so a URL ending in one produces a doubled path like /rest/v1/rest/v1.',
      }),
    /** Anon key — used only to verify a caller's JWT. Safe to ship to clients. */
    SUPABASE_ANON_KEY: z
      .string({
        error: (issue) =>
          issue.input === undefined
            ? 'SUPABASE_ANON_KEY is required — the anon/publishable key from Supabase → Settings → API.'
            : 'SUPABASE_ANON_KEY must be a string.',
      })
      .min(20),
    /**
     * Service-role key. Bypasses RLS, so it lives here and NOWHERE near the
     * mobile bundle. Only the repository layer is allowed to use the client
     * built from it.
     */
    SUPABASE_SERVICE_ROLE_KEY: z
      .string({
        error: (issue) =>
          issue.input === undefined
            ? 'SUPABASE_SERVICE_ROLE_KEY is required — the service_role/secret key from Supabase → Settings → API. Never ship this to a client.'
            : 'SUPABASE_SERVICE_ROLE_KEY must be a string.',
      })
      .min(20),

    /**
     * Stripe. Optional outside production on purpose.
     *
     * Bookings, events, the directory and the door do not involve Stripe, and
     * demanding a payment credential before any of them can be worked on is
     * friction with no safety benefit. While it is unset the payment routes
     * answer 503 with a sentence saying so, and the refinement below makes
     * production refuse to start without it.
     */
    STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),

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
    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),

    /**
     * Transactional email. Optional outside production for the same reason as
     * Stripe: nothing about bookings, the door or the floor needs it, and the
     * welcome mail's contents (the Wi-Fi PIN) are on the Home screen anyway.
     * While it is unset a send is logged rather than transmitted.
     */
    EMAIL_API_KEY: z.string().min(1).optional(),
    /** The From address on member mail. Must be a domain the provider verifies. */
    EMAIL_FROM: z.email().optional(),

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
     *
     * Deliberately has no schema default. Outside production an unset value
     * means `true`, applied by the transform below, because a single local
     * process should just run its timers. In production the refinement demands
     * an explicit answer: a default of `true` is correct for exactly one
     * replica and wrong for every other, and the failure is silent — duplicate
     * reminders and a digest sent N times, with nothing in any log to say so.
     */
    RUN_SCHEDULER: z.enum(['true', 'false']).optional(),

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
    // Shape checks that hold in every environment. A malformed allowlist entry
    // fails closed rather than open, so it is not a hole — but it blocks the
    // origin it was written to admit, and it does it silently.
    for (const origin of env.CORS_ORIGINS) {
      if (origin === '*') {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message:
            'CORS_ORIGINS has no wildcard. The allowlist is matched exactly, so "*" admits no browser origin and blocks every one of them — list each origin instead.',
        });
        continue;
      }
      const normalised = normalisedOrigin(origin);
      if (normalised === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `"${origin}" is not an http(s) URL, so no browser can ever send it as an Origin.`,
        });
      } else if (normalised !== origin) {
        // Naming the corrected value matters: every one of these rejections is
        // an entry that would have parsed fine and then matched nothing.
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `"${origin}" is not the spelling a browser sends — use "${normalised}". An Origin is scheme://host[:port], lower-cased, with no path, no trailing slash and no default port.`,
        });
      }
    }

    /*
     * The two keys are not interchangeable, and nothing downstream notices when
     * they are swapped.
     *
     * They sit next to each other in the Supabase dashboard and both begin
     * `eyJ`. With the service-role key in the anon slot, `userClient` ships a
     * full-privilege credential as the `apikey` header on EVERY user request —
     * and while a valid bearer token still pins the request to that user, any
     * request whose token is missing or expired falls back to the apikey and
     * runs with RLS bypassed. That is the opposite of the defence in depth
     * `userClient` exists to provide, and it is silent: the happy path works.
     */
    if (supabaseKeyRole(env.SUPABASE_ANON_KEY) === 'service_role') {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_ANON_KEY'],
        message:
          'SUPABASE_ANON_KEY holds a SERVICE-ROLE key — that key bypasses RLS and must never be the one userClient runs on. Use the anon/publishable key.',
      });
    }
    if (supabaseKeyRole(env.SUPABASE_SERVICE_ROLE_KEY) === 'anon') {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_SERVICE_ROLE_KEY'],
        message:
          'SUPABASE_SERVICE_ROLE_KEY holds the anon key — every privileged operation (webhook activations, door audit writes) would be refused by RLS.',
      });
    }

    if (env.NODE_ENV !== 'production') return;

    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must be set explicitly in production — no wildcard fallback.',
      });
    }
    // The service-role key crosses this link on every request. Plaintext is not
    // an option, whatever the network is claimed to be.
    if (!isHttps(env.SUPABASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_URL'],
        message: 'SUPABASE_URL must be https in production — the service-role key travels over it.',
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
    /*
     * An allowlist, not a denylist.
     *
     * Refusing `sk_test_` and accepting whatever else began `sk_` let three
     * things boot production that must never charge a member: `sk_sandbox_…`
     * (a sandbox key — test money under a prefix this check had never heard
     * of), a mistyped `sk_livee_…`, and the bare string `sk_`. Naming the one
     * prefix that is allowed cannot be outflanked by a prefix Stripe adds
     * later. Restricted `rk_live_` keys are already excluded by the `sk_`
     * check on the field itself.
     */
    if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: env.STRIPE_SECRET_KEY.startsWith('sk_test_')
          ? 'Refusing to start production with a Stripe test key.'
          : 'Production needs a live Stripe secret key — it must start with "sk_live_".',
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
    // Same argument as push: a new member whose welcome mail was logged and
    // never sent has no idea a PIN exists to look for.
    if (!env.EMAIL_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_API_KEY'],
        message: 'EMAIL_API_KEY is required in production — the welcome email would never send.',
      });
    }
    if (!env.EMAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'EMAIL_FROM is required in production — mail needs a verified sender.',
      });
    }
    // `z.url()` accepts any scheme, so this cannot be a prefix test: it would
    // wave through `ftp://`, the uppercase `HTTP://` and `javascript:`.
    if (!isHttps(env.BILLING_PORTAL_RETURN_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['BILLING_PORTAL_RETURN_URL'],
        message: 'The billing portal return URL must be https in production.',
      });
    }
    if (env.RUN_SCHEDULER === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['RUN_SCHEDULER'],
        message:
          'RUN_SCHEDULER must be set explicitly in production — "true" on exactly one replica, "false" on every other. Defaulting it runs a scheduler per replica and silently multiplies every occupancy sample, reminder and digest send.',
      });
    }
  })
  .transform((env) => ({
    ...env,
    /** Absent means yes — but production never gets here without an explicit value. */
    RUN_SCHEDULER: env.RUN_SCHEDULER !== 'false',
  }));

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(sanitize(process.env));

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  · ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Deliberately raw stderr: the logger itself depends on this module. And
    // deliberately `writeSync`: when stderr is a pipe — every container runtime
    // and every CI runner — `process.stderr.write` is asynchronous, and
    // `process.exit` does not flush it. The one message explaining why the
    // process refused to start is the last thing that should be truncated.
    writeSync(2, `\nInvalid environment configuration:\n${detail}\n\n`);
    process.exit(1);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
