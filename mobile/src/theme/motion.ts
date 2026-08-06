import { Easing, type EasingFunction } from 'react-native';
import { motion } from './tokens';

/**
 * Motion, as React Native consumes it.
 *
 * `tokens.motion` holds the numbers; this turns them into the `Animated`
 * primitives components actually pass. Keeping the conversion here means no
 * component ever writes `Easing.out(Easing.cubic)` or a literal `700` — both of
 * which were scattered across the app before, so the design's own curve
 * (`cubic-bezier(.32,.72,0,1)`) was transcribed into `tokens.ts` and then
 * never used by anything.
 */

/**
 * Nocturne's curve. Fast departure, long settle — the same easing the design's
 * sheets and dialogs use, so a sheet in the app decelerates like a sheet in the
 * design file rather than like React Native's default.
 */
export const motionEasing: EasingFunction = Easing.bezier(
  motion.curve[0],
  motion.curve[1],
  motion.curve[2],
  motion.curve[3],
);

/**
 * A looping ambient animation reads as decorative and should be gentle at both
 * ends, so it takes the symmetric curve rather than the system's.
 */
export const ambientEasing: EasingFunction = Easing.inOut(Easing.ease);

export interface TimingOptions {
  duration: number;
  easing: EasingFunction;
  useNativeDriver: boolean;
}

/**
 * Build the config for `Animated.timing`.
 *
 * `reducedMotion` is a parameter rather than a hook call so this stays usable
 * inside an effect, and so the caller cannot forget it: every animation in the
 * app is expected to have a Reduce Motion path, and a duration of zero is the
 * honest way to express "arrive immediately" without branching at each site.
 */
export function timing(
  speed: keyof Pick<typeof motion, 'fast' | 'base' | 'slow' | 'ambient'>,
  options: { reducedMotion?: boolean; useNativeDriver?: boolean; easing?: EasingFunction } = {},
): TimingOptions {
  return {
    duration: options.reducedMotion ? 0 : motion[speed],
    easing: options.easing ?? motionEasing,
    useNativeDriver: options.useNativeDriver ?? true,
  };
}
