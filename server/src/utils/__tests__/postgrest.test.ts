import { describe, expect, it } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import { translatePostgrestError } from '../postgrest.js';

function pgError(code: string, message = 'boom'): PostgrestError {
  return {
    code,
    message,
    details: '',
    hint: '',
    name: 'PostgrestError',
    toJSON: () => ({ code, message, details: '', hint: '' }),
  } as PostgrestError;
}

describe('translatePostgrestError', () => {
  it('turns an exclusion violation into a slot-taken conflict', () => {
    const error = translatePostgrestError(pgError('23P01'), 'fallback');

    expect(error.status).toBe(409);
    expect(error.code).toBe('slot_taken');
    expect(error.message).toMatch(/another time/i);
  });

  /**
   * A type the API accepts and the column does not is a disagreement about the
   * schema, not a server fault. It surfaced when the event-category enum lagged
   * behind the validator and every filtered request answered 500.
   */
  it('reports an unknown enum label as a bad request, not an internal error', () => {
    const error = translatePostgrestError(
      pgError('22P02', 'invalid input value for enum event_category: "Workshops"'),
      'Could not load events.',
    );

    expect(error.status).toBe(400);
    expect(error.status).not.toBe(500);
  });

  it('distinguishes a certification refusal from a generic RLS refusal', () => {
    const cert = translatePostgrestError(
      pgError('42501', 'Certification required for this resource'),
      'fallback',
    );
    const rls = translatePostgrestError(
      pgError('42501', 'new row violates row-level security'),
      'fallback',
    );

    expect(cert.code).toBe('certification_required');
    expect(rls.code).toBe('forbidden');
  });

  it('surfaces a check-violation message without the SQL prefix', () => {
    const error = translatePostgrestError(
      pgError('23514', 'ERROR: Booking falls outside opening hours (09:00 – 21:00)'),
      'fallback',
    );

    expect(error.status).toBe(400);
    expect(error.message).toBe('Booking falls outside opening hours (09:00 – 21:00)');
  });

  it('treats an unknown code as an internal error, not a client error', () => {
    const error = translatePostgrestError(pgError('XX000'), 'Could not load that.');

    expect(error.status).toBe(500);
    expect(error.retryable).toBe(true);
  });
});
