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
      shutdown('startupVerification');
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
 */
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');

  // Stop scheduling new background work before draining, so nothing starts a
  // write while connections are closing.
  stopScheduler();

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
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// An unhandled rejection leaves the process in an unknown state. Log it, then
// let the orchestrator restart into a known one.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  shutdown('uncaughtException');
});
