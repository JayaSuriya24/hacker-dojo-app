import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isStripeConfigured } from '../config/stripe.js';
import { AppError } from '../utils/errors.js';

/**
 * Refuse a payment route when Stripe is not configured.
 *
 * Outside production the Stripe credentials are optional, so that bookings,
 * events, the directory and the door can be worked on without a payment
 * account. The trade is that `/payments/*` and the webhook have to say so
 * plainly instead of failing somewhere inside a Stripe call with a message
 * about an invalid API key.
 *
 * 503 rather than 500: this is a deployment that is missing a dependency, not a
 * request that went wrong, and `upstream_unavailable` is already the client's
 * vocabulary for "not you, us, try later". In production the process would not
 * have started, so this can only ever fire in development.
 */
export const requireStripe: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (isStripeConfigured) {
    next();
    return;
  }

  next(
    AppError.upstream(
      'Payments are not configured on this server. Set STRIPE_SECRET_KEY and ' +
        'STRIPE_WEBHOOK_SECRET in server/.env.',
    ),
  );
};
