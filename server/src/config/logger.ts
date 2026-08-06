import pino from 'pino';
import { env, isProduction, isTest } from './env.js';

/**
 * Structured logging.
 *
 * The redaction list is the important part: request logs otherwise capture the
 * Authorization header on every single call, which turns the log store into a
 * credential store. Everything that could carry a secret is censored at the
 * serialiser, not at the call site, so a new log statement can't leak by
 * forgetting.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'hackerdojo-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["stripe-signature"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.client_secret',
      '*.clientSecret',
      'body.password',
      'body.token',
    ],
    censor: '[redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname,service,env',
          },
        },
      }),
});

export type Logger = typeof logger;
