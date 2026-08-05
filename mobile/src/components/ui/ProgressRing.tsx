import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { YStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { useReducedMotion } from '~/hooks/useReducedMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The live-occupancy dial on Home.
 *
 * Colour shifts from accent through warn to error as the space fills, but the
 * number in the middle and the caption beneath carry the same information —
 * colour is never the only channel, because a member with a colour vision
 * deficiency still needs to know the place is full.
 */

export interface ProgressRingProps {
  /** 0–100. */
  percent: number;
  value: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function ProgressRing({
  percent,
  value,
  total,
  size = 96,
  strokeWidth = 9,
  label,
}: ProgressRingProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const target = circumference * (1 - clamped / 100);

    if (reducedMotion) {
      progress.setValue(target);
      return;
    }

    Animated.timing(progress, {
      toValue: target,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      // strokeDashoffset is not a transform or opacity, so it cannot run on the
      // native driver. The animation is a single short tween on one element,
      // which the JS thread handles without dropping frames.
      useNativeDriver: false,
    }).start();
  }, [circumference, clamped, progress, reducedMotion]);

  const color = clamped > 85 ? palette.error : clamped > 60 ? palette.warn : palette.accent;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Live occupancy'}
      accessibilityValue={{ min: 0, max: total, now: value, text: `${value} of ${total}` }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={palette.surfaceSunken}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={progress}
          // Start the arc at 12 o'clock rather than 3.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <YStack
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        alignItems="center"
        justifyContent="center"
        // The ring's own accessibilityValue already reads the numbers; hiding
        // the inner text stops it being announced a second time.
        accessibilityElementsHidden
      >
        <Text variant="monoLarge" maxFontSizeMultiplier={1.1}>
          {value}
        </Text>
        <Text variant="caption" tone="subtle">
          / {total}
        </Text>
      </YStack>
    </View>
  );
}
