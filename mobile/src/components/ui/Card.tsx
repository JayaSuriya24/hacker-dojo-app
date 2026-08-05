import { styled, YStack } from 'tamagui';
import { radius, space } from '~/theme/tokens';

/**
 * The surface primitive. Nocturne's `.card`: a filled surface with a hairline
 * border and no shadow at rest — "on a dark ground elevation is an edge plus
 * ambient darkness".
 */
export const Card = styled(YStack, {
  name: 'Card',
  backgroundColor: '$surface',
  borderWidth: 1,
  borderColor: '$borderColor',
  borderRadius: radius.lg,
  padding: space[5],
  gap: space[2],

  variants: {
    tone: {
      default: {},
      /** The sunken variant used for grouped sub-items (benefits, board grid). */
      alt: { backgroundColor: '$surfaceAlt' },
      /** The tinted hero card — digital key, flagship program. */
      accent: {
        backgroundColor: '$accentTint',
        borderColor: '$accentBorder',
      },
      /** Guest-facing gates: dashed border reads as "not yours yet". */
      dashed: {
        backgroundColor: '$surface',
        borderStyle: 'dashed',
        borderColor: '$borderStrong',
      },
    },

    interactive: {
      true: {
        pressStyle: { backgroundColor: '$backgroundPress', scale: 0.995 },
        // Keyboard focus on Android/web and hardware-keyboard iPad. Nocturne:
        // "never leave the default blue focus ring."
        focusStyle: { borderColor: '$accent' },
      },
    },

    padded: {
      none: { padding: 0 },
      tight: { padding: space[4] },
      loose: { padding: space[6] },
    },
  } as const,

  defaultVariants: { tone: 'default' },
});

export type CardProps = React.ComponentProps<typeof Card>;
