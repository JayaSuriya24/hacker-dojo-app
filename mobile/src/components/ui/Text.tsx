import { styled, Text as TamaguiText } from 'tamagui';
import { fontSize, letterSpacing, lineHeight } from '~/theme/tokens';

/**
 * Typography.
 *
 * One component with named variants rather than a dozen bespoke Text wrappers,
 * so a screen states its intent (`<Text variant="eyebrow">`) instead of
 * restating the size and spacing every time.
 *
 * `allowFontScaling` is on everywhere by default — that is what makes Dynamic
 * Type (iOS) and font-size accessibility settings (Android) work. Where a fixed
 * size is structurally necessary the cap is set with `maxFontSizeMultiplier`
 * rather than turning scaling off, so large-text users still get most of the
 * increase.
 */
export const Text = styled(TamaguiText, {
  name: 'Text',
  color: '$color',
  fontFamily: '$body',
  fontSize: fontSize.body,
  lineHeight: lineHeight.body,

  variants: {
    variant: {
      /**
       * The uppercase mono label that opens most sections in the design.
       * Letter-spaced wide; always paired with the accent colour.
       */
      eyebrow: {
        fontFamily: '$mono',
        fontSize: fontSize.caption,
        lineHeight: lineHeight.caption,
        letterSpacing: letterSpacing.eyebrow,
        textTransform: 'uppercase',
        color: '$accentText',
      },
      hero: {
        fontFamily: '$heading',
        fontSize: fontSize.hero,
        lineHeight: lineHeight.hero,
        fontWeight: '700',
        letterSpacing: letterSpacing.tight,
      },
      display: {
        fontFamily: '$heading',
        fontSize: fontSize.display,
        lineHeight: lineHeight.display,
        fontWeight: '500',
        letterSpacing: letterSpacing.tight,
      },
      heading: {
        fontFamily: '$heading',
        fontSize: fontSize.heading,
        lineHeight: lineHeight.heading,
        fontWeight: '500',
      },
      title: {
        fontFamily: '$heading',
        fontSize: fontSize.title,
        lineHeight: lineHeight.title,
        fontWeight: '500',
      },
      subtitle: {
        fontFamily: '$heading',
        fontSize: fontSize.subtitle,
        lineHeight: lineHeight.subtitle,
        fontWeight: '500',
      },
      body: {
        fontSize: fontSize.body,
        lineHeight: lineHeight.body,
      },
      bodyLarge: {
        fontSize: fontSize.bodyLarge,
        lineHeight: lineHeight.bodyLarge,
      },
      small: {
        fontSize: fontSize.small,
        lineHeight: lineHeight.small,
      },
      caption: {
        fontSize: fontSize.caption,
        lineHeight: lineHeight.caption,
        color: '$colorSubtle',
      },
      /** Reservation references, times, counts — anything that should align in a column. */
      mono: {
        fontFamily: '$mono',
        fontSize: fontSize.small,
        lineHeight: lineHeight.small,
      },
      monoLarge: {
        fontFamily: '$mono',
        fontSize: fontSize.display,
        lineHeight: lineHeight.display,
        fontWeight: '600',
      },
    },

    tone: {
      default: { color: '$color' },
      muted: { color: '$colorMuted' },
      subtle: { color: '$colorSubtle' },
      accent: { color: '$accentText' },
      inverse: { color: '$colorInverse' },
      ok: { color: '$ok' },
      warn: { color: '$warn' },
      error: { color: '$error' },
      onAccent: { color: '$onAccent' },
    },

    center: { true: { textAlign: 'center' } },
  } as const,

  defaultVariants: { variant: 'body', tone: 'default' },
});

export type TextProps = React.ComponentProps<typeof Text>;
