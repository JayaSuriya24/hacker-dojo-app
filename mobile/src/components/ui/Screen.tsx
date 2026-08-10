import type { ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { space } from '~/theme/tokens';

/**
 * Screen scaffolding.
 *
 * Handles the two things every screen needs and no screen should re-solve:
 * safe-area insets (the notch, the home indicator, Android's gesture bar) and
 * the bottom padding that keeps content clear of the floating tab bar.
 *
 * `useSafeAreaInsets` rather than SafeAreaView: the scroll view must extend
 * under the status bar so content scrolls beneath it, while the *content* stays
 * inset. SafeAreaView would clip the whole surface and leave a dead band.
 */

const TAB_BAR_HEIGHT = 84;

export interface ScreenProps extends Omit<ScrollViewProps, 'children'> {
  children: ReactNode;
  /** Off for screens that own their own list (FlatList/FlashList). */
  scrollable?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Leave room for the tab bar. Off inside a modal or sheet. */
  withTabBar?: boolean;
  padded?: boolean;
}

export function Screen({
  children,
  scrollable = true,
  onRefresh,
  refreshing = false,
  withTabBar = true,
  padded = true,
  ...rest
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  const contentPadding = {
    paddingTop: insets.top + space[6],
    paddingBottom: insets.bottom + (withTabBar ? TAB_BAR_HEIGHT : space[8]),
    ...(padded ? { paddingHorizontal: space[5] } : {}),
  };

  if (!scrollable) {
    return (
      <YStack flex={1} backgroundColor="$background" {...contentPadding}>
        {children}
      </YStack>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={contentPadding}
      showsVerticalScrollIndicator={false}
      // iOS gets the rubber-band bounce members expect; Android's overscroll
      // glow is the platform-correct equivalent and is on by default.
      bounces={Platform.OS === 'ios'}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.accent}
            colors={[palette.accent]}
            progressBackgroundColor={palette.surface}
          />
        ) : undefined
      }
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/** The eyebrow + display-size title that opens each tab. */
export function ScreenHeader({
  eyebrow,
  title,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <XStack alignItems="flex-end" gap={space[4]} marginBottom={space[5]}>
      <YStack flex={1} gap={space[1]}>
        {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
        {/* `header` role puts this in the screen-reader rotor, so a member can
            jump between sections instead of swiping through every card. */}
        <Text variant="display" role="heading">
          {title}
        </Text>
      </YStack>
      {trailing}
    </XStack>
  );
}

/** A titled block within a screen. */
export function Section({
  title,
  action,
  children,
  gap = space[4],
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  gap?: number;
}) {
  return (
    <YStack gap={gap} marginTop={space[6]}>
      {title ? (
        <XStack alignItems="center" gap={space[3]}>
          <Text variant="eyebrow" role="heading">
            {title}
          </Text>
          {action ? <YStack marginLeft="auto">{action}</YStack> : null}
        </XStack>
      ) : null}
      {children}
    </YStack>
  );
}
