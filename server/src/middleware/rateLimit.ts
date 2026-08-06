import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/**
 * Rate limiting, keyed by user when we know who is calling and by IP otherwise.
 *
 * Keying on the authenticated id matters for correctness as much as for abuse:
 * a whole coworking space shares one NAT'd IP, so a purely IP-based limit
 * would throttle the whole floor the moment one member got busy.
 *
 * These are in-memory counters, correct for a single instance. Multi-instance
 * deployments should swap in the Redis store — the limiter shape does not change.
 */
function keyFor(req: Request): string {
  const userId = req.context?.user?.id;
  if (userId) return `user:${userId}`;
  // ipKeyGenerator normalises IPv6 to a /64 so one host can't rotate addresses.
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyFor,
  handler: (_req, _res, next) => {
    next(new AppError(429, 'rate_limited', 'Too many requests. Give it a moment and try again.'));
  },
};

/** Baseline for every route. Generous — it exists to stop runaway clients. */
export const globalLimiter = rateLimit({
  ...shared,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/**
 * Auth-adjacent endpoints: password reset, OTP requests. Tight, and counted
 * only on failure so a member who keeps succeeding is never locked out.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
});

/** Anything that moves money. Deliberately strict. */
export const paymentLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 10,
});

/** Writes that create a row someone has to action (bookings, RSVPs, requests). */
export const mutationLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 30,
});

/**
 * Uploads. Low ceiling because each one costs a storage round trip and a
 * multi-megabyte body, and nobody legitimately replaces their portrait twelve
 * times a minute.
 */
export const uploadLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 6,
});

/**
 * Actions with a consequence in the physical world — currently the door.
 *
 * Deliberately tighter than `mutationLimiter`, and deliberately not the only
 * guard: this counter lives in one process and resets on deploy, so
 * `accessService` keeps a second one derived from the audit log itself.
 */
export const sensitiveLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 10,
});
