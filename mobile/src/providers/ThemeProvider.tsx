import { useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { TamaguiProvider, Theme } from 'tamagui';
// From expo-router, not `@react-navigation/native`: since SDK 56 expo-router
// vendors its own navigation core and importing react-navigation directly is a
// hard bundler error.
import { ThemeProvider as NavigationThemeProvider, type Theme as NavTheme } from 'expo-router';
import config from '../../tamagui.config';
import { darkPalette, lightPalette, type Palette } from '~/theme/tokens';
import { useAppearance } from '~/store/preferences.store';

/**
 * Appearance.
 *
 * Three consumers have to agree on the current palette or the app looks broken
 * at the seams: Tamagui (component styles), React Navigation (headers, screen
 * backgrounds, the push transition's underlay) and the native root view (what
 * shows behind the JS during launch and overscroll). All three are driven from
 * the same resolved value here.
 *
 * The member's explicit choice wins over the OS setting; 'system' defers to it.
 */

export function useResolvedScheme(): 'light' | 'dark' {
  const systemScheme = useColorScheme();
  const preference = useAppearance();

  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function usePalette(): Palette {
  const scheme = useResolvedScheme();
  return scheme === 'dark' ? darkPalette : lightPalette;
}

function toNavigationTheme(palette: Palette, dark: boolean): NavTheme {
  return {
    dark,
    colors: {
      primary: palette.accent,
      background: palette.background,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      notification: palette.accent,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '600' },
      heavy: { fontFamily: 'System', fontWeight: '700' },
    },
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useResolvedScheme();
  const palette = scheme === 'dark' ? darkPalette : lightPalette;

  const navigationTheme = useMemo(
    () => toNavigationTheme(palette, scheme === 'dark'),
    [palette, scheme],
  );

  useEffect(() => {
    // Without this the native root stays white and flashes during a dark-mode
    // launch, and iOS overscroll reveals white above the content.
    void SystemUI.setBackgroundColorAsync(palette.background);
  }, [palette.background]);

  return (
    <TamaguiProvider config={config} defaultTheme={scheme}>
      <Theme name={scheme}>
        <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
      </Theme>
    </TamaguiProvider>
  );
}
