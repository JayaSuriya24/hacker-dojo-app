import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { verifyStartupDependencies } from './config/startup.js';
import { schedulerService } from './services/scheduler.service.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Hacker Dojo API listening');
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
