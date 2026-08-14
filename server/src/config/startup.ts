import { adminClient } from './supabase.js';
import { isStripeConfigured, stripe } from './stripe.js';
import { logger } from './logger.js';

/**
 * Startup verification.
 *
 * `env.ts` proves the configuration parses. This proves it works: a
 * service-role key can be a perfectly well-formed JWT for the wrong project,
 * and a Stripe key can be syntactically valid and revoked. Both failures
 * otherwise surface as a 500 on a member's first request rather than as a
 * deployment that never went live.
 *
 * Every check is read-only and cheap, and each is reported individually so the
 * log says which credential is wrong instead of "startup failed".
 */

export interface StartupReport {
  ok: boolean;
  checked: string[];
  failures: Array<{ check: string; reason: string }>;
}

/** No single check may hang the boot sequence. */
const CHECK_TIMEOUT_MS = 10_000;

async function withTimeout<T>(name: string, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out`)), CHECK_TIMEOUT_MS);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function check(name: string, work: () => Promise<unknown>): Promise<string | null> {
  try {
    await withTimeout(name, work());
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, check: name }, 'Startup check failed');
    return reason;
  }
}

export async function verifyStartupDependencies(): Promise<StartupReport> {
  const checks: Array<{ name: string; run: () => Promise<unknown> }> = [
    {
      // Proves the URL, the service-role key and the schema all line up. `plans`
      // is seeded by the migrations, so an empty result means the database was
      // never migrated — which is worth failing on too.
      name: 'supabase.plans',
      run: async () => {
        const { error } = await adminClient.from('plans').select('id').limit(1);
        if (error) throw new Error(error.message);
      },
    },
    {
      // The hardening migration's own marker. Present means the RLS fixes, the
      // timezone-correct trigger and the new tables are all live.
      name: 'supabase.migrations',
      run: async () => {
        const { error } = await adminClient.from('site_settings').select('key').limit(1);
        if (error) {
          throw new Error(
            `${error.message} — has 20260805000000_production_hardening.sql been applied?`,
          );
        }
      },
    },
  ];

  // A revoked or wrong-mode Stripe key fails here rather than at checkout.
  // Listing one price is the cheapest authenticated call that does not need an
  // account id we would otherwise have to configure. Skipped when payments are
  // deliberately unconfigured: outside production that is a supported state —
  // `requireStripe` answers 503 on /payments/* and the rest of the API runs —
  // so checking the placeholder key would fail a boot that is meant to succeed.
  if (isStripeConfigured) {
    checks.push({
      name: 'stripe.credentials',
      run: () => stripe.prices.list({ limit: 1 }),
    });
  } else {
    logger.warn('Stripe is not configured — skipping credential check; /payments/* will 503');
  }

  const failures: Array<{ check: string; reason: string }> = [];
  const checked: string[] = [];

  for (const entry of checks) {
    const reason = await check(entry.name, entry.run);
    checked.push(entry.name);
    if (reason) failures.push({ check: entry.name, reason });
  }

  return { ok: failures.length === 0, checked, failures };
}
