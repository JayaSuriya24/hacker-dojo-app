import { Platform } from 'react-native';

/**
 * Silence one specific third-party dev warning on web.
 *
 * React DOM logs:
 *
 *   Received `false` for a non-boolean attribute `collapsable`.
 *
 * `collapsable` is an Android-only hint that lets React Native flatten a view
 * out of the native hierarchy. It has no web meaning, and nothing in this
 * codebase sets it — the prop originates inside expo-router's vendored
 * react-navigation views, which pass it unconditionally.
 *
 * It was worth confirming rather than assuming, so each of these was ruled out
 * by experiment rather than by reading:
 *
 *   · react-native-reanimated already guards it with `Platform.select`.
 *   · expo-router's `Background` still warned after being patched and Metro's
 *     cache cleared, so it is not the source.
 *   · react-native-screens' `ScreenContentWrapper` renders no element on web.
 *   · react-native-web's `View` and Tamagui's core both strip the prop.
 *
 * React's own stack is commit-phase only (`setInitialProperties`), so it cannot
 * name the offending component, and there is no local fix — the prop is set in
 * library code we do not control.
 *
 * This is deliberately the narrowest possible filter:
 *
 *   · Web only. Native never emits it.
 *   · Development only. `validatePropertiesInDevelopment` does not exist in
 *     React's production build, so a web export never logs this anyway.
 *   · Matches `collapsable` specifically, not the warning *class*. A future
 *     unknown-prop warning from our own code — the `accessibilityRole` leak
 *     that was worth catching — still reaches the console.
 *
 * Remove this once expo-router stops sending the prop on web.
 */
export function silenceWebPropWarnings(): void {
  if (Platform.OS !== 'web' || !__DEV__) return;

  const original = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === 'string' &&
      first.includes('non-boolean attribute') &&
      args.some((arg) => arg === 'collapsable')
    ) {
      return;
    }
    original(...args);
  };
}
