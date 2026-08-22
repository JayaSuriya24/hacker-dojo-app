import { Router } from 'express';
import {
  optionalAuth,
  requireActiveMembership,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  mutationLimiter,
  paymentLimiter,
  sensitiveLimiter,
  uploadLimiter,
} from '../middleware/rateLimit.js';
import { requireStripe } from '../middleware/requireStripe.js';
import { uuidParam } from '../validators/common.validators.js';
import {
  applicationStatusSchema,
  availabilityQuery,
  createStartupSchema,
  dayScheduleQuery,
  reorderStartupsSchema,
  startupQuery,
  updateStartupSchema,
  bookTourSchema,
  checkInSchema,
  createBookingSchema,
  directoryQuery,
  donationIntentSchema,
  grantCertificationSchema,
  hostEventSchema,
  listEventsQuery,
  listResourcesQuery,
  membershipIntentSchema,
  rescheduleBookingSchema,
  reviewDocumentSchema,
  staffQueueQuery,
  tourStatusSchema,
  updateNotificationsSchema,
  updateProfileSchema,
  uploadAvatarSchema,
  uploadDocumentSchema,
  upsertContentSchema,
  upsertSettingSchema,
} from '../validators/index.js';
import { profileController } from '../controllers/profile.controller.js';
import { eventController } from '../controllers/event.controller.js';
import { bookingController } from '../controllers/booking.controller.js';
import { communityController } from '../controllers/community.controller.js';
import { startupController } from '../controllers/startup.controller.js';
import { paymentController } from '../controllers/payment.controller.js';
import { wifiController } from '../controllers/wifi.controller.js';
import { documentController } from '../controllers/document.controller.js';
import { staffController } from '../controllers/staff.controller.js';

/**
 * The API surface.
 *
 * Read the middleware chain on each line as the access-control statement it is:
 * `optionalAuth` means anonymous-but-richer-when-signed-in, `requireAuth` means
 * signed in, `requireActiveMembership` means a paying member, `requireRole`
 * means staff. Every gated surface in the app has its counterpart here.
 *
 * Every route that writes carries a limiter. That is now a rule with no
 * exceptions rather than a judgement call per route — `PATCH /me/notifications`
 * was the one that slipped through, and "this one is cheap" is exactly the
 * reasoning that leaves a gap.
 */
export const apiRouter: Router = Router();

// ---------------------------------------------------------------------------
// Me — profile, notification settings, uploads
// ---------------------------------------------------------------------------
apiRouter.get('/me', requireAuth, profileController.me);
apiRouter.patch(
  '/me',
  requireAuth,
  mutationLimiter,
  validate({ body: updateProfileSchema }),
  profileController.update,
);
apiRouter.get('/me/notifications', requireAuth, profileController.notifications);
apiRouter.patch(
  '/me/notifications',
  requireAuth,
  mutationLimiter,
  validate({ body: updateNotificationsSchema }),
  profileController.updateNotifications,
);
/**
 * Delete your own account. Required in-app by App Store guideline 5.1.1(v).
 *
 * Note what this route does NOT take: no id in the path, no body at all. The
 * account deleted is the one the bearer token authenticates, which is the only
 * shape that makes "one member deletes another" unexpressible rather than
 * merely checked for.
 *
 * `sensitiveLimiter` rather than `mutationLimiter`: this is irreversible and
 * cancels a subscription on the way through, so it is gated like the other
 * actions with a consequence outside the database.
 */
apiRouter.delete('/me', requireAuth, sensitiveLimiter, profileController.deleteAccount);
apiRouter.get('/me/bookings', requireAuth, bookingController.listMine);

// Presence. Check-in is what populates `sessions`, which is what drives the
// occupancy dial, the directory's presence dot and the "Who's here" tab.
apiRouter.get('/me/session', requireAuth, bookingController.liveSession);
apiRouter.post(
  '/me/session',
  requireAuth,
  requireActiveMembership,
  mutationLimiter,
  validate({ body: checkInSchema }),
  bookingController.checkIn,
);
// Extending is staying, so it is gated exactly like checking in was. Without
// this a member whose membership lapsed mid-session could hold the floor
// indefinitely: a check-in on the floor carries no ceiling the way a booth
// session does, so the extension could be repeated forever on a membership
// that ended hours ago.
apiRouter.post(
  '/me/session/extend',
  requireAuth,
  requireActiveMembership,
  mutationLimiter,
  bookingController.extendSession,
);
// Ending is deliberately NOT gated. Someone whose membership lapsed while they
// were on the floor still has to be able to check out — refusing would leave
// them counted in the occupancy dial forever and holding the one-live-session
// index slot that their next check-in needs.
apiRouter.post('/me/session/end', requireAuth, mutationLimiter, bookingController.endSession);

// Avatar. Upload runs as the caller so the storage policy still arbitrates.
apiRouter.post(
  '/me/avatar',
  requireAuth,
  uploadLimiter,
  validate({ body: uploadAvatarSchema }),
  documentController.uploadAvatar,
);
apiRouter.delete('/me/avatar', requireAuth, mutationLimiter, documentController.deleteAvatar);

