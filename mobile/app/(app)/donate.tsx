import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Text, TextField } from '~/components/ui';
import { useDonation } from '~/features/payments/hooks/usePayments';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { dojo } from '~/constants/config';
import { formatCurrency } from '~/utils/format';
import { radius, space } from '~/theme/tokens';

const PRESETS = [2500, 5000, 10000];

/**
 * Donate.
 *
 * The amount is chosen here but validated and charged server-side — the intent
 * is created from the amount the API accepts, not from anything this screen
 * computes, and the server enforces both a floor and a ceiling.
 */
export default function DonateSheet() {
  const palette = usePalette();
  const donation = useDonation();

  const [preset, setPreset] = useState<number | 'custom'>(5000);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [thanked, setThanked] = useState(false);

  const amountCents = preset === 'custom' ? Number(custom) * 100 : preset;
  const canDonate = Number.isFinite(amountCents) && amountCents >= 100;

  const donate = async () => {
    setError(null);
    try {
      const result = await donation.mutateAsync({ amountCents });
      if (!result.cancelled) setThanked(true);
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  if (thanked) {
    return (
      <SheetScreen eyebrow="Received" title="Thank you">
        <YStack gap={space[5]} alignItems="center" paddingVertical={space[8]}>
          <Text variant="small" tone="muted" center>
            A tax receipt is on its way to your email. Hacker Dojo is a 501(c)(3) nonprofit, EIN{' '}
            {dojo.ein}.
          </Text>
          <YStack alignSelf="stretch" marginTop={space[4]}>
            <Button variant="primary" fullWidth onPress={() => router.back()}>
              Done
            </Button>
          </YStack>
        </YStack>
      </SheetScreen>
    );
  }

  return (
    <SheetScreen
      eyebrow={`501(c)(3) · EIN ${dojo.ein}`}
      title="Support the Dojo"
      footer={
        <Button
          variant="commit"
          size="lg"
          fullWidth
          loading={donation.isPending}
          disabled={!canDonate || donation.isPending}
          onPress={() => void donate()}
        >
          {donation.isPending
            ? 'Opening payment…'
            : canDonate
              ? `Donate ${formatCurrency(amountCents)}`
              : 'Choose an amount'}
        </Button>
      }
    >
      <YStack gap={space[5]}>
        <Text variant="small" tone="muted">
          Donations keep the doors open, the labs stocked and community events free.
        </Text>

        {error ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={{
              backgroundColor: palette.errorTint,
              borderWidth: 1,
              borderColor: palette.error,
              borderRadius: radius.md,
              padding: space[4],
            }}
          >
            <Text variant="small" tone="error">
              {error}
            </Text>
          </View>
        ) : null}

        <XStack gap={space[2]} flexWrap="wrap">
          {[...PRESETS, 'custom' as const].map((option) => {
            const selected = preset === option;
            const label = option === 'custom' ? 'Other' : formatCurrency(option);

            return (
              <Pressable
                key={String(option)}
                onPress={() => setPreset(option)}
                accessibilityRole="button"
                accessibilityLabel={option === 'custom' ? 'Enter another amount' : label}
                accessibilityState={{ selected }}
                style={{
                  width: '23%',
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: selected ? palette.accent : palette.border,
                  backgroundColor: selected ? palette.accentTintStrong : 'transparent',
                }}
              >
                <Text variant="mono" tone={selected ? 'accent' : 'muted'}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </XStack>

        {preset === 'custom' ? (
          <TextField
            label="Amount in USD"
            value={custom}
            onChangeText={(text) => setCustom(text.replace(/\D/g, ''))}
            placeholder="250"
            keyboardType="number-pad"
            hint="The minimum we can process is $1."
            autoFocus
          />
        ) : null}

        <Text variant="caption" tone="subtle">
          Payment is handled by Stripe. Card details never touch this app.
        </Text>
      </YStack>
    </SheetScreen>
  );
}
