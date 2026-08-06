import Stripe from 'stripe';
import { env } from './env.js';

/**
 * The pinned API version.
 *
 * Exported rather than repeated: ephemeral keys must be minted against the same
 * version the client library speaks, and two literals that have to agree will
 * eventually stop agreeing.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia' as const;

/**
 * Whether payments are wired up at all.
 *
 * Both halves are needed and neither is useful alone: the secret key charges,
 * the webhook secret is what makes a membership real. Outside production either
 * may be absent, and the payment routes refuse with a 503 rather than the whole
 * API refusing to boot — see `requireStripe`.
 */
export const isStripeConfigured = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

/**
 * The webhook signing secret, once we know there is one.
 *
 * Reads as non-optional at every call site because the routes that use it sit
 * behind `requireStripe`, which is the thing that establishes it.
 */
export const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET ?? '';

/**
 * The single Stripe client. Pinned API version so a Stripe-side upgrade can
 * never silently change a response shape under a running deployment — version
 * bumps are a deliberate, tested change.
 *
 * Constructed even when unconfigured, with a key that cannot work. Stripe's
 * constructor does no network I/O and does not validate the key, so this is
 * inert — and it keeps every call site free of a null check for a client that
 * `requireStripe` has already guaranteed is usable.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? 'sk_not_configured', {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
  maxNetworkRetries: 2,
  timeout: 15_000,
  appInfo: { name: 'Hacker Dojo API', version: '1.0.0' },
});