// Verification documents — student ID, DD-214.
apiRouter.get('/me/documents', requireAuth, documentController.listMine);
apiRouter.post(
  '/me/documents',
  requireAuth,
  uploadLimiter,
  validate({ body: uploadDocumentSchema }),
  documentController.upload,
);
apiRouter.get(
  '/me/documents/:id',
  requireAuth,
  validate({ params: uuidParam }),
  documentController.detail,
);
apiRouter.delete(
  '/me/documents/:id',
  requireAuth,
  mutationLimiter,
  validate({ params: uuidParam }),
  documentController.remove,
);

// ---------------------------------------------------------------------------
// Member Wi-Fi. The guest network lives in `/settings` because its password is
// posted on the wall; this is the per-member credential, so it is gated exactly
// like the door key and never travels on a route that serves anonymous callers.
// ---------------------------------------------------------------------------
apiRouter.get('/me/wifi', requireAuth, requireActiveMembership, wifiController.credential);
apiRouter.post(
  '/me/wifi/rotate',
  requireAuth,
  requireActiveMembership,
  // `sensitiveLimiter` for the same reason as the door: this mints a
  // credential, and an unbounded loop of rotations is a way to spend someone
  // else's PIN space and lock them off the network.
  sensitiveLimiter,
  wifiController.rotate,
);

// ---------------------------------------------------------------------------
// Door access
//
// Deliberately absent. Physical access is handled entirely by the Kisi app:
// Kisi holds the member's credential, authenticates and authorises them, picks
// the door, opens it and keeps the access history. This API exposed
// `/me/key`, `/me/key/unlock` and `/me/key/history` and no longer does — a
// second authorisation path that cannot actually move the lock is a source of
// truth that can only drift from the one that can.
//
// The `door_credentials` and `door_access_logs` tables are intentionally left
// in place. They hold the historical record of unlocks made while this API
// owned the door, and dropping them would destroy that audit trail; nothing
// writes to them now.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Membership plans — public: the pricing table is a conversion surface.
// ---------------------------------------------------------------------------
apiRouter.get('/plans', profileController.plans);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
apiRouter.get('/events', optionalAuth, validate({ query: listEventsQuery }), eventController.list);
apiRouter.get('/events/:id', optionalAuth, validate({ params: uuidParam }), eventController.detail);
apiRouter.post(
  '/events/:id/rsvp',
  requireAuth,
  mutationLimiter,
  validate({ params: uuidParam }),
  eventController.rsvp,
);
apiRouter.delete(
  '/events/:id/rsvp',
  requireAuth,
  mutationLimiter,
  validate({ params: uuidParam }),
  eventController.cancelRsvp,
);
apiRouter.post(
  '/event-requests',
  requireAuth,
  requireActiveMembership,
  mutationLimiter,
  validate({ body: hostEventSchema }),
  eventController.requestToHost,
);

// ---------------------------------------------------------------------------
// Resources and bookings
// ---------------------------------------------------------------------------
apiRouter.get(
  '/resources',
  validate({ query: listResourcesQuery }),
  bookingController.listResources,
);
// Before `/resources/:id/...` so `schedule` is not read as a resource id.
// Times are public like the two routes around it; the booker's name is added
// only for an active member — see `bookingService.daySchedule`.
apiRouter.get(
  '/resources/schedule',
  // `optionalAuth`, not `requireAuth`: the times stay public, and the caller's
  // membership is what decides whether the booker's NAME rides along. A guest
  // gets a usable answer rather than a 401.
  optionalAuth,
  validate({ query: dayScheduleQuery }),
  bookingController.daySchedule,
);
apiRouter.get(
  '/resources/:id/availability',
  validate({ params: uuidParam, query: availabilityQuery }),
  bookingController.availability,
);
apiRouter.post(
  '/bookings',
  requireAuth,
  requireActiveMembership,
  mutationLimiter,
  validate({ body: createBookingSchema }),
  bookingController.create,
);
apiRouter.patch(
  '/bookings/:id',
  requireAuth,
  requireActiveMembership,
  mutationLimiter,
  validate({ params: uuidParam, body: rescheduleBookingSchema }),
  bookingController.reschedule,
);
apiRouter.delete(
  '/bookings/:id',
  requireAuth,
  mutationLimiter,
  validate({ params: uuidParam }),
  bookingController.cancel,
);

// ---------------------------------------------------------------------------
// Community — the directory is a member benefit; startups and occupancy are not.
// ---------------------------------------------------------------------------
apiRouter.get(
  '/members',
  requireAuth,
  requireActiveMembership,
  validate({ query: directoryQuery }),
  communityController.directory,
);
apiRouter.get(
  '/members/:id',
  requireAuth,
  requireActiveMembership,
  validate({ params: uuidParam }),
  communityController.member,
);
/**
 * The staff gate, shared by every write below.
 *
 * Declared here rather than beside the `/staff/*` routes because the startup
 * writes are the first use and a `const` is not hoisted — leaving it further
 * down threw `Cannot access 'staffOnly' before initialization` at import time,
 * taking the whole API down rather than failing one route.
 *
 * Two independent gates on every line that spreads it: `requireRole` here, and
 * `is_staff()` in the RLS policy each query runs under. A routing mistake alone
 * is not enough to expose anything.
 */
