import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import Stripe from 'stripe';
import { logger } from '../config/logger.js';
import { isProduction } from '../config/env.js';
import { AppError, isAppError, type ErrorResponseBody, type FieldIssue } from '../utils/errors.js';

/** 404 for anything the router didn't claim. */
export const notFoundHandler: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  next(AppError.notFound('No route matches that URL.'));
};

function normalise(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    const issues: FieldIssue[] = error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return AppError.validation('Check the highlighted fields and try again.', issues);
  }

  // Stripe errors carry an operator-facing message that is often fine to show
  // (a declined card), and often not (an API key problem). Only the card-facing
  // families are passed through verbatim.
  if (error instanceof Stripe.errors.StripeError) {
    switch (error.type) {
      case 'StripeCardError':
        return AppError.paymentFailed(error.message, { declineCode: error.decline_code });
      case 'StripeInvalidRequestError':
        return AppError.badRequest('That payment request was not valid.');
      case 'StripeRateLimitError':
        return new AppError(429, 'rate_limited', 'Too many payment attempts. Try again shortly.');
      case 'StripeConnectionError':
      case 'StripeAPIError':
        return AppError.upstream('Payments are temporarily unavailable. Try again shortly.', error);
      default:
        return AppError.internal('We could not complete that payment.', error);
    }
  }

  // Express 5's body parser rejects malformed JSON with a SyntaxError carrying
  // a status. Surfacing it as a 400 beats a 500 for a client bug.
  if (
    error instanceof SyntaxError &&
    'status' in error &&
    (error as { status: number }).status === 400
  ) {
    return AppError.badRequest('Request body is not valid JSON.');
  }

  return AppError.internal(undefined, error);
}

/**
 * The single place an error becomes a response.
 *
 * 5xx messages are replaced with a fixed sentence in production: an internal
 * error's message is often a database or driver string, and those describe the
 * schema to anyone who can trigger one. The real message still reaches the log.
 */
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = normalise(error);
  const requestId = req.context?.requestId ?? 'unknown';

  const logPayload = {
    requestId,
    userId: req.context?.user?.id,
    method: req.method,
    path: req.originalUrl,
    code: appError.code,
    status: appError.status,
    context: appError.context,
    err: appError,
  };

  if (appError.status >= 500) logger.error(logPayload, appError.message);
  else if (appError.status >= 400) logger.warn(logPayload, appError.message);

  const body: ErrorResponseBody = {
    error: {
      code: appError.code,
      message:
        appError.status >= 500 && isProduction
          ? 'Something went wrong on our end.'
          : appError.message,
      requestId,
      retryable: appError.retryable,
      ...(appError.issues ? { issues: appError.issues } : {}),
    },
  };

  res.status(appError.status).json(body);
};
