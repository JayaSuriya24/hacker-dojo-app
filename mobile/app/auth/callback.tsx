import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { YStack } from 'tamagui';
import { AuthShell } from '~/features/auth/components/AuthShell';
import { Button, Card, Text } from '~/components/ui';
import { space } from '~/theme/tokens';
import { AUTH_HOME } from '~/utils/navigation';

/**
 * Where the "Confirm email address" link lands.
 *
 * `auth.service` asks Supabase to send members here — `Linking.createURL(
 * '/auth/callback')`, which resolves to `hackerdojo://auth/callback` on a
 * device and to `<origin>/auth/callback` on the web. Nothing answered that URL
 * before, so confirming an address opened a route the router could not match:
 * the address WAS confirmed server-side, and the member was left staring at a
 * dead page with no way back in.
 *
 * The confirmation itself is already done by the time anyone gets here.
 * Supabase marks the address verified inside `/auth/v1/verify` and only then
 * redirects, so this screen has nothing to verify — its whole job is to say so
 * and hand the member back to sign-in.
 *
 * The `code` that rides along could be exchanged for a session (the client is
 * on the PKCE flow), which would drop them straight into the app. That is
 * deliberately not done: signing someone in from a link in their inbox means a
 * forwarded email signs in whoever opens it. Asking for the password once, on a
 * screen they recognise, costs one step and removes that.
 */
export default function AuthCallbackScreen() {
  const { error_description: errorDescription } = useLocalSearchParams<{
    error_description?: string;
  }>();
  const failed = Boolean(errorDescription);
  const [seconds, setSeconds] = useState(3);

  // A short pause so the outcome is readable, then on to sign-in. A member who
  // does not want to wait has the button.
  useEffect(() => {
    if (failed) return;
    if (seconds <= 0) {
      router.replace(AUTH_HOME);
      return;
    }
    const timer = setTimeout(() => setSeconds((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [failed, seconds]);

  return (
    <AuthShell heading={failed ? 'That link did not work' : 'Email confirmed'}>
      <Card>
        <YStack gap={space[4]}>
          <Text>
            {failed
              ? 'That confirmation link has expired or has already been used. Sign in to request a new one.'
              : 'Your email address is confirmed. Sign in to finish setting up your membership.'}
          </Text>

          {!failed && seconds > 0 ? (
            <Text variant="small" tone="muted">
              Taking you to sign in in {seconds}…
            </Text>
          ) : null}

          <Button variant="primary" fullWidth onPress={() => router.replace(AUTH_HOME)}>
            Go to sign in
          </Button>
        </YStack>
      </Card>
    </AuthShell>
  );
}
