import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { XStack, YStack } from 'tamagui';
import { Card, Text } from '~/components/ui';
import { useWifiCredential } from '~/features/access/hooks/useAccess';
import { usePalette } from '~/providers/ThemeProvider';
import { space } from '~/theme/tokens';
import type { SiteSettings } from '~/types/domain';

/**
 * Wi-Fi, which is two networks rather than one.
 *
 * The member network is on the left because it is the one a member wants; the
 * guest network sits on the right, shown to everyone including signed-out
 * visitors, because its password is posted on the wall and hiding it would be
 * hiding the thing it exists for.
 *
 * Every value copies on tap and says which one it copied. A single "tap to
 * copy" was fine when there was one password; with a username and two
 * passwords in play, tapping blind tells you nothing about what you now hold.
 */

/** How long a row shows "Copied" before returning to its instruction. */
const COPIED_HOLD_MS = 2000;

/** Below this the two columns stack rather than squeeze. Roughly a phone. */
const COLUMN_MIN_WIDTH = 200;

/**
 * Row icons.
 *
 * Drawn as paths rather than pulled from a font, matching `TabIcon` — they take
 * their colour from a prop, stay crisp at any density and add no asset weight.
 * Phosphor's line style, which is the system's icon set.
 *
 * They carry no meaning a sighted user could not read from the label beside
 * them, so they are `aria-hidden`: announcing "image, network" before the label
 * is noise to a screen reader, not information.
 */
type RowIcon = 'network' | 'user' | 'secret';

function RowGlyph({ name, color }: { name: RowIcon; color: string }) {
  const common = {
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      {name === 'network' ? (
        <>
          <Path d="M4.5 9.8a10.5 10.5 0 0 1 15 0" {...common} />
          <Path d="M7.8 13.1a6 6 0 0 1 8.4 0" {...common} />
          <Circle cx={12} cy={17.4} r={1.3} fill={color} />
        </>
      ) : name === 'user' ? (
        <>
          <Circle cx={12} cy={8.4} r={3.6} {...common} />
          <Path d="M5.2 19.6a7.4 7.4 0 0 1 13.6 0" {...common} />
        </>
      ) : (
        <>
          <Rect x={5} y={10.6} width={14} height={9.4} rx={2.2} {...common} />
          <Path d="M8.6 10.6V7.8a3.4 3.4 0 0 1 6.8 0v2.8" {...common} />
        </>
      )}
    </Svg>
  );
}

/**
 * One label/value pair, behind a fixed-width glyph.
 *
 * The label and value stay STACKED rather than sitting side by side: the value
 * can be an email address, which has no business competing for width with its
 * own label. Only the text column flexes, and it flexes as a block — so a long
 * address wraps under its label instead of squeezing it, which is what the
 * earlier row-with-a-flexed-label got wrong.
 */
function CopyRow({
  label,
  value,
  icon,
  mono,
  copied = false,
  onCopy,
}: {
  label: string;
  value: string | null;
  icon: RowIcon;
  mono?: boolean;
  copied?: boolean;
  /**
   * Omit to render a plain, unpressable row.
   *
   * A network NAME is not worth copying: nobody pastes an SSID, they pick it
   * off a list on their phone. Offering "Copy" on it spends the one accent
   * affordance in the row on the field least likely to need it, and puts a
   * button next to text that does nothing useful when tapped.
   */
  onCopy?: (value: string) => void;
}) {
  const palette = usePalette();
  const disabled = !value;

  const body = (
    <XStack paddingVertical={space[2]} gap={space[3]} alignItems="center">
      {/*
        Fixed width, not intrinsic: the three glyphs differ slightly in drawn
        width, and letting each size itself would leave the labels beside them
        starting at three different x positions down the column.
      */}
      <View style={{ width: 18, alignItems: 'center' }}>
        <RowGlyph name={icon} color={palette.textSubtle} />
      </View>

      <YStack flex={1} gap={space[1]}>
        <XStack alignItems="center" gap={space[2]}>
          <Text variant="caption" tone="subtle">
            {label}
          </Text>
          {onCopy && value ? (
            <Text variant="caption" tone="accent">
              {copied ? 'Copied' : 'Copy'}
            </Text>
          ) : null}
        </XStack>

        {/*
        `textAlign` is stated rather than left to inherit. On web a Pressable
        carrying `role="button"` renders as a real <button>, and the browser's
        own stylesheet centres text inside one — which every child inherits.
        The label row above escapes it by accident, because its two Texts are
        flex items packed to the start; this line, being a single stretched
        child, would sit in the middle of the column without this.
      */}
        <Text variant={mono ? 'mono' : 'small'} textAlign="left">
          {value ?? '—'}
        </Text>
      </YStack>
    </XStack>
  );

  // No copy handler means no button: a plain row, with none of the pressable
  // semantics a screen reader would otherwise announce as actionable.
  if (!onCopy) return body;

  return (
    <Pressable
      onPress={() => value && onCopy(value)}
      disabled={disabled}
      role="button"
      aria-label={`Copy the ${label.toLowerCase()}`}
      aria-disabled={disabled}
      accessibilityHint={copied ? 'Copied to your clipboard' : `Copies the ${label.toLowerCase()}`}
    >
      {body}
    </Pressable>
  );
}

export function WifiCard({ settings }: { settings: SiteSettings | undefined }) {
  // Enabled on membership inside the hook, so a guest never fires this.
  const credential = useWifiCredential();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copy = useCallback(async (field: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), COPIED_HOLD_MS);
  }, []);

  const member = credential.data;

  return (
    <Card padded="tight" gap={space[3]}>
      <Text variant="small">Wi-Fi</Text>

      {/*
        Two flexed columns in a row — the same shape LiveSessionCard uses for
        its pair of buttons. `flexWrap` plus a minimum width means they stack on
        a phone instead of shrinking into two unreadable slivers.
      */}
      <XStack gap={space[5]} flexWrap="wrap">
        {/* ---- Left: the member network ---------------------------------- */}
        <YStack flex={1} minWidth={COLUMN_MIN_WIDTH}>
          <Text variant="eyebrow">Yours</Text>

          {member ? (
            <>
              <CopyRow label="Network" value={member.ssid} icon="network" mono />
              <CopyRow
                label="Username"
                value={member.username}
                icon="user"
                copied={copiedField === 'member-username'}
                onCopy={(value) => void copy('member-username', value)}
              />
              <CopyRow
                label="PIN"
                value={member.pin}
                icon="secret"
                mono
                copied={copiedField === 'member-pin'}
                onCopy={(value) => void copy('member-pin', value)}
              />
              <Text variant="caption" tone="subtle">
                Also in your welcome email.
              </Text>
            </>
          ) : (
            // A guest gets told what they are missing rather than an empty
            // column, which would read as something failing to load.
            <Text variant="caption" tone="subtle" paddingVertical={space[2]}>
              Members sign in to the fast network with their own email address and PIN.
            </Text>
          )}
        </YStack>

        {/* ---- Right: the guest network ---------------------------------- */}
        <YStack flex={1} minWidth={COLUMN_MIN_WIDTH}>
          <Text variant="eyebrow">For guests</Text>

          <CopyRow label="Network" value={settings?.wifiGuestSsid ?? null} icon="network" mono />
          <CopyRow
            label="Password"
            value={settings?.wifiGuestPassword ?? null}
            icon="secret"
            mono
            copied={copiedField === 'guest-password'}
            onCopy={(value) => void copy('guest-password', value)}
          />
        </YStack>
      </XStack>
    </Card>
  );
}
