import { styled, YStack } from 'tamagui';
import { focusStyle } from '~/theme/focus';
import { radius, space } from '~/theme/tokens';

/**
 * The surface primitive. Nocturne's `.card`: a filled surface with a hairline
 * border, and elevation expressed as "an edge plus ambient darkness" rather
 * than as a drop shadow.
 *
 * The `elevated` and `floating` variants map onto the system's `--shadow-md`
 * and `--shadow-lg`. `--shadow-sm` is a 1px ring with no drop shadow at all,
 * which is exactly what the default variant's hairline border already draws —
 * so the resting card takes no `shadowOpacity`, and adding one would contradict
 * the system rather than implement it.
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

    /**
     * Elevation.
     *
     * Nocturne: "Do not stack heavy shadows; on a dark ground elevation is an
     * edge plus ambient darkness." Both steps therefore keep the hairline and
     * add only diffuse depth beneath it — the ring does the separating, the
     * shadow only says how far off the page the surface sits.
     */
    elevation: {
      none: {},
      /** `--shadow-md` — a card lifted off the page. */
      raised: {
        shadowColor: '$shadowColorRaised',
        shadowOpacity: 1,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      },
      /** `--shadow-lg` — the top of the stack: sheets, dialogs, popovers. */
      floating: {
        shadowColor: '$shadowColorFloating',
        shadowOpacity: 1,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: 16 },
        elevation: 8,
        borderColor: '$borderStrong',
      },
    },

    interactive: {
      true: {
        pressStyle: { backgroundColor: '$backgroundPress', scale: 0.995 },
        // Keyboard focus on Android/web and hardware-keyboard iPad. Nocturne:
        // "never leave the default blue focus ring."
        focusStyle: { borderColor: '$accent', ...focusStyle },
      },
    },

    padded: {
      none: { padding: 0 },
      tight: { padding: space[4] },
      loose: { padding: space[6] },
    },
  } as const,

  defaultVariants: { tone: 'default', elevation: 'none' },
});

export type CardProps = React.ComponentProps<typeof Card>;
