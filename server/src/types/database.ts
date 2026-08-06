/**
 * Database row types.
 *
 * In a live project these are generated:
 *   supabase gen types typescript --local > src/types/database.ts
 *
 * They are hand-maintained here so the repository layer is typed against the
 * migrations in `supabase/migrations` without requiring a running database to
 * typecheck. Keep them in step with the SQL — the migrations are the source of
 * truth, this file is the projection.
 */

export type MemberRole = 'guest' | 'member' | 'steward' | 'admin';
export type MembershipStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
export type BillingPeriod = 'month' | 'year';
export type ResourceKind = 'hardware' | 'room';
export type ResourceStatus = 'available' | 'in_use' | 'maintenance';
export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type RsvpStatus = 'going' | 'waitlisted' | 'cancelled';
export type EventCategory = 'Hackathons' | 'Hardware' | 'AI/ML' | 'Community';
export type EventStatus = 'draft' | 'pending_review' | 'published' | 'cancelled';
export type ApplicationStatus = 'submitted' | 'in_review' | 'accepted' | 'rejected' | 'withdrawn';
export type PaymentStatus = 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'refunded';
export type TourStatus = 'requested' | 'confirmed' | 'attended' | 'cancelled';

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  initials: string;
  avatar_path: string | null;
  role: MemberRole;
  bio: string | null;
  company: string | null;
  current_project: string | null;
  skills: string[];
  phone: string | null;
  directory_visible: boolean;
  member_since: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanRow {
  id: string;
  name: string;
  description: string;
  price_monthly_cents: number;
  price_annual_cents: number | null;
  stripe_price_monthly: string | null;
  stripe_price_annual: string | null;
  is_addon: boolean;
  is_popular: boolean;
  requires_proof: boolean;
  sort_order: number;
  active: boolean;
}

export interface MembershipRow {
  id: string;
  profile_id: string;
  plan_id: string;
  status: MembershipStatus;
  period: BillingPeriod;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferencesRow {
  profile_id: string;
  events: boolean;
  bookings: boolean;
  weekly_digest: boolean;
  push_token: string | null;
  push_token_at: string | null;
  updated_at: string;
}

export interface ResourceAvailabilityRow {
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

export interface BookingRow {
  id: string;
  reference: string;
  profile_id: string;
  resource_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingWithResourceRow extends BookingRow {
  resources: Pick<ResourceAvailabilityRow, 'id' | 'name' | 'kind' | 'model'> | null;
}

export interface EventFeedRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: EventCategory;
  host_name: string;
  room_name: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  cover_path: string | null;
  members_only: boolean;
  going_count: number;
  waitlist_count: number;
  at_capacity: boolean;
  is_today: boolean;
}

export interface EventRsvpRow {
  id: string;
  event_id: string;
  profile_id: string;
  status: RsvpStatus;
  checkin_code: string;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberDirectoryRow {
  id: string;
  full_name: string;
  initials: string;
  avatar_path: string | null;
  bio: string | null;
  company: string | null;
  current_project: string | null;
  skills: string[];
  member_since: string | null;
  zone_name: string | null;
  is_here: boolean;
}

export interface OccupancyRow {
  zone_id: string;
  zone_name: string;
  capacity: number;
  head_count: number;
}

export interface SessionRow {
  id: string;
  profile_id: string;
  resource_id: string | null;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
}

export interface ProgramRow {
  id: string;
  name: string;
  meta: string;
  blurb: string;
  sort_order: number;
  active: boolean;
}

export interface ProgramTrackRow {
  id: string;
  program_id: string;
  name: string;
  description: string;
  audience: string;
  outcome: string;
  sort_order: number;
}

export interface PaymentRow {
  id: string;
  profile_id: string | null;
  kind: 'membership' | 'donation' | 'event' | 'addon';
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface StartupRow {
  id: string;
  name: string;
  mark: string;
  tagline: string;
  stage: string;
  founded_year: string;
  hiring: boolean;
  website: string | null;
  sort_order: number;
}

export interface TestimonialRow {
  id: string;
  name: string;
  role: string;
  quote: string;
  sort_order: number;
}

export interface PressMentionRow {
  id: string;
  outlet: string;
  year: string;
  headline: string;
  url: string | null;
  sort_order: number;
}

export interface BoardMemberRow {
  id: string;
  name: string;
  role: string;
  sort_order: number;
}

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

export interface TourRow {
  id: string;
  profile_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  scheduled_for: string;
  status: TourStatus;
  created_at: string;
  updated_at: string;
}

export interface EventRequestRow {
  id: string;
  reference: string;
  profile_id: string;
  title: string;
  category: EventCategory;
  expected_size: number;
  preferred_date: string;
  preferred_room: string;
  notes: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Production hardening — rows and views added by
// `supabase/migrations/20260805000000_production_hardening.sql`.
// ---------------------------------------------------------------------------

export type DocumentKind = 'student_id' | 'veteran_proof' | 'certification' | 'other';
export type DocumentStatus = 'submitted' | 'approved' | 'rejected';
export type PushDeliveryStatus = 'queued' | 'sent' | 'failed';

/**
 * `live_session_view` — a live session plus the name of the resource it holds.
 * The endpoint returns this rather than `SessionRow` so the countdown card can
 * name the booth instead of printing a literal.
 */
export interface LiveSessionRow {
  id: string;
  profile_id: string;
  resource_id: string | null;
  resource_name: string;
  resource_kind: ResourceKind | null;
  zone_name: string | null;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
}

export interface DoorCredentialRow {
  id: string;
  profile_id: string;
  key_id: string;
  active: boolean;
  issued_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoorAccessLogRow {
  id: number;
  profile_id: string;
  key_id: string;
  granted: boolean;
  reason: string | null;
  device_hint: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  profile_id: string;
  kind: DocumentKind;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: DocumentStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentBlockRow {
  id: string;
  slot: string;
  key: string;
  label: string;
  value: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteSettingRow {
  key: string;
  value: string;
  description: string | null;
  members_only: boolean;
  updated_at: string;
}

export interface PushDeliveryRow {
  id: string;
  profile_id: string;
  dedupe_key: string;
  channel: string;
  title: string;
  body: string;
  ticket_id: string | null;
  status: PushDeliveryStatus;
  error: string | null;
  created_at: string;
}

/** A profile joined to its push token — the fan-out query's row shape. */
export interface PushTargetRow {
  profile_id: string;
  push_token: string;
  events: boolean;
  bookings: boolean;
  weekly_digest: boolean;
}

export interface StripeWebhookEventRow {
  id: string;
  type: string;
  received_at: string;
  processed_at: string | null;
  attempts: number;
  last_error: string | null;
}

/** `staff_queue` — everything awaiting a steward, in one shape. */
export interface StaffQueueRow {
  kind: 'tour' | 'event_request' | 'program_application' | 'document';
  id: string;
  requester_name: string;
  requester_email: string | null;
  status: string;
  detail: string | null;
  summary: string;
  created_at: string;
}

export interface CertificationRow {
  id: string;
  profile_id: string;
  resource_id: string;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
}
