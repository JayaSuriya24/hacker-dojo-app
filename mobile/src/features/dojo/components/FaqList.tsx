import { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, UIManager, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Card, Text } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { useReducedMotion } from '~/hooks/useReducedMotion';
import { space } from '~/theme/tokens';

// LayoutAnimation needs opting into on old-architecture Android. Harmless on
// the new architecture, and cheap insurance if a build ever falls back.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * The FAQ accordion.
 *
 * One item open at a time, which keeps the answer the member just tapped in
 * view instead of pushing it off-screen under previously-opened ones.
 */
export function FaqList({
  faqs,
}: {
  faqs: Array<{ id: string; question: string; answer: string }>;
}) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string) => {
    if (!reducedMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setOpenId((current) => (current === id ? null : id));
  };

  return (
    <Card padded="none" overflow="hidden">
      {faqs.map((faq, index) => {
        const open = openId === faq.id;

        return (
          <View
            key={faq.id}
            style={{
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: palette.border,
            }}
          >
            <Pressable
              onPress={() => toggle(faq.id)}
              accessibilityRole="button"
              accessibilityLabel={faq.question}
              // `expanded` is what makes a screen reader say "collapsed" /
              // "expanded" rather than leaving the +/− glyph as the only cue.
              accessibilityState={{ expanded: open }}
              style={{ minHeight: 48, paddingHorizontal: space[5], paddingVertical: space[4] }}
            >
              <XStack alignItems="center" gap={space[4]}>
                <Text variant="body" flex={1}>
                  {faq.question}
                </Text>
                <Text variant="title" tone="subtle" accessibilityElementsHidden>
                  {open ? '−' : '+'}
                </Text>
              </XStack>
            </Pressable>

            {open ? (
              <YStack paddingHorizontal={space[5]} paddingBottom={space[5]}>
                <Text variant="small" tone="muted">
                  {faq.answer}
                </Text>
              </YStack>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
