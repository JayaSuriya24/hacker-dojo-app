/**
 * Domain types — the contract between the API and the app.
 *
 * These mirror the view shapes the services return (`server/src/services/*`),
 * not the database rows. The client never sees a snake_case column name; the
 * server does that translation once so the UI is not littered with mapping.
 */

export type MemberRole = 'guest' | 'member' | 'steward' | 'admin';
export type BillingPeriod = 'month' | 'year';
export type ResourceKind = 'hardware' | 'room';
export type ResourceStatus = 'available' | 'in_use' | 'maintenance';
export type RsvpStatus = 'going' | 'waitlisted' | 'cancelled';
/**
 * The `event_category` enum, in its database order.
 *
 * Exported as a value, not just a type, because three places need to enumerate
 * it — the host-event chips, its own Zod schema, and the Events filter — and
 * each of them used to keep its own hand-written copy. Adding a category then
 * meant editing four lists and noticing all four.
 */
export const EVENT_CATEGORIES = [
  'Hackathons',
  'Hardware',
  'AI/ML',
  'Community',
  'Workshops',
  'Talks',
  'Meetups',
  'Social',
  'Startups',
  'Robotics',
  'Security',
  'Open House',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export interface Membership {
  planId: string;
  planName: string;
  status: string;
  period: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** True once the plan is a real Stripe subscription the portal can manage. */
  manageable: boolean;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  initials: string;
  avatarPath: string | null;
  /** Resolved by the API. The client never builds a storage URL itself. */
  avatarUrl: string | null;
  role: MemberRole;
  bio: string | null;
  company: string | null;
  currentProject: string | null;
  skills: string[];
  directoryVisible: boolean;
  /** True once the skills prompt has run — answered or skipped. */
  skillsPrompted: boolean;
  memberSince: string | null;
  isActiveMember: boolean;
  /**
   * True once this account has a tour booked or attended. Decided by the API —
   * the app never counts tour rows itself. Drives whether the tour invitation
   * is offered at all.
   */
  hasBookedTour: boolean;
  membership: Membership | null;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonthlyCents: number;
  priceAnnualCents: number | null;
  isAddon: boolean;
  isPopular: boolean;
  requiresProof: boolean;
  /**
   * The bullet list on the plan card, in display order.
   *
   * Optional because the CLIENT cannot rely on it, even though the API always
   * sends it: `usePlans` caches at the static tier, so a browser that loaded
   * the plans before this field existed keeps serving that response for half an
   * hour. Typed this way the compiler forces every reader to handle its
   * absence, rather than discovering it as a crash inside an error boundary.
   */
  benefits?: string[];
  annualSavingCents: number | null;
}

export interface DojoEvent {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: EventCategory;
  hostName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  goingCount: number;
  waitlistCount: number;
  atCapacity: boolean;
  isToday: boolean;
  coverPath: string | null;
  rsvpStatus: RsvpStatus | null;
  checkinCode: string | null;
  fillPercent: number;
  /**
   * The schedule behind a repeating event. Served on the detail only — the
   * feed never shows it, so it is not paid for there.
   */
  series: EventSeries | null;
}

export interface EventSeries {
  id: string;
  /** Already a sentence, e.g. "Every week on Tuesday until August 25, 2026". */
  summary: string;
  /** The next few dates, this one included. Each is its own event. */
  upcoming: Array<{ eventId: string; startsAt: string; endsAt: string }>;
}

export interface Resource {
  id: string;
  slug: string;
  kind: ResourceKind;
  name: string;
  model: string | null;
  seats: number | null;
  amenities: string | null;
  status: ResourceStatus;
  requiresCert: boolean;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  opensAt: string;
  closesAt: string;
  imagePath: string | null;
  zoneName: string | null;
  freeFrom: string;
}

export interface Slot {
  label: string;
  startsAt: string;
  available: boolean;
}

/**
 * A reservation as another member sees it.
 *
 * Carries no booking id and no reference on purpose — those are the owner's
 * handles for modifying and cancelling. Mirrors `ReservationView` on the server.
 */
export interface RoomReservation {
  resourceId: string;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  /** `11:00 AM – 12:00 PM`, in the space's clock. */
  window: string;
  active: boolean;
  /**
   * Who has the room, or `null` when the viewer may not be told.
   *
   * The server decides: active members get the name, everyone else gets `null`,
   * and a member who hid themselves from the directory reads as "A member".
   * The UI must not infer anything from a null beyond "not shown".
   */
  bookedBy: string | null;
}

export interface Booking {
  id: string;
  reference: string;
  resourceId: string;
  resourceName: string;
  resourceKind: ResourceKind | null;
  startsAt: string;
  endsAt: string;
  when: string;
}

export interface LiveSession {
  id: string;
  profileId: string;
  resourceId: string | null;
  /** The name of the thing being held — "Phone Booth B", or "The floor". */
  resourceName: string;
  resourceKind: ResourceKind | null;
  zoneName: string | null;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
}

/**
 * The answer to checking in or out. The occupancy the act produced rides along
 * with the session so the dial can be updated without a second request — see
 * `useCheckIn`. Null when nothing changed or the server's resample failed.
 */
export interface PresenceChange {
  session: LiveSession;
  occupancy: Occupancy | null;
}

export interface MemberCard {
  id: string;
  name: string;
  initials: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  company: string | null;
  bio: string | null;
  currentProject: string | null;
  skills: string[];
  memberSince: string | null;
  zoneName: string | null;
  isHere: boolean;
  skillLine: string;
}

export interface Startup {
  id: string;
  /** Addressable form of the name, e.g. `kettle-works`. */
  slug: string;
  name: string;
  mark: string;
  tagline: string;
  stage: string;
  foundedYear: string;
  hiring: boolean;
  website: string | null;
  /** Display position. Staff reorder the list; everyone else just reads it. */
  sortOrder: number;
}

export interface StartupInput {
  name: string;
  mark: string;
  tagline: string;
  stage: string;
  foundedYear: string;
  hiring: boolean;
  website?: string | null;
}

export interface Occupancy {
  total: number;
  capacity: number;
  percent: number;
  zones: Array<{ name: string; headCount: number; capacity: number }>;
}

export interface ProgramTrack {
  id: string;
  name: string;
  description: string;
  audience: string;
  outcome: string;
}

export interface Program {
  id: string;
  name: string;
  meta: string;
  blurb: string;
  tracks: ProgramTrack[];
}

export interface AboutContent {
  testimonials: Array<{ id: string; name: string; role: string; quote: string; initials: string }>;
  press: Array<{ id: string; outlet: string; year: string; headline: string; url: string | null }>;
  board: Array<{ id: string; name: string; role: string; initials: string }>;
  faqs: Array<{ id: string; question: string; answer: string }>;
  /** `key` is the stable list identity — `name` is editable copy and may collide. */
  pillars: Array<{ key: string; name: string; line: string }>;
}

export interface NotificationPreferences {
  events: boolean;
  bookings: boolean;
  weeklyDigest: boolean;
  hasPushToken: boolean;
}

export interface PaymentSheetParams {
  paymentIntentClientSecret: string;
  /** Present when the subscription needs a payment method rather than a charge. */
  setupIntentClientSecret: string | null;
  ephemeralKeySecret: string;
  customerId: string;
  publishableAmountCents: number;
  paymentId: string;
  subscriptionId: string | null;
}

export interface BillingPortalSession {
  url: string;
  returnUrl: string;
}

// ---------------------------------------------------------------------------
// Site settings and Wi-Fi
//
// Door access types used to live here. Physical access is Kisi's now — it holds
// the credential, decides, opens and keeps the history — so this app models
// none of it.
// ---------------------------------------------------------------------------

/** Mirrors `SiteSettingsView` in `server/src/services/content.service.ts`. */
export interface SiteSettings {
  /** Public facts. Always present. */
  labStatus: string | null;
  labHours: string | null;
  /**
   * The guest network. Public on purpose: its password is posted on the wall,
   * and a visitor who cannot see it is exactly who it exists for.
   */
  wifiGuestSsid: string | null;
  wifiGuestPassword: string | null;
  /**
   * The member network's name. Public too — knowing a network exists is not
   * access to it. The credential that opens it is per-member and comes from
   * `/me/wifi`, never from here.
   */
  wifiSsid: string | null;
}

export interface WifiCredential {
  ssid: string | null;
  username: string;
  pin: string;
  issuedAt: string;
  rotatedAt: string | null;
}

export type DocumentKind = 'student_id' | 'veteran_proof' | 'certification' | 'other';
export type DocumentStatus = 'submitted' | 'approved' | 'rejected';

export interface MemberDocument {
  id: string;
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  /** Short-lived signed URL. Null in list responses. */
  url: string | null;
}

export interface AvatarUploadResult {
  avatarPath: string;
  avatarUrl: string;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export type StaffQueueKind = 'tour' | 'event_request' | 'program_application' | 'document';
export type ApplicationStatus = 'submitted' | 'in_review' | 'accepted' | 'rejected' | 'withdrawn';
export type TourStatus = 'requested' | 'confirmed' | 'attended' | 'cancelled';

export interface StaffQueueItem {
  kind: StaffQueueKind;
  id: string;
  requesterName: string;
  requesterEmail: string | null;
  status: string;
  summary: string;
  detail: string | null;
  createdAt: string;
}

export interface StaffDashboard {
  pendingTours: number;
  pendingEventRequests: number;
  pendingApplications: number;
  pendingDocuments: number;
  activeMembers: number;
  onFloor: number;
  totalPending: number;
}

export interface ContentBlock {
  id: string;
  slot: string;
  key: string;
  label: string;
  value: string | null;
  sortOrder: number;
  active: boolean;
}
