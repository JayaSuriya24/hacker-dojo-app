import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { pinoHttp } from 'pino-http';
import { env, isProduction } from './config/env.js';
import { logger } from './config/logger.js';
import { requestContext } from './middleware/requestContext.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requireStripe } from './middleware/requireStripe.js';
import { apiRouter } from './routes/index.js';
import { paymentController } from './controllers/payment.controller.js';
import { AppError } from './utils/errors.js';

/**
 * Room for the JSON around a base64 payload.
 *
 * The body is `{"kind":…,"fileName":…,"mimeType":…,"content":"<base64>"}`, so
 * the limit has to cover the encoded content plus those few short fields.
 * `fileName` is capped at 120 characters by the validator and the rest are
 * fixed-length, so 4KB is generous rather than tuned.
 */
const UPLOAD_ENVELOPE_SLACK_BYTES = 4 * 1024;

/**
 * The body limit that admits a file of `maxDecodedBytes` once base64 has grown
 * it by a third.
 *
 * Derived from the same `MAX_*_BYTES` the service checks the DECODED length
 * against, rather than being a second number that can drift from it. That drift
 * is the bug: a 20MB document ceiling behind a 256KB parser meant every real
 * student ID was rejected by Express before the route it was addressed to ever
 * ran, and the resulting 413 fell through to a generic 500.
 */
function base64BodyLimit(maxDecodedBytes: number): number {
  return Math.ceil(maxDecodedBytes / 3) * 4 + UPLOAD_ENVELOPE_SLACK_BYTES;
}

/** body-parser's stable discriminator for "the body exceeded `limit`". */
function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: unknown }).type === 'entity.too.large'
  );
}

/**
 * A JSON parser for one upload route, sized from that route's own ceiling.
 *
 * The size error is translated here rather than in the global handler because
 * this is the only place that knows WHICH ceiling was hit — the handler sees
 * one error for two routes with different limits, and would have to guess.
 */
function uploadJsonBody(maxDecodedBytes: number, noun: string): RequestHandler {
  const parse = express.json({ limit: base64BodyLimit(maxDecodedBytes) });
  const megabytes = Math.round(maxDecodedBytes / 1024 / 1024);

  return (req, res, next) => {
    parse(req, res, (error?: unknown) => {
      if (isPayloadTooLarge(error)) {
        next(AppError.tooLarge(`That ${noun} is larger than ${megabytes}MB.`));
        return;
      }
      next(error);
    });
  };
}

export function createApp(): Express {
  const app = express();

  // Behind a load balancer, `req.ip` is the balancer unless we say how many
  // hops to trust. Getting this wrong makes rate limiting either useless
  // (everyone shares one IP) or spoofable (trusting a client-set header).
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  app.use(requestContext);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).context?.requestId ?? '',
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  app.use(
    helmet({
      // This API serves JSON to a native client, never HTML to a browser, so
      // the script-related CSP directives are locked to 'none' rather than
      // tuned — nothing here should ever execute anywhere.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header — a native app or a server-to-server call. Browsers
        // always send one, so this is not a CORS bypass for a hostile page.
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        callback(new AppError(403, 'forbidden', 'Origin not allowed.'));
      },
      credentials: false,
      maxAge: 86_400,
    }),
  );

  app.use(compression());

  // The Stripe webhook is mounted BEFORE the JSON parser and takes the raw
  // body: signature verification hashes the exact bytes Stripe sent, and a
  // parse/restringify round trip changes them.
  app.post(
    '/webhooks/stripe',
    requireStripe,
    express.raw({ type: 'application/json', limit: '1mb' }),
    paymentController.webhook,
  );

  /*
   * The two upload routes, and only those, take a larger body.
   *
   * Mounted BEFORE the global parser, which is the only ordering that works:
   * body-parser marks a request it has read with `_body`, so the 256kb parser
   * below sees these as already parsed and skips them. Mounting them after
   * would achieve nothing — the global parser would have rejected the body
   * first, which is precisely the bug.
   *
   * Declared as `post` on the exact paths rather than `use` on a prefix, so
   * nothing else — `GET /v1/me/documents/:id` included — inherits the larger
   * ceiling. Every other request in the API keeps the 256kb limit.
   */
  app.post('/v1/me/documents', uploadJsonBody(env.MAX_DOCUMENT_BYTES, 'file'));
  app.post('/v1/me/avatar', uploadJsonBody(env.MAX_AVATAR_BYTES, 'image'));

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), version: '1.0.0' });
  });

  app.use('/v1', globalLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
