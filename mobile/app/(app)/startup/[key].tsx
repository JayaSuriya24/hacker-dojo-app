import { Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Card, Chip, ErrorState, ListSkeleton, Text } from '~/components/ui';
import { useStartup } from '~/features/community/hooks/useCommunity';
import { usePalette } from '~/providers/ThemeProvider';
import { logger } from '~/services/logger';
import { radius, space } from '~/theme/tokens';

/**
 * One startup.
 *
 * Reached by slug from the Community tab, which is why the route parameter is
 * `key` rather than `id` — the endpoint behind it takes either, so a link can
 * be `/startup/pebble` and stay readable.
 *
 * Public, like the list. A startup is editorial content about the space rather
 * than member data, so there is no membership gate here and no owner to check
 * against.
 */
export default function StartupSheet() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const palette = usePalette();
  const query = useStartup(key ?? '');

  if (query.isPending) {
    return (
      <SheetScreen title="Startup">
        <ListSkeleton count={3} height={80} />
      </SheetScreen>
    );
  }

  if (query.isError || !query.data) {
    return (
      <SheetScreen title="Startup">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SheetScreen>
    );
  }

  const startup = query.data;

  const openWebsite = async () => {
    if (!startup.website) return;
    try {
      await Linking.openURL(startup.website);
    } catch (error) {
      // Nothing to recover to — the address came from staff and the OS refused
      // it. Logged rather than surfaced, since the button simply not working is
      // the whole of the failure.
      logger.warn('Could not open the startup website', { error, url: startup.website });
    }
  };

  return (
    <SheetScreen eyebrow={startup.stage} title={startup.name}>
      <YStack gap={space[5]}>
        <XStack alignItems="center" gap={space[4]}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: radius.md,
              backgroundColor: palette.accentTintStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-hidden
          >
            <Text variant="mono" fontWeight="700" tone="accent">
              {startup.mark}
            </Text>
          </View>

          <YStack flex={1} gap={space[1]}>
            <Text variant="small" tone="muted">
              {startup.tagline}
            </Text>
            {startup.hiring ? <Chip label="Hiring" readOnly /> : null}
          </YStack>
        </XStack>

        <Card tone="alt" gap={space[2]}>
          <Text variant="small" tone="muted">
            {startup.stage}
          </Text>
          <Text variant="small" tone="muted">
            Founded at the Dojo {startup.foundedYear}
          </Text>
        </Card>

        {/*
          Only when there is one. Most of the seeded startups have no website,
          and a disabled button that says "Visit website" reads as broken rather
          than as absent.
        */}
        {startup.website ? (
          <Button
            variant="secondary"
            fullWidth
            onPress={() => void openWebsite()}
            aria-label={`Open the website for ${startup.name}`}
          >
            Visit website
          </Button>
        ) : null}
      </YStack>
    </SheetScreen>
  );
}
