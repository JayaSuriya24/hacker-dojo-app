/**
 * Design tokens, transcribed from the Nocturne design system and the Hacker
 * Dojo brand layer that overrides it.
 *
 * This file is the single source of colour, spacing, radius and type in the
 * app. Nothing below the theme layer hard-codes a hex or a pixel — the readme
 * in `_ds/nocturne-.../readme.md` states that rule and it is enforced here by
 * there being nowhere else to get a value from.
 *
 * Nocturne ships as a dark system. The Hacker Dojo layer inverts the ground to
 * white and swaps the blurple accent for the Dojo's brand red; both grounds are
 * kept so the app can honour the OS appearance setting rather than pinning one.
 */

// ---------------------------------------------------------------------------
// Brand ramp — Hacker Dojo red. `brand500` is the mark; 600 is the interactive
// base, because 500 against white does not clear 4.5:1 for text.
// ---------------------------------------------------------------------------
export const brand = {
  50: '#FDEEEE',
  100: '#FBE0E0',
  200: '#F7C2C1',
  300: '#F2A3A2',
  400: '#EB706E',
  500: '#E33230',
  600: '#C82C2A',
  700: '#AA2624',
  800: '#881E1D',
  900: '#661716',
} as const;

// ---------------------------------------------------------------------------
// Neutral ramp — Nocturne's OKLCH-derived steps, shared by both grounds so a
// given step carries the same visual weight in either appearance.
// ---------------------------------------------------------------------------
export const neutral = {
  100: '#f3f5fe',
  200: '#e4e7f5',
  300: '#cfd3e5',
  400: '#b2b6ca',
  500: '#9397ab',
  600: '#75798c',
  700: '#595d6c',
  800: '#3f424d',
  900: '#292b31',
} as const;

/** Status colours. Deliberately desaturated — Nocturne keeps chroma for the accent. */
export const status = {
  ok: '#2f7d5f',
  warn: '#8a6a2f',
  error: '#9f1239',
  info: '#4c5397',
} as const;

/**
 * Spacing. Nocturne's 0.70× density scale, rounded to whole pixels.
 *
 * The system's raw values (2.8, 5.6, 8.4 …) are fractional because they are
 * scaled from a 4px base. Fractional pixels on a device produce seams between
 * adjacent surfaces at some scale factors, so they are rounded once, here,
 * rather than by each renderer independently.
 */
export const space = {
  0: 0,
  1: 3,
  2: 6,
  3: 8,
  4: 11,
  5: 14,
  6: 17,
  7: 20,
  8: 22,
  9: 26,
  10: 30,
  12: 36,
  14: 44,
  16: 52,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 14,
  xl: 22,
  /** Nocturne's `.tag`: `calc(var(--radius-md) * 0.75)`. */
  tag: 6,
  pill: 999,
} as const;

/**
 * Type scale. Fixed sizes — in Nocturne density moves spacing, not type.
 * These are the base sizes; `useScaledFont` multiplies them by the OS text-size
 * setting so Dynamic Type and Android font scaling both work.
 */
export const fontSize = {
  micro: 10,
  caption: 11,
  small: 12,
  body: 13,
  bodyLarge: 14,
  subtitle: 15,
  title: 16,
  heading: 20,
  display: 24,
  hero: 32,
} as const;

export const lineHeight = {
  micro: 14,
  caption: 15,
  small: 17,
  body: 19,
  bodyLarge: 20,
  subtitle: 21,
  title: 22,
  heading: 25,
  display: 28,
  hero: 34,
} as const;

/** Nocturne holds headings at 500. "Do not bolden headings past their 500 weight." */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const letterSpacing = {
  tight: -0.2,
  normal: 0,
  wide: 0.4,
  /** The uppercase mono eyebrow that opens most sections. */
  eyebrow: 1.8,
} as const;

// ---------------------------------------------------------------------------
// Semantic palettes, one per appearance.
//
// Every component reads from this shape, never from the ramps directly, so
// switching appearance is a change of one object rather than a sweep of
// conditionals through the tree.
// ---------------------------------------------------------------------------
export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;
  accent: string;
  accentText: string;
  accentBorder: string;
  accentTint: string;
  accentTintStrong: string;
  onAccent: string;
  ok: string;
  warn: string;
  error: string;
  errorTint: string;
  overlay: string;
  skeleton: string;
}

export const lightPalette: Palette = {
  background: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f6f7fd',
  surfaceSunken: '#e4e7f5',
  border: '#e2e5f0',
  borderStrong: neutral[400],
  text: neutral[900],
  textMuted: neutral[700],
  textSubtle: '#67697a',
  textInverse: neutral[100],
  accent: brand[500],
  // Text-weight accent: 600 clears 4.5:1 on white where 500 does not.
  accentText: brand[600],
  accentBorder: brand[300],
  accentTint: 'rgba(227,50,48,0.10)',
  accentTintStrong: 'rgba(227,50,48,0.18)',
  onAccent: '#ffffff',
  ok: status.ok,
  warn: status.warn,
  error: status.error,
  errorTint: '#fff1f4',
  overlay: 'rgba(41,43,49,0.38)',
  skeleton: '#eceef8',
};

