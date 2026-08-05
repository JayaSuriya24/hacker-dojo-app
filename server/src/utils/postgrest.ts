import type { PostgrestError } from '@supabase/supabase-js';
import { AppError } from './errors.js';

/**
 * Translate a PostgREST/Postgres failure into the API's error vocabulary.
 *
 * The database is the authority on the rules that matter (double-booking,
 * capacity, certification), so those rules surface as SQLSTATE codes rather
 * than as pre-flight checks in a service. This is where a raw SQLSTATE becomes
 * a sentence a member can act on.
 */
export function translatePostgrestError(error: PostgrestError, fallback: string): AppError {
  switch (error.code) {
    // exclusion_violation — the bookings_no_overlap constraint fired.
    case '23P01':
      return AppError.slotTaken();

    // unique_violation
    case '23505':
      return AppError.conflict('conflict', 'That already exists.');

    // foreign_key_violation
    case '23503':
      return AppError.badRequest("That refers to something that doesn't exist.");

    // check_violation — raised by validate_booking() for hours/duration rules.
    case '23514':
      return AppError.badRequest(error.message.replace(/^.*?:\s*/, '') || fallback);

    // insufficient_privilege — RLS refused, or validate_booking() raised 42501.
    case '42501':
      return error.message.toLowerCase().includes('certification')
        ? AppError.certificationRequired()
        : AppError.forbidden();

    // PostgREST: zero rows where exactly one was required.
    case 'PGRST116':
      return AppError.notFound();

    default:
      return AppError.internal(fallback, error);
  }
}

/**
 * Unwrap a Supabase `{ data, error }` result, or throw the translated error.
 * Repositories use this so no call site has to remember the null check.
 */
export function unwrap<T>(
  result: { data: T | null; error: PostgrestError | null },
  fallback: string,
): T {
  if (result.error) throw translatePostgrestError(result.error, fallback);
  if (result.data === null) throw AppError.notFound();
  return result.data;
}

/** Same, but an empty result is legitimate and comes back as an empty array. */
export function unwrapList<T>(
  result: { data: T[] | null; error: PostgrestError | null },
  fallback: string,
): T[] {
  if (result.error) throw translatePostgrestError(result.error, fallback);
  return result.data ?? [];
}

/** Same, but a missing row is legitimate and comes back as null. */
export function unwrapMaybe<T>(
  result: { data: T | null; error: PostgrestError | null },
  fallback: string,
): T | null {
  if (result.error && result.error.code !== 'PGRST116') {
    throw translatePostgrestError(result.error, fallback);
  }
  return result.data;
}
