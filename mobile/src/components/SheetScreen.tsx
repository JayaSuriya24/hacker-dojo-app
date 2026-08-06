import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';
import { Text } from '~/components/ui';
import { usePalette, useResolvedScheme } from '~/providers/ThemeProvider';
import { shadowStyle, space } from '~/theme/tokens';

/**
 * The scaffold shared by every sheet route.
 *
 * The native `formSheet` presentation supplies the grabber, the backdrop and
 * the dismiss gesture, so this only owns what is inside: the eyebrow/title
 * pair, scrolling, and keyboard avoidance for the sheets that contain a form.
 */
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
        <YStack gap={space[2]} marginBottom={space[5]}>
          {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>
        </YStack>

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
