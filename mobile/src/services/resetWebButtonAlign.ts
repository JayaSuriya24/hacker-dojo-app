import { Platform } from 'react-native';

/**
 * Restore React Native's text alignment inside pressables, on web only.
 *
 * `Pressable` with `role="button"` is rendered by react-native-web as a real
 * `<button>` element, and every browser's default stylesheet carries
 * `button { text-align: center }`. That declaration is inherited by everything
 * inside, so any single stretched line of text in a pressable card drifts into
 * the middle of it — while native, which has no such rule, renders the same
 * component left-aligned. The layout was never expressed anywhere in this
 * codebase; it arrived from the user agent.
 *
 * It hid well because it only bites a specific shape. A row of two Texts is
 * unaffected: they are flex items packed to the start, so centring has nothing
 * to act on. A lone Text filling its parent is centred, and reads as a
 * mysterious one-off rather than as a rule applying to 22 call sites.
 *
 * Resetting to `inherit` does not impose a new opinion — it removes one, so web
 * matches what the same JSX does on iOS and Android. Anything that genuinely
 * wants centred text says so through flexbox, the way React Native has to.
 */
export function resetWebButtonAlign(): void {
  if (Platform.OS !== 'web') return;
  // Expo Router static-renders these routes in Node, where there is no DOM.
  // The module runs again in the browser, which is where the tag is wanted.
  if (typeof document === 'undefined') return;

  const id = 'hd-reset-button-align';
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.id = id;
  // `[role="button"]` as well as `button`, because react-native-web picks the
  // element by accessibility role and a non-focusable pressable stays a div.
  style.textContent = '[role="button"],button{text-align:inherit;}';
  document.head.appendChild(style);
}
