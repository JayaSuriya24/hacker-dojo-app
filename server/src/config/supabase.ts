import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import type { Database } from '../types/database.js';

/**
 * Two clients, two very different trust levels.
 *
 * `adminClient` carries the service-role key and bypasses RLS entirely. It is
 * for work no user can be trusted to do themselves — activating a membership
 * off a Stripe webhook, writing a door-access audit row. The ESLint config
 * restricts importing this module to `src/repositories/**`.
 *
 * `userClient(token)` runs as the caller, so every query is still filtered by
 * the policies in the migrations. Prefer it. Defence in depth means a bug in a
 * service function produces an empty result set, not a data leak.
 */

const commonOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export const adminClient: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    ...commonOptions,
    global: { headers: { 'X-Client-Info': 'hackerdojo-api/admin' } },
  },
);

/**
 * A client scoped to one caller's JWT. Cheap to construct — it is a wrapper
 * around fetch, not a connection pool — so building one per request is correct
 * and avoids any chance of one request inheriting another's identity.
 */
export function userClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    ...commonOptions,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Client-Info': 'hackerdojo-api/user',
      },
    },
  });
}
