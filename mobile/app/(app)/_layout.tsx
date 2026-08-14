import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '~/providers/AuthProvider';
import { useMe } from '~/features/profile/hooks/useProfile';
import { usePalette } from '~/providers/ThemeProvider';

/**
 * The authenticated group.
 *
 * The guard here catches a session that ends mid-use — a refresh token revoked
 * from another device, an account disabled — and drops the member back to
 * sign-in from wherever they were. The entry route's redirect only covers a
 * cold start, so both are needed.
 */
export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { data: me } = useMe();
  const pathname = usePathname();
  const palette = usePalette();

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/sign-in" />;

  /*
   * The one-time skills prompt.
   *
   * Gated on the server's own flag rather than on `skills.length`, because an
   * empty list cannot distinguish "never asked" from "asked, and they skipped"
   * — the second would be asked again forever.
   *
   * Held until `me` has loaded: redirecting on an undefined profile would send
   * every member through the prompt on every cold start, before the answer
   * arrives. And the prompt route itself is excluded, or it redirects to
   * itself.
   */
  if (me && !me.skillsPrompted && pathname !== '/skills') {
    return <Redirect href="/(app)/skills" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen name="(tabs)" />

      {/* A full-screen step, not a sheet: it is the only thing to do here. */}
      <Stack.Screen name="skills" options={{ animation: 'fade' }} />

      {/*
        Detail surfaces present as sheets rather than pushes. On iOS
        `formSheet` gives the native grabber and swipe-to-dismiss; Android
        renders it as a bottom sheet with the same gesture, so one declaration
        is correct on both.
      */}
      <Stack.Screen
        name="event/[id]"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.9],
        }}
      />
      <Stack.Screen
        name="member/[id]"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.75],
        }}
      />
      <Stack.Screen
        name="book/[id]"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.92],
        }}
      />
      <Stack.Screen
        name="program/[id]"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.88],
        }}
      />
      <Stack.Screen
        name="host-event"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.9],
        }}
      />
      <Stack.Screen
        name="tour"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.8],
        }}
      />
      <Stack.Screen
        name="donate"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.7],
        }}
      />
      <Stack.Screen
        name="checkout"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.75],
        }}
      />
      <Stack.Screen
        name="settings"
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />

      {/* Verification uploads — a form, so a sheet like the rest of them. */}
      <Stack.Screen
        name="verification"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.85],
        }}
      />

      {/*
        Staff surfaces are pushes rather than sheets: a steward works through a
        queue and needs the back stack, not a dismiss gesture that loses their
        place.
      */}
      <Stack.Screen name="staff/index" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="staff/documents" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
