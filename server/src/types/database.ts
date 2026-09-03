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
/**
 * The `event_category` enum, in its database order.
 *
 * A value list rather than a bare union so the validator and anything else that
 * needs to enumerate them derives from one declaration. Two hand-written copies
 * of the same set is how a category becomes acceptable to the API and invisible
 * in the app.
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
  /** Null until the onboarding prompt has run once. */
  skills_prompted_at: string | null;
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
  /** The bullet list on the plan card, in display order. */
  benefits: string[];
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
  /** Set when this event is one date of a recurring series. */
  series_id: string | null;
  occurrence_date: string | null;
}

export type SeriesStatus = 'active' | 'paused' | 'ended';

export interface EventSeriesRow {
  id: string;
  slug_prefix: string;
  title: string;
  interval_weeks: number;
  /** Postgres `dow`: 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  starts_time: string;
  duration_minutes: number;
  timezone: string;
  starts_on: string;
  until_date: string | null;
  max_occurrences: number | null;
  status: SeriesStatus;
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
  /** Added by the startup-management migration; the addressable form of `name`. */
  slug: string;
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
  /** The clock the host asked for; an event cannot be built from a date alone. */
  preferred_time: string;
  duration_minutes: number;
  repeat_mode: EventRepeatMode;
  /** Postgres `dow`: 0 = Sunday … 6 = Saturday. Empty for a one-off. */
  repeat_weekdays: number[];
  repeat_interval_weeks: number;
  repeat_until: string | null;
  /** What approval produced, so approving twice cannot duplicate the event. */
  created_event_id: string | null;
  created_series_id: string | null;
  created_at: string;
  updated_at: string;
}

export type EventRepeatMode = 'once' | 'weekly';

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

export interface WifiCredentialRow {
  profile_id: string;
  /** Five digits. The username that pairs with it is the profile's email. */
  pin: string;
  issued_at: string;
  rotated_at: string | null;
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

// ---------------------------------------------------------------------------
// Rows that had no type until the `Database` map below needed one.
//
// The map has to name every relation PostgREST can reach, otherwise a valid
// `.from('zones')` becomes a type error. These eight are transcribed from the
// migrations exactly like the rest of this file.
// ---------------------------------------------------------------------------

export interface EventRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: EventCategory;
  status: EventStatus;
  host_profile_id: string | null;
  host_name: string;
  resource_id: string | null;
  room_name: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  cover_path: string | null;
  members_only: boolean;
  created_at: string;
  updated_at: string;
  series_id: string | null;
  /** `date`, not `timestamptz` — the calendar day an occurrence belongs to. */
  occurrence_date: string | null;
}

export interface DonationRow {
  id: string;
  payment_id: string;
  profile_id: string | null;
  amount_cents: number;
  anonymous: boolean;
  receipt_email: string | null;
  created_at: string;
}

