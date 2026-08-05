import { createFont, createTamagui, createTokens } from 'tamagui';
import {
  brand,
  darkPalette,
  fontSize,
  fontWeight,
  letterSpacing,
  lightPalette,
  lineHeight,
  neutral,
  radius,
  space,
  status,
} from './src/theme/tokens';

/**
 * Tamagui configuration.
 *
 * Why Tamagui here: this app is one design system rendered in two appearances
 * across two platforms. Tamagui's theme layer resolves `$background`,
 * `$accent`, `$borderColor` at the tree level, so a component is written once
 * and is correct in light and dark without a `useColorScheme()` branch in it.
 * Its compiler additionally flattens static style props to plain views at build
 * time, which matters on the long scrolling surfaces (Events, the directory).
 *
 * The token values come from `src/theme/tokens.ts` — the transcription of the
 * Nocturne system — rather than from Tamagui's stock config, so what ships
 * matches the design file rather than Tamagui's defaults.
 */

const inter = createFont({
  family: 'Inter, system-ui, sans-serif',
  size: fontSize,
  lineHeight,
  weight: {
    micro: fontWeight.regular,
    caption: fontWeight.regular,
    small: fontWeight.regular,
    body: fontWeight.regular,
    bodyLarge: fontWeight.regular,
    subtitle: fontWeight.medium,
    title: fontWeight.medium,
    heading: fontWeight.medium,
    display: fontWeight.medium,
    hero: fontWeight.bold,
  },
  letterSpacing: {
    micro: letterSpacing.wide,
    body: letterSpacing.normal,
    heading: letterSpacing.tight,
    display: letterSpacing.tight,
  },
});

/** Numeric values shown as data — reservation references, times, occupancy. */
const mono = createFont({
  family: 'JetBrainsMono, ui-monospace, Menlo, monospace',
  size: fontSize,
  lineHeight,
  weight: { body: fontWeight.medium, title: fontWeight.semibold },
  letterSpacing: { body: letterSpacing.normal },
});

const tokens = createTokens({
  color: {
    ...Object.fromEntries(Object.entries(brand).map(([k, v]) => [`brand${k}`, v])),
    ...Object.fromEntries(Object.entries(neutral).map(([k, v]) => [`neutral${k}`, v])),
    ok: status.ok,
    warn: status.warn,
    error: status.error,
    info: status.info,
    white: '#ffffff',
    black: '#07080c',
  } as Record<string, string>,
  space: { ...space, true: space[4] },
  size: { ...space, true: space[4] },
  radius: { ...radius, true: radius.md },
  zIndex: { 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 },
});

/**
 * Semantic theme keys. Every component addresses these names, never a ramp
 * step, so the two appearances stay structurally identical.
 */
function themeFrom(palette: typeof lightPalette) {
  return {
    background: palette.background,
    backgroundHover: palette.surfaceAlt,
    backgroundPress: palette.surfaceSunken,
    backgroundFocus: palette.surfaceAlt,
    surface: palette.surface,
    surfaceAlt: palette.surfaceAlt,
    surfaceSunken: palette.surfaceSunken,
    borderColor: palette.border,
    borderColorHover: palette.borderStrong,
    borderColorPress: palette.accentBorder,
    borderColorFocus: palette.accent,
    borderStrong: palette.borderStrong,
    color: palette.text,
    colorHover: palette.text,
    colorPress: palette.text,
    colorFocus: palette.text,
    colorMuted: palette.textMuted,
    colorSubtle: palette.textSubtle,
    colorInverse: palette.textInverse,
    accent: palette.accent,
    accentText: palette.accentText,
    accentBorder: palette.accentBorder,
    accentTint: palette.accentTint,
    accentTintStrong: palette.accentTintStrong,
    onAccent: palette.onAccent,
    ok: palette.ok,
    warn: palette.warn,
    error: palette.error,
    errorTint: palette.errorTint,
    overlay: palette.overlay,
    skeleton: palette.skeleton,
    shadowColor: palette.overlay,
  };
}

export const config = createTamagui({
  fonts: { body: inter, heading: inter, mono },
  tokens,
  themes: {
    light: themeFrom(lightPalette),
    dark: themeFrom(darkPalette),
  },
  settings: {
    // Left permissive so a component can pass a resolved palette value
    // (`palette.accentText`) as well as a token (`$accentText`). The strict
    // modes reject the former, which would force every dynamic colour through
    // a token lookup even where the value is already computed.
    // Tamagui's shorthand set (`f`, `bg`, `ai`) is deliberately off: the
    // codebase reads better with full prop names, and `defaultProps` on our own
    // styled components covers the repetition instead.
    autocompleteSpecificTokens: true,
  },
  media: {
    // Tablet layouts. iPad and large foldables cross 768; the Dojo tab and the
    // directory switch to two columns there.
    phone: { maxWidth: 767 },
    tablet: { minWidth: 768 },
    wide: { minWidth: 1024 },
    short: { maxHeight: 700 },
  },
});

export type AppConfig = typeof config;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
