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
import { useAppFonts } from '~/theme/useAppFonts';
import { logger } from '~/services/logger';
import { silenceWebPropWarnings } from '~/services/silenceWebPropWarnings';

// Hold the native splash until the persisted session AND the design system's
// typefaces have been read, so an already-signed-in member never sees the
// sign-in screen flash past and no frame is painted in the fallback face.
void SplashScreen.preventAutoHideAsync();

// Drops one third-party `collapsable` warning on web in development. Scoped to
// that exact message so our own prop mistakes still surface — see the module.
silenceWebPropWarnings();

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
  const { loaded: fontsLoaded, error: fontError } = useAppFonts();

  useEffect(() => {
    /**
     * A font that fails to load must not hold the app hostage.
     *
     * `useFonts` reports an error rather than throwing, and the honest response
     * is to render in the platform face and say so in the log — the app is
     * fully usable, it just is not the design. Blocking on it would turn a
     * cosmetic failure into an unopenable app.
     */
    if (fontError) {
      logger.exception(fontError, { scope: 'fonts.load' });
    }
  }, [fontError]);

  useEffect(() => {
    // Guards against a native splash that never dismisses if something below
    // throws before the router mounts.
    const timer = setTimeout(() => void SplashScreen.hideAsync(), 4000);
    return () => clearTimeout(timer);
  }, []);

  // Nothing renders until the typefaces resolve. The splash is already on
  // screen, so this is invisible rather than a blank frame.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryProvider>
            <AuthProvider>
              <ThemeProvider>
                <StripeProvider
                  publishableKey={appConfig.stripePublishableKey}
                  merchantIdentifier={appConfig.merchantIdentifier}
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