export const darkPalette: Palette = {
  // Nocturne's own ground.
  background: '#161826',
  surface: '#232532',
  surfaceAlt: '#1d1f2c',
  surfaceSunken: '#12141f',
  border: 'rgba(233,233,237,0.16)',
  borderStrong: neutral[700],
  text: '#e9e9ed',
  textMuted: neutral[400],
  textSubtle: neutral[500],
  textInverse: neutral[900],
  // On the dark ground the lighter ramp step is the readable one.
  accent: brand[400],
  accentText: brand[300],
  accentBorder: 'rgba(235,112,110,0.55)',
  accentTint: 'rgba(235,112,110,0.12)',
  accentTintStrong: 'rgba(235,112,110,0.22)',
  onAccent: '#ffffff',
  ok: '#4ea583',
  warn: '#c9a35f',
  error: '#e5698a',
  errorTint: 'rgba(229,105,138,0.12)',
  overlay: 'rgba(7,8,12,0.62)',
  skeleton: '#282a38',
};

/**
 * Elevation.
 *
 * Nocturne expresses depth as `--shadow-sm: 0 0 0 1px <ring>` and
 * `--shadow-md: 0 0 0 1px <ring>, 0 6px 18px rgba(0,0,0,.55)` — a hairline plus
 * ambient darkness, never a soft drop shadow doing the separating on its own.
 * The `sm` step is therefore a ring and nothing else, which every surface in
 * this app already draws as a 1px border; only `md` and `lg` add depth beneath
 * it.
 *
 * The colour carries its own alpha so a component can set `shadowOpacity: 1`
 * and let the theme decide how dark the ambience is — the dark ground needs far
 * more of it than the light one.
 */
export const shadows = {
  light: {
    /** The ring. Drawn as a border by `Card`; here for surfaces that cannot. */
    sm: { color: 'rgba(41,43,49,0.10)', radius: 6, offsetY: 2, elevation: 1 },
    md: { color: 'rgba(41,43,49,0.14)', radius: 18, offsetY: 6, elevation: 3 },
    lg: { color: 'rgba(41,43,49,0.20)', radius: 40, offsetY: 16, elevation: 8 },
  },
  dark: {
    sm: { color: 'rgba(0,0,0,0.40)', radius: 6, offsetY: 2, elevation: 1 },
    md: { color: 'rgba(0,0,0,0.55)', radius: 18, offsetY: 6, elevation: 3 },
    lg: { color: 'rgba(0,0,0,0.65)', radius: 40, offsetY: 16, elevation: 8 },
  },
} as const;

export type ShadowStep = keyof (typeof shadows)['light'];

/**
 * A React Native shadow style for one step of the scale.
 *
 * `elevation` is Android's own depth model and is set alongside the iOS
 * properties rather than instead of them — a component styled for one platform
 * and flat on the other is the usual way this goes wrong.
 */
export function shadowStyle(scheme: 'light' | 'dark', step: ShadowStep) {
  const token = shadows[scheme][step];

  return {
    shadowColor: token.color,
    shadowOpacity: 1,
    shadowRadius: token.radius,
    shadowOffset: { width: 0, height: token.offsetY },
    elevation: token.elevation,
  } as const;
}

/**
 * Motion.
 *
 * Durations chosen against the design's own transitions (.2s–.3s) and kept
 * short enough that nothing blocks a tap. Nothing in the app may hardcode a
 * duration or an easing — every animation reads from here, so retuning the
 * system's feel is one edit rather than a sweep through fourteen components.
 *
 * `easing` is Nocturne's own curve, `cubic-bezier(.32,.72,0,1)`: a fast
 * departure and a long settle. `Easing.bezier(...motion.curve)` turns it into
 * the React Native equivalent — see `motionEasing` in `~/theme/motion`.
 */
export const motion = {
  /** Press feedback, colour changes, anything the finger is still touching. */
  fast: 160,
  /** The default. Sheets, cards, list transitions. */
  base: 220,
  /** Deliberate reveals — the occupancy ring filling, an accordion opening. */
  slow: 300,
  /** Long-running ambient loops: the skeleton shimmer, the unlock pulse. */
  ambient: 700,
  /** cubic-bezier(.32,.72,0,1) — the sheet curve from the design. */
  curve: [0.32, 0.72, 0, 1] as const,
} as const;

/**
 * Font families, as the names `expo-font` registers them under.
 *
 * These are the loaded PostScript-ish keys, not CSS stacks. The previous values
 * were `'Inter, system-ui, sans-serif'` and `'JetBrainsMono, ui-monospace,
 * Menlo, monospace'` — comma-separated fallback lists, which are a browser
 * concept. React Native passes the whole string to the platform font resolver,
 * finds nothing, and silently falls back to San Francisco or Roboto: the entire
 * type layer rendered in the wrong face, including the mono columns the design
 * uses to align reservation references and times.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
} as const;

/**
 * The minimum tappable edge. 44pt is Apple's HIG floor; Material asks for 48dp.
 * Taking the larger of the two satisfies both, so no control needs a
 * platform-specific size.
 */
export const HIT_SLOP_MIN = 48;

/** Avatar gradients, cycled by index so a member's colour is stable across screens. */
export const avatarGradients: ReadonlyArray<readonly [string, string]> = [
  [brand[600], brand[900]],
  [brand[600], brand[800]],
  [brand[700], brand[800]],
  [brand[700], brand[900]],
  [brand[600], brand[700]],
] as const;

export function gradientForKey(key: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return avatarGradients[hash % avatarGradients.length]!;
}
