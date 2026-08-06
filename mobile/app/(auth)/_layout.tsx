import { Redirect, Stack } from 'expo-router';
import { useAuth } from '~/providers/AuthProvider';
import { usePalette } from '~/providers/ThemeProvider';

/**
 * The auth group.
 *
 * The redirect is the inverse of the app group's: an already-signed-in member
 * who lands here (via a stale deep link, say) is sent into the app rather than
 * shown a sign-in form for an account they are already using.
 */
export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const palette = usePalette();

  if (isLoading) return null;
  if (isAuthenticated) return <Redirect href="/(app)/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
        // The auth screens are a linear flow with their own hero header, so
        // they slide rather than modal-present.
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