const staffOnly = [requireAuth, requireRole('steward', 'admin')] as const;

// ---------------------------------------------------------------------------
// Startups — a public, editorial list that staff maintain.
//
// The read stays open to everyone, signed in or not: it is a recruiting
// surface, and someone deciding whether to join should be able to see what came
// out of the place. Every write is `staffOnly`, the same gate the rest of the
// staff surface uses.
//
// `/startups/reorder` is declared BEFORE `/startups/:key` or Express would read
// "reorder" as a startup key and answer 404.
// ---------------------------------------------------------------------------
apiRouter.get('/startups', validate({ query: startupQuery }), startupController.list);
apiRouter.patch(
  '/startups/reorder',
  ...staffOnly,
  mutationLimiter,
  validate({ body: reorderStartupsSchema }),
  startupController.reorder,
);
apiRouter.get('/startups/:key', startupController.detail);
apiRouter.post(
  '/startups',
  ...staffOnly,
  mutationLimiter,
  validate({ body: createStartupSchema }),
  startupController.create,
);
apiRouter.patch(
  '/startups/:id',
  ...staffOnly,
  mutationLimiter,
  validate({ params: uuidParam, body: updateStartupSchema }),
  startupController.update,
);
apiRouter.delete(
  '/startups/:id',
  ...staffOnly,
  mutationLimiter,
  validate({ params: uuidParam }),
  startupController.remove,
);
apiRouter.get('/occupancy', communityController.occupancy);

// ---------------------------------------------------------------------------
// Dojo — programs, about, settings, tours
// ---------------------------------------------------------------------------
apiRouter.get('/programs', communityController.programs);
apiRouter.get('/about', communityController.about);
// `optionalAuth`: the Wi-Fi password is a members-only row, and which rows come
// back is decided by RLS rather than by a branch in the controller.
apiRouter.get('/settings', optionalAuth, communityController.settings);
apiRouter.post(
  '/tours',
  optionalAuth,
  mutationLimiter,
  validate({ body: bookTourSchema }),
  communityController.bookTour,
);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
apiRouter.post(
  '/payments/membership-intent',
  requireAuth,
  requireStripe,
  paymentLimiter,
  validate({ body: membershipIntentSchema }),
  paymentController.membershipIntent,
);
apiRouter.post(
  '/payments/donation-intent',
  optionalAuth,
  requireStripe,
  paymentLimiter,
  validate({ body: donationIntentSchema }),
  paymentController.donationIntent,
);
apiRouter.post(
  '/payments/billing-portal',
  requireAuth,
  requireStripe,
  paymentLimiter,
  paymentController.billingPortal,
);

// ---------------------------------------------------------------------------
// Staff
//
// Two independent gates on every line: `requireRole` here, and `is_staff()` in
// the RLS policy each query runs under. A routing mistake alone is not enough
// to expose anything.
// ---------------------------------------------------------------------------

apiRouter.get('/staff/dashboard', ...staffOnly, staffController.dashboard);
apiRouter.get(
  '/staff/queue',
  ...staffOnly,
  validate({ query: staffQueueQuery }),
  staffController.queue,
);
apiRouter.patch(
  '/staff/tours/:id',
  ...staffOnly,
  mutationLimiter,
  validate({ params: uuidParam, body: tourStatusSchema }),
  staffController.setTourStatus,
);
apiRouter.patch(
  '/staff/event-requests/:id',
  ...staffOnly,
  mutationLimiter,
  validate({ params: uuidParam, body: applicationStatusSchema }),
  staffController.setEventRequestStatus,
);
apiRouter.patch(
  '/staff/applications/:id',
  ...staffOnly,
  mutationLimiter,
  validate({ params: uuidParam, body: applicationStatusSchema }),
  staffController.setApplicationStatus,
);
apiRouter.get('/staff/documents', ...staffOnly, documentController.listPending);
apiRouter.patch(
  '/staff/documents/:id',
  ...staffOnly,
  mutationLimiter,
  validate({ params: uuidParam, body: reviewDocumentSchema }),
  documentController.review,
);
apiRouter.get(
  '/staff/members/:id/certifications',
  ...staffOnly,
  validate({ params: uuidParam }),
  staffController.listCertifications,
);
apiRouter.post(
  '/staff/certifications',
  ...staffOnly,
  mutationLimiter,
  validate({ body: grantCertificationSchema }),
  staffController.grantCertification,
);
apiRouter.delete(
  '/staff/certifications/:id',
  ...staffOnly,
  mutationLimiter,
  validate({ params: uuidParam }),
  staffController.revokeCertification,
);
apiRouter.get('/staff/content', ...staffOnly, staffController.listContent);
apiRouter.put(
  '/staff/content',
  ...staffOnly,
  mutationLimiter,
  validate({ body: upsertContentSchema }),
  staffController.upsertContent,
);
apiRouter.put(
  '/staff/settings',
  ...staffOnly,
  mutationLimiter,
  validate({ body: upsertSettingSchema }),
  staffController.upsertSetting,
);
