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
 * The single Stripe client. Pinned API version so a Stripe-side upgrade can
 * never silently change a response shape under a running deployment — version
 * bumps are a deliberate, tested change.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
  maxNetworkRetries: 2,
  timeout: 15_000,
  appInfo: { name: 'Hacker Dojo API', version: '1.0.0' },
});
