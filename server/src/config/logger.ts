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
      // `headers` reached directly rather than through pino-http's `req`.
      'headers.authorization',
      '*.authorization',
      'password',
      '*.password',
      'token',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.client_secret',
      '*.clientSecret',
      // The database spells these in snake_case, and `*.token` does not match
      // `push_token` — a member's push token is a credential for sending to
      // their device, and a logged row would have carried it in full.
      'push_token',
      '*.push_token',
      '*.pushToken',
      // The Wi-Fi PIN, which `wifiService` returns as a bare `pin` field. It is
      // five digits and it is the member's network credential.
      'pin',
      '*.pin',
      '*.apiKey',
      '*.api_key',
      // supabase-js sends the key in a header spelled exactly `apikey` — one
      // word, lower-case — which neither of the two above matches.
      'apikey',
      '*.apikey',
      'req.headers.apikey',
      '*.secret',
      '*.serviceRoleKey',
      '*.service_role_key',
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
