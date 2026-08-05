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
}

export interface Me {
  id: string;
  email: string;
  name: string;
  initials: string;
  avatarPath: string | null;
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
  requires_cert: boolean;
  min_duration_minutes: number;
  max_duration_minutes: number;
  opens_at: string;
  closes_at: string;
  image_path: string | null;
  zone_name: string | null;
  free_from: string;
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
  profile_id: string;
  resource_id: string | null;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
}

export interface MemberCard {
  id: string;
  name: string;
  initials: string;
  avatarPath: string | null;
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
  founded_year: string;
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
  ephemeralKeySecret: string;
  customerId: string;
  publishableAmountCents: number;
  paymentId: string;
}
