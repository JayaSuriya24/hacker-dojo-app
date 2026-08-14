import { adminClient } from '../config/supabase.js';

/**
 * Occurrence generation.
 *
 * Service role by design, and for the same reason as occupancy sampling: this
 * is a background job with no caller, and `events` has no client insert policy
 * precisely so that nothing but the building's own schedule puts a date on the
 * calendar.
 *
 * The expansion itself lives in Postgres rather than here. It has to turn a
 * local wall-clock time into an instant once per date, and doing that in the
 * database means the DST transition is handled by the same engine that stores
 * the column — rather than by this process's idea of what `America/Los_Angeles`
 * meant on the day it computed the row.
 */
export const eventSeriesRepository = {
  /** Top up one series. Returns how many dates were newly created. */
  async generate(seriesId: string, horizonDays?: number): Promise<number> {
    const { data, error } = await adminClient.rpc('generate_event_occurrences', {
      p_series_id: seriesId,
      ...(horizonDays === undefined ? {} : { p_horizon_days: horizonDays }),
    });

    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : 0;
  },

  /** Top up every active series. What the hourly job calls. */
  async generateAll(horizonDays?: number): Promise<number> {
    const { data, error } = await adminClient.rpc('generate_all_event_occurrences', {
      ...(horizonDays === undefined ? {} : { p_horizon_days: horizonDays }),
    });

    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : 0;
  },
};
