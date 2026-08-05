import { Router } from 'express';
import { optionalAuth, requireActiveMembership, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { mutationLimiter, paymentLimiter } from '../middleware/rateLimit.js';
import { uuidParam } from '../validators/common.validators.js';
import {
  availabilityQuery,
  bookTourSchema,
  createBookingSchema,
  directoryQuery,
  donationIntentSchema,
  hostEventSchema,
  listEventsQuery,
  listResourcesQuery,
  membershipIntentSchema,
  rescheduleBookingSchema,
  updateNotificationsSchema,
  updateProfileSchema,
} from '../validators/index.js';
import { profileController } from '../controllers/profile.controller.js';
import { eventController } from '../controllers/event.controller.js';
import { bookingController } from '../controllers/booking.controller.js';
import { communityController } from '../controllers/community.controller.js';
import { paymentController } from '../controllers/payment.controller.js';

/**
 * The API surface.
 *
 * Read the middleware chain on each line as the access-control statement it is:
 * `optionalAuth` means anonymous-but-richer-when-signed-in, `requireAuth` means
 * signed in, `requireActiveMembership` means a paying member. Every gated
 * surface in the app has its counterpart here.
 */
export const apiRouter: Router = Router();

// ---------------------------------------------------------------------------
// Me — profile, notification settings
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
  validate({ body: updateNotificationsSchema }),
  profileController.updateNotifications,
);
apiRouter.get('/me/bookings', requireAuth, bookingController.listMine);
apiRouter.get('/me/session', requireAuth, bookingController.liveSession);
apiRouter.post('/me/session/extend', requireAuth, mutationLimiter, bookingController.extendSession);
apiRouter.post('/me/session/end', requireAuth, mutationLimiter, bookingController.endSession);

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
// Dojo — programs, about, tours
// ---------------------------------------------------------------------------
apiRouter.get('/programs', communityController.programs);
apiRouter.get('/about', communityController.about);
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
  paymentLimiter,
  validate({ body: membershipIntentSchema }),
  paymentController.membershipIntent,
);
apiRouter.post(
  '/payments/donation-intent',
  optionalAuth,
  paymentLimiter,
  validate({ body: donationIntentSchema }),
  paymentController.donationIntent,
);
