import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';

/**
 * Load the design system's typefaces.
 *
 * Nocturne is Inter-specific — "Inter for headings over Inter for body text" —
 * and the mono face carries the data columns (reservation references, occupancy
 * counts, slot times) that the layout aligns against. Neither was ever loaded:
 * `tamagui.config.ts` declared CSS-style stacks (`'Inter, system-ui,
 * sans-serif'`), which React Native cannot resolve, so every glyph in the app
 * rendered in the platform default.
 *
 * Six faces rather than the full family: the type scale uses 400/500/600/700 of
 * Inter and 500/600 of the mono, and each additional weight is a real asset in
 * the bundle. Italics are not in the design at all.
 *
 * The root layout holds the native splash until this resolves, so no frame is
 * ever painted in the fallback face — a flash of the wrong typeface is more
 * jarring than a slightly longer splash.
 */
export function useAppFonts(): { loaded: boolean; error: Error | null } {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  return { loaded, error };
}
