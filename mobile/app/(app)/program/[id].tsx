import { useLocalSearchParams } from 'expo-router';
import { YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Card, ErrorState, ListSkeleton, Text } from '~/components/ui';
import { usePrograms } from '~/features/community/hooks/useCommunity';
import { space } from '~/theme/tokens';

/** A program and its tracks — the AI Career Initiative, the Accelerator, and so on. */
export default function ProgramSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = usePrograms();

  const program = query.data?.find((entry) => entry.id === id);

  if (query.isPending) {
    return (
      <SheetScreen title="Program">
        <ListSkeleton count={3} height={120} />
      </SheetScreen>
    );
  }

  if (query.isError || !program) {
    return (
      <SheetScreen title="Program">
        <ErrorState
          error={query.error ?? new Error('That program is no longer listed.')}
          onRetry={() => void query.refetch()}
        />
      </SheetScreen>
    );
  }

  return (
    <SheetScreen eyebrow={program.meta} title={program.name}>
      <YStack gap={space[5]}>
        <Text variant="small" tone="muted">
          {program.blurb}
        </Text>

        {program.tracks.map((track) => (
          <Card key={track.id}>
            <Text variant="title">{track.name}</Text>
            <Text variant="small" tone="muted" marginTop={space[2]}>
              {track.description}
            </Text>

            <YStack gap={space[1]} marginTop={space[4]}>
              <Text variant="caption" tone="subtle">
                For: {track.audience}
              </Text>
              <Text variant="caption" tone="subtle">
                Outcome: {track.outcome}
              </Text>
            </YStack>
          </Card>
        ))}

        {/*
          No apply button here on purpose. Applications are reviewed weekly by
          the programs team through their own intake, and a button that opened
          a form nobody reads would be worse than a clear instruction.
        */}
        <Card tone="alt">
          <Text variant="small" tone="muted">
            Applications are reviewed weekly. Ask a steward at the front desk or email
            programs@hackerdojo.org to start one.
          </Text>
        </Card>
      </YStack>
    </SheetScreen>
  );
}
