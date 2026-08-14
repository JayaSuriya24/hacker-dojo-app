import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { goBackOr } from '~/utils/navigation';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import { Text } from '~/components/ui';
import { usePalette, useResolvedScheme } from '~/providers/ThemeProvider';
import { radius, shadowStyle, space } from '~/theme/tokens';

/**
 * The scaffold shared by every sheet route.
 *
 * On iOS and Android the `formSheet` presentation supplies the grabber, the
 * backdrop and the dismiss gesture, so this owns only what is inside: the
 * eyebrow/title pair, scrolling, and keyboard avoidance for the form sheets.
 *
 * Web gets none of that. `formSheet` degrades to an ordinary full screen with
 * no grabber, no backdrop to tap and no swipe, so a sheet opened there was a
 * dead end — a member could reach "Host an event", fill none of it in, and have
 * no way back that was not the browser's own chrome. The close control below
 * exists for exactly that gap, which is why it is shown where the platform
 * provides no gesture rather than everywhere: on iOS a redundant ✕ next to a
 * grabber is clutter, and Android already answers the back gesture.
 */
const NEEDS_CLOSE_CONTROL = Platform.OS === 'web';

export function SheetScreen({
  eyebrow,
  title,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  /** Pinned below the scroll area — the primary action on a form sheet. */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const scheme = useResolvedScheme();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: space[5],
          paddingTop: space[6],
          paddingBottom: footer ? space[5] : insets.bottom + space[8],
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <XStack alignItems="flex-start" gap={space[4]} marginBottom={space[5]}>
          <YStack flex={1} gap={space[2]}>
            {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
            <Text variant="heading" role="heading">
              {title}
            </Text>
          </YStack>

          {NEEDS_CLOSE_CONTROL ? (
            <Pressable
              onPress={() => goBackOr()}
              role="button"
              aria-label="Close"
              accessibilityHint="Discards this form and goes back"
              // 48 is the shared minimum tap target — Material's 48 also
              // satisfies HIG's 44, so one number serves both.
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.surfaceAlt,
              }}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M6 6l12 12M18 6L6 18"
                  stroke={palette.textSubtle}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </Pressable>
          ) : null}
        </XStack>

        {children}
      </ScrollView>

      {/*
        The pinned action bar is a floating element over scrolling content, so it
        takes the system's top elevation step — `--shadow-lg`, which on this
        ground is a hairline plus ambient darkness rather than a drop shadow
        doing the separating.
      */}
      {footer ? (
        <YStack
          paddingHorizontal={space[5]}
          paddingTop={space[4]}
          paddingBottom={insets.bottom + space[4]}
          borderTopWidth={1}
          borderTopColor="$borderColor"
          backgroundColor="$background"
          {...shadowStyle(scheme, 'lg')}
        >
          {footer}
        </YStack>
      ) : null}
    </KeyboardAvoidingView>
  );
}
