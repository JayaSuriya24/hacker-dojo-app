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
export type EventCategory = 'Hackathons' | 'Hardware' | 'AI/ML' | 'Community';

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
  memberSince: string | null;
  isActiveMember: boolean;
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
  name: string;
  mark: string;
  tagline: string;
  stage: string;
  foundedYear: string;
  hiring: boolean;
  website: string | null;
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
  impact: Array<{ value: string; label: string }>;
  pillars: Array<{ name: string; line: string }>;
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
// Door access
// ---------------------------------------------------------------------------

export interface DigitalKey {
  keyId: string;
  active: boolean;
  issuedAt: string;
}

export interface UnlockResult {
  granted: boolean;
  keyId: string;
  unlockSeconds: number;
  at: string;
  message: string;
}

export interface DoorEvent {
  id: number;
  keyId: string;
  granted: boolean;
  reason: string | null;
  at: string;
}

// ---------------------------------------------------------------------------
// Site settings and uploads
// ---------------------------------------------------------------------------

export interface SiteSettings {
  labStatus: string | null;
  labHours: string | null;
  /** Members only. Null for a guest — which is what the UI gates the card on. */
  wifiSsid: string | null;
  wifiPassword: string | null;
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