export interface ResourceRow {
  id: string;
  slug: string;
  kind: ResourceKind;
  name: string;
  model: string | null;
  zone_id: string | null;
  seats: number | null;
  amenities: string | null;
  status: ResourceStatus;
  requires_cert: boolean;
  min_duration_minutes: number;
  max_duration_minutes: number;
  /** `time`, serialised as `HH:MM:SS`. */
  opens_at: string;
  closes_at: string;
  image_path: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProgramApplicationRow {
  id: string;
  profile_id: string;
  track_id: string;
  status: ApplicationStatus;
  answers: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EventStatsRow {
  event_id: string;
  going_count: number;
  waitlist_count: number;
}

export interface MembershipAddonRow {
  id: string;
  membership_id: string;
  plan_id: string;
  active: boolean;
  created_at: string;
}

export interface OccupancySampleRow {
  /** `bigint generated always as identity` — PostgREST sends it as a number. */
  id: number;
  zone_id: string | null;
  head_count: number;
  recorded_at: string;
}

export interface ZoneRow {
  id: string;
  name: string;
  capacity: number;
  /** `numeric(4,3)`. */
  weight: number;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// The shape `@supabase/supabase-js` wants as its type parameter.
//
// Hand-written, like everything above it, and for the same reason: the
// generator needs a live database to run and would flatten the commentary that
// makes this file readable. What it buys is the thing the generic is actually
// for — `.from('bookins')` and `.eq('profil_id', …)` stop compiling.
//
// `Insert`/`Update` are `Partial<Row>` rather than a faithful required/optional
// split. The generator derives that from column defaults; doing it by hand for
// 35 tables would be a second copy of the schema to keep in step, and the
// payoff here is catching wrong NAMES, not wrong optionality.
// ---------------------------------------------------------------------------

interface TableDef<Row> {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
}

interface ViewDef<Row> {
  Row: Row;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      board_members: TableDef<BoardMemberRow>;
      bookings: TableDef<BookingRow>;
      certifications: TableDef<CertificationRow>;
      content_blocks: TableDef<ContentBlockRow>;
      documents: TableDef<DocumentRow>;
      donations: TableDef<DonationRow>;
      door_access_logs: TableDef<DoorAccessLogRow>;
      door_credentials: TableDef<DoorCredentialRow>;
      event_requests: TableDef<EventRequestRow>;
      event_rsvps: TableDef<EventRsvpRow>;
      event_series: TableDef<EventSeriesRow>;
      event_stats: TableDef<EventStatsRow>;
      events: TableDef<EventRow>;
      faqs: TableDef<FaqRow>;
      membership_addons: TableDef<MembershipAddonRow>;
      memberships: TableDef<MembershipRow>;
      notification_preferences: TableDef<NotificationPreferencesRow>;
      occupancy_samples: TableDef<OccupancySampleRow>;
      payments: TableDef<PaymentRow>;
      plans: TableDef<PlanRow>;
      press_mentions: TableDef<PressMentionRow>;
      profiles: TableDef<ProfileRow>;
      program_applications: TableDef<ProgramApplicationRow>;
      program_tracks: TableDef<ProgramTrackRow>;
      programs: TableDef<ProgramRow>;
      push_deliveries: TableDef<PushDeliveryRow>;
      resources: TableDef<ResourceRow>;
      sessions: TableDef<SessionRow>;
      site_settings: TableDef<SiteSettingRow>;
      startups: TableDef<StartupRow>;
      stripe_webhook_events: TableDef<StripeWebhookEventRow>;
      testimonials: TableDef<TestimonialRow>;
      tours: TableDef<TourRow>;
      wifi_credentials: TableDef<WifiCredentialRow>;
      zones: TableDef<ZoneRow>;
    };
    Views: {
      current_occupancy: ViewDef<OccupancyRow>;
      event_feed: ViewDef<EventFeedRow>;
      live_session_view: ViewDef<LiveSessionRow>;
      member_directory: ViewDef<MemberDirectoryRow>;
      resource_availability: ViewDef<ResourceAvailabilityRow>;
      staff_queue: ViewDef<StaffQueueRow>;
    };
    Functions: {
      generate_event_occurrences: {
        Args: { p_series_id: string; p_limit: number };
        Returns: number;
      };
      generate_all_event_occurrences: {
        Args: { p_limit: number };
        Returns: number;
      };
      sample_occupancy: { Args: Record<string, never>; Returns: number };
      prune_occupancy_samples: { Args: Record<string, never>; Returns: number };
    };
    Enums: {
      application_status: ApplicationStatus;
      billing_period: BillingPeriod;
      booking_status: BookingStatus;
      document_kind: DocumentKind;
      document_status: DocumentStatus;
      event_category: EventCategory;
      event_repeat_mode: EventRepeatMode;
      event_status: EventStatus;
      member_role: MemberRole;
      membership_status: MembershipStatus;
      payment_status: PaymentStatus;
      push_delivery_status: PushDeliveryStatus;
      resource_kind: ResourceKind;
      resource_status: ResourceStatus;
      rsvp_status: RsvpStatus;
      series_status: SeriesStatus;
      tour_status: TourStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
