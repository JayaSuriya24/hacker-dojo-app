import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { stripe } from '../config/stripe.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { paymentService } from '../services/payment.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../types/http.js';

export const paymentController = {
  membershipIntent: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const params = await paymentService.createMembershipIntent(req.context.user, req.body);
    res.status(201).json({ data: params });
  }),

  donationIntent: asyncHandler(async (req: Request, res: Response) => {
    const params = await paymentService.createDonationIntent(req.context.user, req.body);
    res.status(201).json({ data: params });
  }),

  /**
   * A Stripe-hosted Billing Portal session.
   *
   * Replaces the hardcoded `billing.stripe.com/p/login/hackerdojo` link that
   * Settings used to open, which was never a real portal URL. The response is
   * a single-use link, so it must not be cached anywhere on the way back.
   */
  billingPortal: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const session = await paymentService.createBillingPortalSession(req.context.user);
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ data: session });
  }),

  /**
   * Stripe webhook.
   *
   * Two things are load-bearing:
   *
   * 1. The signature is verified against the RAW body. This route is mounted
   *    with `express.raw` before the JSON parser — a parsed-and-restringified
   *    body has different bytes and the signature check fails.
   * 2. It answers 200 the moment the event is accepted for processing. Stripe
   *    times out at 20 seconds and retries on anything else, so slow work must
   *    not sit between receipt and acknowledgement.
   */
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const signature = req.get('stripe-signature');
    if (!signature) throw AppError.badRequest('Missing Stripe signature.');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      logger.warn({ err: error }, 'Rejected a Stripe webhook with a bad signature');
      // 400, not 500: a bad signature is a rejected request, and Stripe should
      // not retry it.
      throw AppError.badRequest('Invalid webhook signature.');
    }

    await paymentService.handleWebhook(event);
    res.json({ received: true });
  }),
};
