import express, { type Express } from 'express';
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
