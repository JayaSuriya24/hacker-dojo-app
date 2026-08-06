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
  unlockDoorSchema,
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
import { paymentController } from '../controllers/payment.controller.js';
import { accessController } from '../controllers/access.controller.js';
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
apiRouter.post('/me/session/extend', requireAuth, mutationLimiter, bookingController.extendSession);
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
// Door access
//
// `sensitiveLimiter` rather than `mutationLimiter`: this opens a physical door,
// and the service keeps a second per-member counter in the audit log besides,
// because an in-process limiter resets on deploy.
// ---------------------------------------------------------------------------
apiRouter.get('/me/key', requireAuth, requireActiveMembership, accessController.digitalKey);
apiRouter.post(
  '/me/key/unlock',
  requireAuth,
  requireActiveMembership,
  sensitiveLimiter,
  validate({ body: unlockDoorSchema }),
  accessController.unlock,
);
apiRouter.get('/me/key/history', requireAuth, accessController.history);

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
apiRouter.get('/startups', communityController.startups);
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
const staffOnly = [requireAuth, requireRole('steward', 'admin')] as const;

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
