import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Slot, SplashScreen } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import { QueryProvider } from '~/providers/QueryProvider';
import { AuthProvider } from '~/providers/AuthProvider';
import { ThemeProvider, useResolvedScheme } from '~/providers/ThemeProvider';
import { ErrorBoundary } from '~/components/ErrorBoundary';
import { appConfig } from '~/constants/config';
import { useNotificationSetup } from '~/hooks/useNotifications';
import { useDeepLinks } from '~/hooks/useDeepLinks';

// Hold the native splash until the persisted session has been read, so an
// already-signed-in member never sees the sign-in screen flash past.
void SplashScreen.preventAutoHideAsync();

/**
 * The provider stack. Order is not arbitrary:
 *
 *   GestureHandlerRootView  — must be the outermost native view
 *     SafeAreaProvider      — insets, needed by every screen below
 *       QueryProvider       — AuthProvider clears the cache, so it needs this first
 *         AuthProvider      — session state, which gates routing
 *           ThemeProvider   — reads the appearance preference
 *             StripeProvider
 */
function AppShell() {
  const scheme = useResolvedScheme();

  useDeepLinks();
  useNotificationSetup();

  return (
    <>
      {/* `style` here is the CONTENT colour: light content on the dark ground
          and vice versa, which is the opposite of the theme name. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Guards against a native splash that never dismisses if something below
    // throws before the router mounts.
    const timer = setTimeout(() => void SplashScreen.hideAsync(), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryProvider>
            <AuthProvider>
              <ThemeProvider>
                <StripeProvider
                  publishableKey={appConfig.stripePublishableKey}
                  merchantIdentifier="merchant.org.hackerdojo.app"
                  urlScheme="hackerdojo"
                >
                  <AppShell />
                </StripeProvider>
              </ThemeProvider>
            </AuthProvider>
          </QueryProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
