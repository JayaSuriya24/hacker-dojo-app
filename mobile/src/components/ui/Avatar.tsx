import { Image } from 'expo-image';
import { View } from 'react-native';
import { LinearGradient } from 'tamagui/linear-gradient';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { gradientForKey, radius } from '~/theme/tokens';

/**
 * Member avatar.
 *
 * Falls back to initials on a gradient derived from the member's id, so the
 * colour is stable across every screen they appear on — a card that changes
 * colour between the directory and their profile reads as a different person.
 *
 * `expo-image` rather than RN's Image: it has a real disk cache and a
 * cross-fade, which matters on the directory where thirty avatars load at once.
 */

export interface AvatarProps {
  name: string;
  initials: string;
  /** Storage path; resolved against the public avatars bucket. */
  imageUrl?: string | null;
  size?: number;
  /** Green presence dot for members currently on the floor. */
  present?: boolean;
  /** Stable colour seed. Defaults to the name when no id is available. */
  seed?: string;
}

export function Avatar({ name, initials, imageUrl, size = 42, present, seed }: AvatarProps) {
  const palette = usePalette();
  const [start, end] = gradientForKey(seed ?? name);
  const dotSize = Math.max(10, Math.round(size * 0.26));

  return (
    <View
      // One accessible node, not two: a screen reader should say "Priya Raman,
      // on the floor", never "P R" followed by an unlabelled image.
      accessible
      role="img"
      aria-label={present ? `${name}, on the floor` : name}
      style={{ width: size, height: size }}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: size, height: size, borderRadius: radius.pill }}
          contentFit="cover"
          transition={160}
          cachePolicy="memory-disk"
        />
      ) : (
        <LinearGradient
          colors={[start, end]}
          start={[0.15, 0]}
          end={[0.85, 1]}
          width={size}
          height={size}
          borderRadius={radius.pill}
          alignItems="center"
          justifyContent="center"
        >
          <Text
            fontSize={Math.round(size * 0.34)}
            fontWeight="700"
            color={palette.onAccent}
            maxFontSizeMultiplier={1}
          >
            {initials}
          </Text>
        </LinearGradient>
      )}

      {present ? (
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: dotSize,
            height: dotSize,
            borderRadius: radius.pill,
            backgroundColor: palette.ok,
            borderWidth: 2,
            borderColor: palette.surface,
          }}
        />
      ) : null}
    </View>
  );
}
