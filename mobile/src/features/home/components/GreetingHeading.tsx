import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Text } from '~/components/ui';
import { useReducedMotion } from '~/hooks/useReducedMotion';
import { timing } from '~/theme/motion';

/**
 * The Home greeting, which fades and rises into place.
 *
 * The animation exists for a specific reason rather than as decoration: the
 * member's name arrives asynchronously, so this line renders once without it
 * and again with it. Swapped instantly that is a visible snap on every cold
 * open; faded, it reads as the name settling in.
 *
 * Keyed on the text, so it replays only when the words actually change and not
 * on every parent re-render — the occupancy dial refetches on a timer, and a
 * heading that re-animates each time it does would be a fidget.
 *
 * Reduce Motion is handled by `timing`, which returns a duration of zero. The
 * heading still arrives; it simply arrives at once.
 */
export function GreetingHeading({ text }: { text: string }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      ...timing('base', { reducedMotion }),
    });
    animation.start();
    return () => animation.stop();
  }, [text, progress, reducedMotion]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            // A short rise, not a slide. Anything longer turns a greeting into
            // an entrance and delays the content underneath it.
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
          },
        ],
      }}
    >
      <Text variant="display" role="heading">
        {text}
      </Text>
    </Animated.View>
  );
}
