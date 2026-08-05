import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, SplashScreen } from 'expo-router';
import { useAuth } from '~/providers/AuthProvider';
import { usePalette } from '~/providers/ThemeProvider';

/**
 * The routing decision.
 *
 * Expo Router has no built-in guard concept, so protection is expressed as a
 * redirect at the entry route plus a matching guard in each group's layout.
 * Both are needed: this handles a cold start, the group layouts handle a
 * session ending while the member is deep in the app.
 */
export default function Index() {
  const { isLoading, isAuthenticated } = useAuth();
  const palette = usePalette();

  useEffect(() => {
    // Dismiss the native splash only once the session answer is in — hiding it
    // earlier shows a blank frame, later leaves the splash stuck.
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) {
    // Matches the splash background, so the handover is invisible.
    return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  }

  return <Redirect href={isAuthenticated ? '/(app)/(tabs)' : '/(auth)/sign-in'} />;
}
