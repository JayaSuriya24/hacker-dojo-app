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

/* ---------------------------------------------------------------------------
 * Generated from the linked Supabase project — `npm run gen:types`.
 *
 * The hand-written `Database` this replaces mapped every table through a
 * `TableDef<Row>` helper whose Insert and Update shapes resolved to `never`,
 * so `tsc` rejected every `.insert()` and `.update()` in the repositories: 52
 * errors, and a type layer that checked nothing. Do not edit below by hand.
 * ------------------------------------------------------------------------- */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      board_members: {
        Row: {
          id: string;
          name: string;
          role: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          role: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          role?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          notes: string | null;
          profile_id: string;
          reference: string;
          resource_id: string;
          slot: unknown;
          starts_at: string;
          status: Database['public']['Enums']['booking_status'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: string;
          notes?: string | null;
          profile_id: string;
          reference?: string;
          resource_id: string;
          slot?: unknown;
          starts_at: string;
          status?: Database['public']['Enums']['booking_status'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          notes?: string | null;
          profile_id?: string;
          reference?: string;
          resource_id?: string;
          slot?: unknown;
          starts_at?: string;
          status?: Database['public']['Enums']['booking_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resource_availability';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
        ];
      };
      certifications: {
        Row: {
          expires_at: string | null;
          granted_at: string;
          granted_by: string | null;
          id: string;
          profile_id: string;
          resource_id: string;
        };
        Insert: {
          expires_at?: string | null;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          profile_id: string;
          resource_id: string;
        };
        Update: {
          expires_at?: string | null;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          profile_id?: string;
          resource_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'certifications_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'certifications_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'certifications_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'certifications_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'certifications_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resource_availability';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'certifications_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
        ];
      };
      content_blocks: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          key: string;
          label: string;
          slot: string;
          sort_order: number;
          updated_at: string;
          value: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          key: string;
          label: string;
          slot: string;
          sort_order?: number;
          updated_at?: string;
          value?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          key?: string;
          label?: string;
          slot?: string;
          sort_order?: number;
          updated_at?: string;
          value?: string | null;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          kind: Database['public']['Enums']['document_kind'];
          mime_type: string;
          profile_id: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          size_bytes: number;
          status: Database['public']['Enums']['document_status'];
          storage_path: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          kind: Database['public']['Enums']['document_kind'];
          mime_type: string;
          profile_id: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          size_bytes: number;
          status?: Database['public']['Enums']['document_status'];
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          kind?: Database['public']['Enums']['document_kind'];
          mime_type?: string;
          profile_id?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          size_bytes?: number;
          status?: Database['public']['Enums']['document_status'];
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      donations: {
        Row: {
          amount_cents: number;
          anonymous: boolean;
          created_at: string;
          id: string;
          payment_id: string;
          profile_id: string | null;
          receipt_email: string | null;
        };
        Insert: {
          amount_cents: number;
          anonymous?: boolean;
          created_at?: string;
          id?: string;
          payment_id: string;
          profile_id?: string | null;
          receipt_email?: string | null;
        };
        Update: {
          amount_cents?: number;
          anonymous?: boolean;
          created_at?: string;
          id?: string;
          payment_id?: string;
          profile_id?: string | null;
          receipt_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'donations_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'donations_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'donations_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      door_access_logs: {
        Row: {
          created_at: string;
          device_hint: string | null;
          granted: boolean;
          id: number;
          key_id: string;
          profile_id: string;
          reason: string | null;
        };
        Insert: {
          created_at?: string;
          device_hint?: string | null;
          granted: boolean;
          id?: never;
          key_id: string;
          profile_id: string;
          reason?: string | null;
        };
        Update: {
          created_at?: string;
          device_hint?: string | null;
          granted?: boolean;
          id?: never;
          key_id?: string;
          profile_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'door_access_logs_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'door_access_logs_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      door_credentials: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          issued_at: string;
          key_id: string;
          profile_id: string;
          revoked_at: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          issued_at?: string;
          key_id: string;
          profile_id: string;
          revoked_at?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          issued_at?: string;
          key_id?: string;
          profile_id?: string;
          revoked_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'door_credentials_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'door_credentials_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      event_requests: {
        Row: {
          category: Database['public']['Enums']['event_category'];
          created_at: string;
          created_event_id: string | null;
          created_series_id: string | null;
          duration_minutes: number;
          expected_size: number;
          id: string;
          notes: string | null;
          preferred_date: string;
          preferred_room: string;
          preferred_time: string;
          profile_id: string;
          reference: string;
          repeat_interval_weeks: number;
          repeat_mode: Database['public']['Enums']['event_repeat_mode'];
          repeat_until: string | null;
          repeat_weekdays: number[];
          status: Database['public']['Enums']['application_status'];
          title: string;
          updated_at: string;
        };
        Insert: {
          category: Database['public']['Enums']['event_category'];
          created_at?: string;
          created_event_id?: string | null;
          created_series_id?: string | null;
          duration_minutes?: number;
          expected_size?: number;
          id?: string;
          notes?: string | null;
          preferred_date: string;
          preferred_room: string;
          preferred_time?: string;
          profile_id: string;
          reference?: string;
          repeat_interval_weeks?: number;
          repeat_mode?: Database['public']['Enums']['event_repeat_mode'];
          repeat_until?: string | null;
          repeat_weekdays?: number[];
          status?: Database['public']['Enums']['application_status'];
          title: string;
          updated_at?: string;
        };
        Update: {
          category?: Database['public']['Enums']['event_category'];
          created_at?: string;
          created_event_id?: string | null;
          created_series_id?: string | null;
          duration_minutes?: number;
          expected_size?: number;
          id?: string;
          notes?: string | null;
          preferred_date?: string;
          preferred_room?: string;
          preferred_time?: string;
          profile_id?: string;
          reference?: string;
          repeat_interval_weeks?: number;
          repeat_mode?: Database['public']['Enums']['event_repeat_mode'];
          repeat_until?: string | null;
          repeat_weekdays?: number[];
          status?: Database['public']['Enums']['application_status'];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_requests_created_event_id_fkey';
            columns: ['created_event_id'];
            isOneToOne: false;
            referencedRelation: 'event_feed';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_requests_created_event_id_fkey';
            columns: ['created_event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_requests_created_series_id_fkey';
            columns: ['created_series_id'];
            isOneToOne: false;
            referencedRelation: 'event_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_requests_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_requests_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      event_rsvps: {
        Row: {
          checked_in_at: string | null;
          checkin_code: string;
          created_at: string;
          event_id: string;
          id: string;
          profile_id: string;
          status: Database['public']['Enums']['rsvp_status'];
          updated_at: string;
        };
        Insert: {
          checked_in_at?: string | null;
          checkin_code?: string;
          created_at?: string;
          event_id: string;
          id?: string;
          profile_id: string;
          status?: Database['public']['Enums']['rsvp_status'];
          updated_at?: string;
        };
        Update: {
          checked_in_at?: string | null;
          checkin_code?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          profile_id?: string;
          status?: Database['public']['Enums']['rsvp_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_rsvps_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'event_feed';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_rsvps_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_rsvps_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_rsvps_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      event_series: {
        Row: {
          capacity: number;
          category: Database['public']['Enums']['event_category'];
          cover_path: string | null;
          created_at: string;
          description: string | null;
          duration_minutes: number;
          host_name: string;
          host_profile_id: string | null;
          id: string;
          interval_weeks: number;
          max_occurrences: number | null;
          members_only: boolean;
          resource_id: string | null;
          room_name: string;
          slug_prefix: string;
          starts_on: string;
          starts_time: string;
          status: Database['public']['Enums']['series_status'];
          timezone: string;
          title: string;
          until_date: string | null;
          updated_at: string;
          weekdays: number[];
        };
        Insert: {
          capacity: number;
          category: Database['public']['Enums']['event_category'];
          cover_path?: string | null;
          created_at?: string;
          description?: string | null;
          duration_minutes: number;
          host_name: string;
          host_profile_id?: string | null;
          id?: string;
          interval_weeks?: number;
          max_occurrences?: number | null;
          members_only?: boolean;
          resource_id?: string | null;
          room_name: string;
          slug_prefix: string;
          starts_on: string;
          starts_time: string;
          status?: Database['public']['Enums']['series_status'];
          timezone?: string;
          title: string;
          until_date?: string | null;
          updated_at?: string;
          weekdays: number[];
        };
        Update: {
          capacity?: number;
          category?: Database['public']['Enums']['event_category'];
          cover_path?: string | null;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          host_name?: string;
          host_profile_id?: string | null;
          id?: string;
          interval_weeks?: number;
          max_occurrences?: number | null;
          members_only?: boolean;
          resource_id?: string | null;
          room_name?: string;
          slug_prefix?: string;
          starts_on?: string;
          starts_time?: string;
          status?: Database['public']['Enums']['series_status'];
          timezone?: string;
          title?: string;
          until_date?: string | null;
          updated_at?: string;
          weekdays?: number[];
        };
        Relationships: [
          {
            foreignKeyName: 'event_series_host_profile_id_fkey';
            columns: ['host_profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_series_host_profile_id_fkey';
            columns: ['host_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_series_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resource_availability';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_series_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
        ];
      };
      event_stats: {
        Row: {
          event_id: string;
          going_count: number;
          waitlist_count: number;
        };
        Insert: {
          event_id: string;
          going_count?: number;
          waitlist_count?: number;
        };
        Update: {
          event_id?: string;
          going_count?: number;
          waitlist_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'event_stats_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'event_feed';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_stats_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          capacity: number;
          category: Database['public']['Enums']['event_category'];
          cover_path: string | null;
          created_at: string;
          description: string | null;
          ends_at: string;
          host_name: string;
          host_profile_id: string | null;
          id: string;
          members_only: boolean;
          occurrence_date: string | null;
          resource_id: string | null;
          room_name: string;
          series_id: string | null;
          slug: string;
          starts_at: string;
          status: Database['public']['Enums']['event_status'];
          title: string;
          updated_at: string;
        };
        Insert: {
          capacity: number;
          category: Database['public']['Enums']['event_category'];
          cover_path?: string | null;
          created_at?: string;
          description?: string | null;
          ends_at: string;
          host_name: string;
          host_profile_id?: string | null;
          id?: string;
          members_only?: boolean;
          occurrence_date?: string | null;
          resource_id?: string | null;
          room_name: string;
          series_id?: string | null;
          slug: string;
          starts_at: string;
          status?: Database['public']['Enums']['event_status'];
          title: string;
          updated_at?: string;
        };
        Update: {
          capacity?: number;
          category?: Database['public']['Enums']['event_category'];
          cover_path?: string | null;
          created_at?: string;
          description?: string | null;
          ends_at?: string;
          host_name?: string;
          host_profile_id?: string | null;
          id?: string;
          members_only?: boolean;
          occurrence_date?: string | null;
          resource_id?: string | null;
          room_name?: string;
          series_id?: string | null;
          slug?: string;
          starts_at?: string;
          status?: Database['public']['Enums']['event_status'];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_host_profile_id_fkey';
            columns: ['host_profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_host_profile_id_fkey';
            columns: ['host_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resource_availability';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'event_series';
            referencedColumns: ['id'];
          },
        ];
      };
      faqs: {
        Row: {
          answer: string;
          id: string;
          question: string;
          sort_order: number;
        };
        Insert: {
          answer: string;
          id?: string;
          question: string;
          sort_order?: number;
        };
        Update: {
          answer?: string;
          id?: string;
          question?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      membership_addons: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          membership_id: string;
          plan_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          membership_id: string;
          plan_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          membership_id?: string;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'membership_addons_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membership_addons_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      memberships: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          id: string;
          period: Database['public']['Enums']['billing_period'];
          plan_id: string;
          profile_id: string;
          status: Database['public']['Enums']['membership_status'];
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          period?: Database['public']['Enums']['billing_period'];
          plan_id: string;
          profile_id: string;
          status?: Database['public']['Enums']['membership_status'];
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          period?: Database['public']['Enums']['billing_period'];
          plan_id?: string;
          profile_id?: string;
          status?: Database['public']['Enums']['membership_status'];
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          bookings: boolean;
          events: boolean;
          profile_id: string;
          push_token: string | null;
          push_token_at: string | null;
          updated_at: string;
          weekly_digest: boolean;
        };
        Insert: {
          bookings?: boolean;
          events?: boolean;
          profile_id: string;
          push_token?: string | null;
          push_token_at?: string | null;
          updated_at?: string;
          weekly_digest?: boolean;
        };
        Update: {
          bookings?: boolean;
          events?: boolean;
          profile_id?: string;
          push_token?: string | null;
          push_token_at?: string | null;
          updated_at?: string;
          weekly_digest?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_preferences_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      occupancy_samples: {
        Row: {
          head_count: number;
          id: number;
          recorded_at: string;
          zone_id: string | null;
        };
        Insert: {
          head_count: number;
          id?: never;
          recorded_at?: string;
          zone_id?: string | null;
        };
        Update: {
          head_count?: number;
          id?: never;
          recorded_at?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'occupancy_samples_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'current_occupancy';
            referencedColumns: ['zone_id'];
          },
          {
            foreignKeyName: 'occupancy_samples_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zones';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_cents: number;
          created_at: string;
          currency: string;
          id: string;
          idempotency_key: string | null;
          kind: string;
          metadata: Json;
          profile_id: string | null;
          status: Database['public']['Enums']['payment_status'];
          stripe_customer_id: string | null;
          stripe_payment_intent_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          currency?: string;
          id?: string;
          idempotency_key?: string | null;
          kind: string;
          metadata?: Json;
          profile_id?: string | null;
          status?: Database['public']['Enums']['payment_status'];
          stripe_customer_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          idempotency_key?: string | null;
          kind?: string;
          metadata?: Json;
          profile_id?: string | null;
          status?: Database['public']['Enums']['payment_status'];
          stripe_customer_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      plans: {
        Row: {
          active: boolean;
          benefits: string[];
          created_at: string;
          description: string;
          id: string;
          is_addon: boolean;
          is_popular: boolean;
          name: string;
          price_annual_cents: number | null;
          price_monthly_cents: number;
          requires_proof: boolean;
          sort_order: number;
          stripe_price_annual: string | null;
          stripe_price_monthly: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          benefits?: string[];
          created_at?: string;
          description: string;
          id: string;
          is_addon?: boolean;
          is_popular?: boolean;
          name: string;
          price_annual_cents?: number | null;
          price_monthly_cents: number;
          requires_proof?: boolean;
          sort_order?: number;
          stripe_price_annual?: string | null;
          stripe_price_monthly?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          benefits?: string[];
          created_at?: string;
          description?: string;
          id?: string;
          is_addon?: boolean;
          is_popular?: boolean;
          name?: string;
          price_annual_cents?: number | null;
          price_monthly_cents?: number;
          requires_proof?: boolean;
          sort_order?: number;
          stripe_price_annual?: string | null;
          stripe_price_monthly?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      press_mentions: {
        Row: {
          headline: string;
          id: string;
          outlet: string;
          sort_order: number;
          url: string | null;
          year: string;
        };
        Insert: {
          headline: string;
          id?: string;
          outlet: string;
          sort_order?: number;
          url?: string | null;
          year: string;
        };
        Update: {
          headline?: string;
          id?: string;
          outlet?: string;
          sort_order?: number;
          url?: string | null;
          year?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          bio: string | null;
          company: string | null;
          created_at: string;
          current_project: string | null;
          directory_visible: boolean;
          email: string;
          full_name: string;
          id: string;
          initials: string | null;
          member_since: string | null;
          phone: string | null;
          role: Database['public']['Enums']['member_role'];
          skills: string[];
          skills_prompted_at: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          bio?: string | null;
          company?: string | null;
          created_at?: string;
          current_project?: string | null;
          directory_visible?: boolean;
          email: string;
          full_name: string;
          id: string;
          initials?: string | null;
          member_since?: string | null;
          phone?: string | null;
          role?: Database['public']['Enums']['member_role'];
          skills?: string[];
          skills_prompted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          bio?: string | null;
          company?: string | null;
          created_at?: string;
          current_project?: string | null;
          directory_visible?: boolean;
          email?: string;
          full_name?: string;
          id?: string;
          initials?: string | null;
          member_since?: string | null;
          phone?: string | null;
          role?: Database['public']['Enums']['member_role'];
          skills?: string[];
          skills_prompted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      program_applications: {
        Row: {
          answers: Json;
          created_at: string;
          id: string;
          profile_id: string;
          status: Database['public']['Enums']['application_status'];
          track_id: string;
          updated_at: string;
        };
        Insert: {
          answers?: Json;
          created_at?: string;
          id?: string;
          profile_id: string;
          status?: Database['public']['Enums']['application_status'];
          track_id: string;
          updated_at?: string;
        };
        Update: {
          answers?: Json;
          created_at?: string;
          id?: string;
          profile_id?: string;
          status?: Database['public']['Enums']['application_status'];
          track_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'program_applications_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_applications_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_applications_track_id_fkey';
            columns: ['track_id'];
            isOneToOne: false;
            referencedRelation: 'program_tracks';
            referencedColumns: ['id'];
          },
        ];
      };
      program_tracks: {
        Row: {
          audience: string;
          description: string;
          id: string;
          name: string;
          outcome: string;
          program_id: string;
          sort_order: number;
        };
        Insert: {
          audience: string;
          description: string;
          id?: string;
          name: string;
          outcome: string;
          program_id: string;
          sort_order?: number;
        };
        Update: {
          audience?: string;
          description?: string;
          id?: string;
          name?: string;
          outcome?: string;
          program_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'program_tracks_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      programs: {
        Row: {
          active: boolean;
          blurb: string;
          id: string;
          meta: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          blurb: string;
          id: string;
          meta: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          blurb?: string;
          id?: string;
          meta?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      push_deliveries: {
        Row: {
          body: string;
          channel: string;
          created_at: string;
          dedupe_key: string;
          error: string | null;
          id: string;
          profile_id: string;
          status: string;
          ticket_id: string | null;
          title: string;
        };
        Insert: {
          body: string;
          channel: string;
          created_at?: string;
          dedupe_key: string;
          error?: string | null;
          id?: string;
          profile_id: string;
          status?: string;
          ticket_id?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          channel?: string;
          created_at?: string;
          dedupe_key?: string;
          error?: string | null;
          id?: string;
          profile_id?: string;
          status?: string;
          ticket_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_deliveries_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_deliveries_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      resources: {
        Row: {
          active: boolean;
          amenities: string | null;
          closes_at: string;
          created_at: string;
          id: string;
          image_path: string | null;
          kind: Database['public']['Enums']['resource_kind'];
          max_duration_minutes: number;
          min_duration_minutes: number;
          model: string | null;
          name: string;
          opens_at: string;
          requires_cert: boolean;
          seats: number | null;
          slug: string;
          status: Database['public']['Enums']['resource_status'];
          updated_at: string;
          zone_id: string | null;
        };
        Insert: {
          active?: boolean;
          amenities?: string | null;
          closes_at?: string;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          kind: Database['public']['Enums']['resource_kind'];
          max_duration_minutes?: number;
          min_duration_minutes?: number;
          model?: string | null;
          name: string;
          opens_at?: string;
          requires_cert?: boolean;
          seats?: number | null;
          slug: string;
          status?: Database['public']['Enums']['resource_status'];
          updated_at?: string;
          zone_id?: string | null;
        };
        Update: {
          active?: boolean;
          amenities?: string | null;
          closes_at?: string;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          kind?: Database['public']['Enums']['resource_kind'];
          max_duration_minutes?: number;
          min_duration_minutes?: number;
          model?: string | null;
          name?: string;
          opens_at?: string;
          requires_cert?: boolean;
          seats?: number | null;
          slug?: string;
          status?: Database['public']['Enums']['resource_status'];
          updated_at?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'resources_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'current_occupancy';
            referencedColumns: ['zone_id'];
          },
          {
            foreignKeyName: 'resources_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zones';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: {
          ended_at: string | null;
          expires_at: string;
          id: string;
          profile_id: string;
          resource_id: string | null;
          started_at: string;
        };
        Insert: {
          ended_at?: string | null;
          expires_at: string;
          id?: string;
          profile_id: string;
          resource_id?: string | null;
          started_at?: string;
        };
        Update: {
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          profile_id?: string;
          resource_id?: string | null;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resource_availability';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
        ];
      };
      site_settings: {
        Row: {
          description: string | null;
          key: string;
          members_only: boolean;
          updated_at: string;
          value: string;
        };
        Insert: {
          description?: string | null;
          key: string;
          members_only?: boolean;
          updated_at?: string;
          value: string;
        };
        Update: {
          description?: string | null;
          key?: string;
          members_only?: boolean;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      startups: {
        Row: {
          founded_year: string;
          hiring: boolean;
          id: string;
          mark: string;
          name: string;
          slug: string;
          sort_order: number;
          stage: string;
          tagline: string;
          website: string | null;
        };
        Insert: {
          founded_year: string;
          hiring?: boolean;
          id?: string;
          mark: string;
          name: string;
          slug: string;
          sort_order?: number;
          stage: string;
          tagline: string;
          website?: string | null;
        };
        Update: {
          founded_year?: string;
          hiring?: boolean;
          id?: string;
          mark?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          stage?: string;
          tagline?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: {
          attempts: number;
          id: string;
          last_error: string | null;
          processed_at: string | null;
          received_at: string;
          type: string;
        };
        Insert: {
          attempts?: number;
          id: string;
          last_error?: string | null;
          processed_at?: string | null;
          received_at?: string;
          type: string;
        };
        Update: {
          attempts?: number;
          id?: string;
          last_error?: string | null;
          processed_at?: string | null;
          received_at?: string;
          type?: string;
        };
        Relationships: [];
      };
      testimonials: {
        Row: {
          id: string;
          name: string;
          quote: string;
          role: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          quote: string;
          role: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          quote?: string;
          role?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      tours: {
        Row: {
          created_at: string;
          guest_email: string | null;
          guest_name: string | null;
          id: string;
          profile_id: string | null;
          scheduled_for: string;
          status: Database['public']['Enums']['tour_status'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          guest_email?: string | null;
          guest_name?: string | null;
          id?: string;
          profile_id?: string | null;
          scheduled_for: string;
          status?: Database['public']['Enums']['tour_status'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          guest_email?: string | null;
          guest_name?: string | null;
          id?: string;
          profile_id?: string | null;
          scheduled_for?: string;
          status?: Database['public']['Enums']['tour_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tours_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tours_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      wifi_credentials: {
        Row: {
          issued_at: string;
          pin: string;
          profile_id: string;
          rotated_at: string | null;
        };
        Insert: {
          issued_at?: string;
          pin: string;
          profile_id: string;
          rotated_at?: string | null;
        };
        Update: {
          issued_at?: string;
          pin?: string;
          profile_id?: string;
          rotated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'wifi_credentials_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wifi_credentials_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      zones: {
        Row: {
          capacity: number;
          id: string;
          name: string;
          sort_order: number;
          weight: number;
        };
        Insert: {
          capacity: number;
          id: string;
          name: string;
          sort_order?: number;
          weight?: number;
        };
        Update: {
          capacity?: number;
          id?: string;
          name?: string;
          sort_order?: number;
          weight?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      current_occupancy: {
        Row: {
          capacity: number | null;
          head_count: number | null;
          zone_id: string | null;
          zone_name: string | null;
        };
        Relationships: [];
      };
      event_feed: {
        Row: {
          at_capacity: boolean | null;
          capacity: number | null;
          category: Database['public']['Enums']['event_category'] | null;
          cover_path: string | null;
          description: string | null;
          ends_at: string | null;
          going_count: number | null;
          host_name: string | null;
          id: string | null;
          is_today: boolean | null;
          members_only: boolean | null;
          occurrence_date: string | null;
          room_name: string | null;
          series_id: string | null;
          slug: string | null;
          starts_at: string | null;
          title: string | null;
          waitlist_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'events_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'event_series';
            referencedColumns: ['id'];
          },
        ];
      };
      live_session_view: {
        Row: {
          ended_at: string | null;
          expires_at: string | null;
          id: string | null;
          profile_id: string | null;
          resource_id: string | null;
          resource_kind: Database['public']['Enums']['resource_kind'] | null;
          resource_name: string | null;
          started_at: string | null;
          zone_name: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'member_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resource_availability';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
        ];
      };
      member_directory: {
        Row: {
          avatar_path: string | null;
          bio: string | null;
          company: string | null;
          current_project: string | null;
          full_name: string | null;
          id: string | null;
          initials: string | null;
          is_here: boolean | null;
          member_since: string | null;
          skills: string[] | null;
          zone_name: string | null;
        };
        Relationships: [];
      };
      resource_availability: {
        Row: {
          amenities: string | null;
          closes_at: string | null;
          free_from: string | null;
          id: string | null;
          image_path: string | null;
          kind: Database['public']['Enums']['resource_kind'] | null;
          max_duration_minutes: number | null;
          min_duration_minutes: number | null;
          model: string | null;
          name: string | null;
          opens_at: string | null;
          requires_cert: boolean | null;
          seats: number | null;
          slug: string | null;
          status: Database['public']['Enums']['resource_status'] | null;
          zone_name: string | null;
        };
        Relationships: [];
      };
      staff_queue: {
        Row: {
          created_at: string | null;
          detail: string | null;
          id: string | null;
          kind: string | null;
          requester_email: string | null;
          requester_name: string | null;
          status: string | null;
          summary: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_role_of: {
        Args: { uid: string };
        Returns: Database['public']['Enums']['member_role'];
      };
      dojo_timezone: { Args: never; Returns: string };
      generate_all_event_occurrences: {
        Args: { p_horizon_days?: number };
        Returns: number;
      };
      generate_event_occurrences: {
        Args: { p_horizon_days?: number; p_series_id: string };
        Returns: number;
      };
      generate_key_id: { Args: never; Returns: string };
      is_active_member: { Args: never; Returns: boolean };
      is_admin: { Args: never; Returns: boolean };
      is_staff: { Args: never; Returns: boolean };
      issue_door_credential: {
        Args: { p_profile_id: string };
        Returns: {
          active: boolean;
          created_at: string;
          id: string;
          issued_at: string;
          key_id: string;
          profile_id: string;
          revoked_at: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'door_credentials';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      prune_occupancy_samples: { Args: never; Returns: number };
      sample_occupancy: { Args: never; Returns: number };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
    };
    Enums: {
      application_status: 'submitted' | 'in_review' | 'accepted' | 'rejected' | 'withdrawn';
      billing_period: 'month' | 'year';
      booking_status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
      document_kind: 'student_id' | 'veteran_proof' | 'certification' | 'other';
      document_status: 'submitted' | 'approved' | 'rejected';
      event_category:
        | 'Hackathons'
        | 'Hardware'
        | 'AI/ML'
        | 'Community'
        | 'Workshops'
        | 'Talks'
        | 'Meetups'
        | 'Social'
        | 'Startups'
        | 'Robotics'
        | 'Security'
        | 'Open House';
      event_repeat_mode: 'once' | 'weekly';
      event_status: 'draft' | 'pending_review' | 'published' | 'cancelled';
      member_role: 'guest' | 'member' | 'steward' | 'admin';
      membership_status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
      payment_status: 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'refunded';
      resource_kind: 'hardware' | 'room';
      resource_status: 'available' | 'in_use' | 'maintenance';
      rsvp_status: 'going' | 'waitlisted' | 'cancelled';
      series_status: 'active' | 'paused' | 'ended';
      tour_status: 'requested' | 'confirmed' | 'attended' | 'cancelled';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          name: string;
          owner: string | null;
          owner_id: string | null;
          public: boolean | null;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string | null;
          versioning_status: string;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          name: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string | null;
          versioning_status?: string;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          name?: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string | null;
          versioning_status?: string;
        };
        Relationships: [];
      };
      buckets_analytics: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          format: string;
          id: string;
          name: string;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name?: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Relationships: [];
      };
      buckets_vectors: {
        Row: {
          created_at: string;
          id: string;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Relationships: [];
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          archived_at: string | null;
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          is_delete_marker: boolean;
          is_versioned: boolean;
          last_accessed_at: string | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          owner_id: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          user_metadata: Json | null;
          version: string | null;
        };
        Insert: {
          archived_at?: string | null;
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_delete_marker?: boolean;
          is_versioned?: boolean;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Update: {
          archived_at?: string | null;
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_delete_marker?: boolean;
          is_versioned?: boolean;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'objects_bucketId_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          in_progress_size: number;
          key: string;
          metadata: Json | null;
          owner_id: string | null;
          upload_signature: string;
          user_metadata: Json | null;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id: string;
          in_progress_size?: number;
          key: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature: string;
          user_metadata?: Json | null;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          in_progress_size?: number;
          key?: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature?: string;
          user_metadata?: Json | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string;
          created_at: string;
          etag: string;
          id: string;
          key: string;
          owner_id: string | null;
          part_number: number;
          size: number;
          upload_id: string;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          etag: string;
          id?: string;
          key: string;
          owner_id?: string | null;
          part_number: number;
          size?: number;
          upload_id: string;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          etag?: string;
          id?: string;
          key?: string;
          owner_id?: string | null;
          part_number?: number;
          size?: number;
          upload_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_parts_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 's3_multipart_uploads_parts_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 's3_multipart_uploads';
            referencedColumns: ['id'];
          },
        ];
      };
      vector_indexes: {
        Row: {
          bucket_id: string;
          created_at: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id: string;
          metadata_configuration: Json | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id?: string;
          metadata_configuration?: Json | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          data_type?: string;
          dimension?: number;
          distance_metric?: string;
          id?: string;
          metadata_configuration?: Json | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vector_indexes_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets_vectors';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] };
        Returns: boolean;
      };
      allow_only_operation: {
        Args: { expected_operation: string };
        Returns: boolean;
      };
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string };
        Returns: undefined;
      };
      extension: { Args: { name: string }; Returns: string };
      filename: { Args: { name: string }; Returns: string };
      foldername: { Args: { name: string }; Returns: string[] };
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string };
        Returns: string;
      };
      get_size_by_bucket: {
        Args: never;
        Returns: {
          bucket_id: string;
          size: number;
        }[];
      };
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_key_token?: string;
          next_upload_token?: string;
          prefix_param: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
        }[];
      };
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_token?: string;
          prefix_param: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      operation: { Args: never; Returns: string };
      search: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_by_timestamp: {
        Args: {
          p_bucket_id: string;
          p_level: number;
          p_limit: number;
          p_prefix: string;
          p_sort_column: string;
          p_sort_column_after: string;
          p_sort_order: string;
          p_start_after: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_v2: {
        Args: {
          bucket_name: string;
          levels?: number;
          limits?: number;
          prefix: string;
          sort_column?: string;
          sort_column_after?: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
    };
    Enums: {
      buckettype: 'STANDARD' | 'ANALYTICS' | 'VECTOR';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      application_status: ['submitted', 'in_review', 'accepted', 'rejected', 'withdrawn'],
      billing_period: ['month', 'year'],
      booking_status: ['confirmed', 'cancelled', 'completed', 'no_show'],
      document_kind: ['student_id', 'veteran_proof', 'certification', 'other'],
      document_status: ['submitted', 'approved', 'rejected'],
      event_category: [
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
      ],
      event_repeat_mode: ['once', 'weekly'],
      event_status: ['draft', 'pending_review', 'published', 'cancelled'],
      member_role: ['guest', 'member', 'steward', 'admin'],
      membership_status: ['none', 'trialing', 'active', 'past_due', 'canceled'],
      payment_status: ['requires_payment', 'processing', 'succeeded', 'failed', 'refunded'],
      resource_kind: ['hardware', 'room'],
      resource_status: ['available', 'in_use', 'maintenance'],
      rsvp_status: ['going', 'waitlisted', 'cancelled'],
      series_status: ['active', 'paused', 'ended'],
      tour_status: ['requested', 'confirmed', 'attended', 'cancelled'],
    },
  },
  storage: {
    Enums: {
      buckettype: ['STANDARD', 'ANALYTICS', 'VECTOR'],
    },
  },
} as const;
