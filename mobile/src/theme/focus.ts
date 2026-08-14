import type { PressableStateCallbackType, ViewStyle } from 'react-native';
import type { Palette } from './tokens';

/**
 * The keyboard focus ring.
 *
 * Nocturne: `:focus-visible { outline: 2px solid var(--color-accent);
 * outline-offset: 2px; }` — and "never leave the default blue focus ring".
 * Only `Card` implemented it; every button, chip, segment and switch in the app
 * had no focus state at all.
 *
 * That matters in three real places rather than as a checkbox: the static web
 * export in `mobile/dist`, an iPad with a hardware keyboard, and Android TalkBack
 * / switch-access navigation. React Native Web maps `outline*` straight onto
 * CSS; on native the same properties are inert, so a focus ring here costs
 * nothing where it does not apply.
 *
 * Applied on `focusStyle` (Tamagui) or via `useFocusRing` for plain Pressables,
 * so it appears on keyboard focus and never on touch — a ring that follows every
 * tap is noise.
 */
export function focusRing(palette: Palette): ViewStyle {
  return {
    outlineColor: palette.accent,
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineOffset: 2,
  } as ViewStyle;
}

/**
 * Removes the browser's own focus ring from an element we ring ourselves.
 *
 * `outlineWidth: 0` alone does not do it. Chrome's default for a focused input
 * is `outline-style: auto`, and for `auto` it paints the platform ring and
 * ignores the declared width — so the ring survives a zeroed width and only
 * `outline-style: none` clears it.
 *
 * Cast because React Native types the style as solid/dotted/dashed only, while
 * react-native-web forwards the value straight to CSS where `none` is valid.
 * Inert on native, where outline properties do not apply.
 */
export const noFocusRing = {
  outlineStyle: 'none',
  outlineWidth: 0,
  // Narrowed to the two properties rather than `ViewStyle`, so it spreads into
  // a `TextStyle` (the input) as readily as a view's.
} as unknown as { outlineStyle: 'solid'; outlineWidth: number };

/** The Tamagui `focusStyle` shape, addressing theme tokens rather than values. */
export const focusStyle = {
  outlineColor: '$accent',
  outlineStyle: 'solid',
  outlineWidth: 2,
  outlineOffset: 2,
} as const;

/**
 * The focus ring for a `Pressable`, from its style callback's state.
 *
 * React Native Web passes `focused` alongside `pressed`, but React Native's own
 * `PressableStateCallbackType` declares only `pressed` — the web renderer adds
 * the field at runtime without the types following. Reading it through one
 * narrowing helper keeps that discrepancy in a single documented place instead
 * of a cast at every call site.
 *
 * Returns null on native, where the field is absent and the outline properties
 * would be inert anyway.
 */
export function pressableFocusRing(
  state: PressableStateCallbackType,
  palette: Palette,
): ViewStyle | null {
  const focused = (state as PressableStateCallbackType & { focused?: boolean }).focused;
  return focused ? focusRing(palette) : null;
}
