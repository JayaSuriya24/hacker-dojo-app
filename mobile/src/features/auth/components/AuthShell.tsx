import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'tamagui/linear-gradient';
import { YStack } from 'tamagui';
import Svg, { Path } from 'react-native-svg';
import { Text } from '~/components/ui';
import { brand, radius, space } from '~/theme/tokens';
import { dojo } from '~/constants/config';

/**
 * The auth screens' shared frame: the brand gradient hero with the torii mark,
 * and the white sheet that rides up over it.
 *
 * `KeyboardAvoidingView` behaviour differs by platform because the platforms
 * genuinely differ — iOS reports the keyboard as an overlay that needs padding,
 * Android resizes the window itself and `height` is the correct mode.
 */

/** The Hacker Dojo torii, drawn rather than shipped as an asset so it inherits colour. */
export function ToriiMark({ size = 24, color = '#ffffff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 5h20M4 8.5h16M6.5 8.5V21M17.5 8.5V21M6.5 12.5h11"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function AuthShell({ heading, children }: { heading: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // Dismiss the keyboard on drag — the standard gesture on both platforms
        // for a long form.
        keyboardDismissMode="on-drag"
      >
        <LinearGradient
          colors={[brand[500], brand[700], brand[900]]}
          start={[0.1, 0]}
          end={[0.9, 1]}
          height={300}
          paddingHorizontal={space[8]}
          justifyContent="flex-end"
          paddingBottom={space[16]}
        >
          {/* Decorative torii watermark, hidden from assistive tech. */}
          <View
            style={{ position: 'absolute', top: 90, left: -24, opacity: 0.2 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Svg width={441} height={240} viewBox="0 0 441 240" fill="none">
              <Path
                d="M0 0h441M36 36h369M86 36v240M355 36v240M86 80h269"
                stroke="#ffffff"
                strokeWidth={11}
                strokeLinecap="round"
              />
            </Svg>
          </View>

          <YStack gap={space[2]} paddingTop={insets.top}>
            <Text variant="hero" tone="onAccent" accessibilityRole="header">
              HACKER DOJO
            </Text>
            <Text variant="eyebrow" color="rgba(255,255,255,0.8)">
              Member Portal
            </Text>
            <Text variant="heading" tone="onAccent" marginTop={space[3]}>
              {heading}
            </Text>
          </YStack>
        </LinearGradient>

        <YStack
          flex={1}
          marginTop={-44}
          backgroundColor="$background"
          borderTopLeftRadius={radius.xl}
          borderTopRightRadius={radius.xl}
          paddingHorizontal={space[7]}
          paddingTop={space[8]}
          paddingBottom={insets.bottom + space[10]}
          gap={space[5]}
        >
          {children}

          <YStack marginTop="auto" paddingTop={space[6]} gap={space[3]}>
            <Text variant="caption" tone="subtle" center>
              A 501(c)(3) nonprofit · EIN {dojo.ein}
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
