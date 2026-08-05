import Stripe from 'stripe';
import { env } from './env.js';

/**
 * The single Stripe client. Pinned API version so a Stripe-side upgrade can
 * never silently change a response shape under a running deployment — version
 * bumps are a deliberate, tested change.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-07-29.dahlia',
  typescript: true,
  maxNetworkRetries: 2,
  timeout: 15_000,
  appInfo: { name: 'Hacker Dojo API', version: '1.0.0' },
});
