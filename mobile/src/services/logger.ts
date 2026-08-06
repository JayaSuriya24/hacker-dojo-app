import { appConfig } from '~/constants/config';

/**
 * Centralised logging.
 *
 * `console.log` is banned by ESLint across `mobile/`, and this is the reason:
 * a stray log statement in a release build is both a performance cost on the JS
 * thread and, more often than anyone expects, a way for a token or an email
 * address to end up in a device log that any installed app can read on some
 * platforms.
 *
 * In development everything prints. In production only warnings and errors are
 * kept, and they are forwarded to whichever crash reporter is wired into
 * `setReporter` — Sentry, Bugsnag, or nothing at all.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

type Reporter = (level: LogLevel, message: string, context?: LogContext) => void;

let reporter: Reporter | null = null;

/** Wire a crash reporter in once, from the root provider. */
export function setReporter(next: Reporter | null): void {
  reporter = next;
}

const SENSITIVE_KEYS = /token|password|secret|authorization|client_secret|apikey|api_key/i;

/**
 * Strip anything that looks like a credential before a log leaves the app.
 * Applied to the whole context object rather than at call sites, so a new log
 * statement cannot leak by forgetting to redact.
 */
function scrub(context: LogContext | undefined): LogContext | undefined {
  if (!context) return undefined;

  const safe: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEYS.test(key)) {
      safe[key] = '[redacted]';
    } else if (value instanceof Error) {
      safe[key] = { name: value.name, message: value.message };
    } else if (typeof value === 'object' && value !== null) {
      safe[key] = scrub(value as LogContext);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const safeContext = scrub(context);

  if (__DEV__) {
    const line = `[${level}] ${message}`;
    if (level === 'error') console.error(line, safeContext ?? '');
    else if (level === 'warn') console.warn(line, safeContext ?? '');
    // The only sanctioned console.log in the app, and only under __DEV__.
    // eslint-disable-next-line no-console
    else console.log(line, safeContext ?? '');
  }

  // Debug and info are dropped in production: they are development aids, and
  // shipping them costs bandwidth and quota for no diagnostic value.
  if (!__DEV__ && (level === 'debug' || level === 'info')) return;

  reporter?.(level, message, safeContext);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),

  /** Convenience for a caught exception with its surrounding context. */
  exception: (error: unknown, context?: LogContext) => {
    const message = error instanceof Error ? error.message : String(error);
    emit('error', message, {
      ...context,
      ...(error instanceof Error
        ? { stack: appConfig.isProduction ? undefined : error.stack }
        : {}),
    });
  },
};
