import { router } from 'expo-router';
import { Segmented } from '~/components/ui';

/**
 * The Sign in / Create account switch at the top of the auth sheet.
 *
 * Both modes are separate routes rather than one screen with a toggle — they
 * have different fields, different schemas and different submit handlers — so
 * this is navigation wearing a segmented control, which is what the design
 * asks for and what a member reads it as.
 *
 * `replace` rather than `push`: switching back and forth is a change of mind,
 * not a journey, and pushing would stack a dozen auth screens behind the one on
 * screen for anyone who wavers. It also keeps Android's back gesture pointed at
 * wherever they actually came from.
 */

export type AuthMode = 'signIn' | 'signUp';

const OPTIONS = [
  { value: 'signIn', label: 'Sign in' },
  { value: 'signUp', label: 'Create account' },
] as const satisfies ReadonlyArray<{ value: AuthMode; label: string }>;

export function AuthModeSwitch({ mode }: { mode: AuthMode }) {
  return (
    <Segmented<AuthMode>
      aria-label="Sign in or create an account"
      value={mode}
      options={OPTIONS}
      onChange={(next) => {
        // Tapping the tab you are already on should do nothing at all, rather
        // than re-mount the screen and wipe half-typed fields.
        if (next === mode) return;
        router.replace(next === 'signIn' ? '/(auth)/sign-in' : '/(auth)/sign-up');
      }}
    />
  );
}
