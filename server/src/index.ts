import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { verifyStartupDependencies } from './config/startup.js';
import { schedulerService } from './services/scheduler.service.js';

const app = createApp();

/**
 * `host` is passed explicitly but is normally undefined, which listens on every
 * interface exactly as omitting it does — see the note on `HOST` in env.ts for
 * why that default is not written as `0.0.0.0`.
 *
 * The bound address is read back from the socket rather than echoed from the
 * configuration: those differ whenever the platform falls back, and the log is
 * only worth having if it says where the process actually is.
 */
const server = app.listen({ port: env.PORT, host: env.HOST }, () => {
  const address = server.address();

  // Express hands this same callback to `server.once('error')` as well as to
  // 'listening' (see its `app.listen`), so it runs on a FAILED bind too — the
  // API used to announce itself as listening when the port was taken and the
  // process was already on its way out. A null address is that case; the
  // handler below has the real reason and the exit status.
  if (address === null) return;

  // No `env` key here: pino's `base` already stamps NODE_ENV on every line, and
  // adding it again emitted the field TWICE in the same JSON object. Duplicate
  // keys are last-one-wins in most parsers and a hard error in some ingestors.
  logger.info(
    typeof address === 'string'
      ? { socket: address }
      : { port: address.port, host: address.address },
    'Hacker Dojo API listening',
  );
});

/**
 * A port already taken is a configuration mistake, and it should read as one.
 *
 * Without this the EADDRINUSE reaches `uncaughtException` below, which calls
 * `shutdown` — which drains a server that never listened, gets
 * `ERR_SERVER_NOT_RUNNING` back from `close`, and logs "Error while closing
 * server". The exit status was right; the two errors above it pointed nowhere
 * near the actual problem. Nothing is listening and the scheduler's timers are
 * unref'd, so there is genuinely nothing to drain here.
 */
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.fatal(
      { port: env.PORT, host: env.HOST ?? '(all interfaces)' },
      'Port is already in use — is another instance running?',
    );
  } else if (error.code === 'EACCES') {
    logger.fatal(
      { port: env.PORT },
      'Not permitted to bind this port — ports below 1024 need privileges.',
    );
  } else {
    logger.fatal({ err: error }, 'Server failed to start');
  }
  process.exit(1);
});

/**
 * Reachability check.
 *
 * `env.ts` proves the configuration is well-formed; this proves it is correct —
 * that the Supabase URL answers with these credentials and that Stripe accepts
 * this key. A container that boots green and fails every request on the first
 * member is worse than one that never reports ready.
 *
 * It runs after `listen` so the health endpoint is already answering while the
 * checks are in flight, and it exits non-zero in production rather than serving
 * a broken deployment.
 */
void verifyStartupDependencies().then((report) => {
  if (!report.ok) {
    logger.fatal({ failures: report.failures }, 'Startup verification failed');
    if (env.NODE_ENV === 'production') {
      shutdown('startupVerification', 1);
    }
    return;
  }
  logger.info({ checks: report.checked }, 'Startup verification passed');
});

// Occupancy sampling, booking and membership reminders, the weekly digest.
// Gated on RUN_SCHEDULER so a second replica does not double every send.
const stopScheduler = schedulerService.start();

/**
 * Graceful shutdown.
 *
 * On SIGTERM the orchestrator has already stopped routing new traffic, so the
 * job is to let in-flight requests finish. A hard exit here would cut a member
 * off mid-checkout, after Stripe was called but before the response landed.
 *
 * `exitCode` is what the process reports once the drain completes, and it is
 * the caller's outcome rather than the drain's: draining cleanly after a fatal
 * fault is still a fatal fault. It used to be hardcoded to 0, so a production
 * container that could not reach Supabase or Stripe — or that hit an unhandled
 * rejection — drained politely and exited SUCCESSFULLY. Nothing keyed on exit
 * status could tell that deployment apart from a deliberate stop, and a
 * `restart: on-failure` policy would not restart it.
 *
 * Defaulted to 0 because the signal paths below are the ordinary case: SIGTERM
 * and SIGINT are someone asking the process to stop, and it did.
 */
function shutdown(signal: string, exitCode = 0): void {
  logger.info({ signal }, 'Shutting down');

  // Stop scheduling new background work before draining, so nothing starts a
  // write while connections are closing.
  stopScheduler();

  // Always 1, regardless of `exitCode`: connections that would not drain in
  // ten seconds means this process is leaving in a state nobody asked for.
  const forceExit = setTimeout(() => {
    logger.error('Forcing exit — connections did not drain in time');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Error while closing server');
      process.exit(1);
    }
    logger.info('Closed cleanly');
    process.exit(exitCode);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// An unhandled rejection leaves the process in an unknown state. Log it, then
// let the orchestrator restart into a known one.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  shutdown('uncaughtException', 1);
});
