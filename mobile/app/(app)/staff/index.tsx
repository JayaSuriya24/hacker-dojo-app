import { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  ScreenHeader,
  Section,
  Segmented,
  Text,
} from '~/components/ui';
import {
  useIsStaff,
  useSetApplicationStatus,
  useSetEventRequestStatus,
  useSetTourStatus,
  useStaffDashboard,
  useStaffQueue,
} from '~/features/staff/hooks/useStaff';
import { usePreferencesStore } from '~/store/preferences.store';
import { usePalette } from '~/providers/ThemeProvider';
import { space } from '~/theme/tokens';
import type { StaffQueueItem, StaffQueueKind } from '~/types/domain';

/**
 * The steward's dashboard.
 *
 * Members were already creating tours, event requests, program applications and
 * verification documents, and nothing could be actioned: the rows were readable
 * only by their author and there was no screen at all.
 *
 * This is deliberately a triage list rather than a CRM. A steward opens it with
 * one question — what needs a decision — so it opens on the counts, and every
 * row carries the two or three buttons that resolve it. Anything more elaborate
 * belongs in a web console, not on a phone at the front desk.
 */

const FILTERS: Array<{ value: StaffQueueKind | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'tour', label: 'Tours' },
  { value: 'event_request', label: 'Events' },
  { value: 'document', label: 'Docs' },
];

/** The decisions available on each kind of row. */
const ACTIONS: Record<
  StaffQueueKind,
  Array<{ label: string; status: string; tone: 'ok' | 'error' }>
> = {
  tour: [
    { label: 'Confirm', status: 'confirmed', tone: 'ok' },
    { label: 'Cancel', status: 'cancelled', tone: 'error' },
  ],
  event_request: [
    { label: 'Accept', status: 'accepted', tone: 'ok' },
    { label: 'Decline', status: 'rejected', tone: 'error' },
  ],
  program_application: [
    { label: 'Accept', status: 'accepted', tone: 'ok' },
    { label: 'Decline', status: 'rejected', tone: 'error' },
  ],
  // Documents open their own screen: a steward has to look at the file
  // before deciding, so an inline Approve button would invite a blind tap.
  document: [],
};

function StatCard({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress?: () => void;
}) {
  const content = (
    <Card padded="tight" gap={space[1]} flex={1}>
      <Text variant="monoLarge" tone={value > 0 ? 'accent' : 'subtle'}>
        {value}
      </Text>
      <Text variant="caption" tone="subtle" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1 }}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
    >
      {content}
    </Pressable>
  );
}

export default function StaffDashboardScreen() {
  const palette = usePalette();
  const isStaff = useIsStaff();

  const filter = usePreferencesStore((state) => state.staffFilter);
  const setFilter = usePreferencesStore((state) => state.setStaffFilter);

  const dashboard = useStaffDashboard();
  const queue = useStaffQueue(filter === 'all' ? {} : { kind: filter });

  const setTour = useSetTourStatus();
  const setEventRequest = useSetEventRequestStatus();
  const setApplication = useSetApplicationStatus();

  const pending = setTour.isPending || setEventRequest.isPending || setApplication.isPending;

  const decide = useCallback(
    (item: StaffQueueItem, status: string) => {
      switch (item.kind) {
        case 'tour':
          setTour.mutate({ id: item.id, status: status as 'confirmed' | 'cancelled' });
          return;
        case 'event_request':
          setEventRequest.mutate({ id: item.id, status: status as 'accepted' | 'rejected' });
          return;
        case 'program_application':
          setApplication.mutate({ id: item.id, status: status as 'accepted' | 'rejected' });
          return;
        default:
          return;
      }
    },
    [setTour, setEventRequest, setApplication],
  );

  const onRefresh = useCallback(() => {
    void dashboard.refetch();
    void queue.refetch();
  }, [dashboard, queue]);

  const items = useMemo(
    // Anything already decided is history, not a queue item.
    () =>
      (queue.data ?? []).filter(
        (item) => item.status === 'submitted' || item.status === 'requested',
      ),
    [queue.data],
  );

  /**
   * A member who is not staff should not be here at all. The API would refuse
   * every request anyway, so this is about not showing an empty screen with a
   * red error on it rather than about access control.
   */
  if (!isStaff) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: 'Staff' }} />
        <Screen withTabBar={false}>
          <EmptyState
            title="Stewards only"
            description="This area is for Dojo staff."
            actionLabel="Back"
            onAction={() => router.back()}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Staff',
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.accentText,
          headerTitleStyle: { color: palette.text },
        }}
      />

      <Screen withTabBar={false} onRefresh={onRefresh} refreshing={queue.isRefetching}>
        <ScreenHeader eyebrow="Front desk" title="Needs a decision" />

        {dashboard.isPending ? (
          <ListSkeleton count={1} height={80} />
        ) : dashboard.data ? (
          <YStack gap={space[3]}>
            <XStack gap={space[3]}>
              <StatCard
                value={dashboard.data.pendingTours}
                label="Tours"
                onPress={() => setFilter('tour')}
              />
              <StatCard
                value={dashboard.data.pendingEventRequests}
                label="Event requests"
                onPress={() => setFilter('event_request')}
              />
              <StatCard
                value={dashboard.data.pendingDocuments}
                label="Documents"
                onPress={() => router.push('/(app)/staff/documents')}
              />
            </XStack>

            <XStack gap={space[3]}>
              <StatCard value={dashboard.data.activeMembers} label="Active members" />
              <StatCard value={dashboard.data.onFloor} label="On the floor now" />
              <StatCard value={dashboard.data.pendingApplications} label="Applications" />
            </XStack>
          </YStack>
        ) : null}

        <Section title="Queue">
          <Segmented
            accessibilityLabel="Filter the queue"
            options={FILTERS}
            value={filter}
            onChange={setFilter}
          />

          <YStack gap={space[3]} marginTop={space[4]}>
            {queue.isError ? (
              <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
            ) : queue.isPending ? (
              <ListSkeleton count={4} height={120} />
            ) : items.length === 0 ? (
              <EmptyState
                title="Nothing waiting"
                description="Every request has been actioned. Good desk."
              />
            ) : (
              items.map((item) => (
                <Card key={`${item.kind}:${item.id}`} gap={space[2]}>
                  <XStack alignItems="center" gap={space[2]} flexWrap="wrap">
                    <Chip
                      label={FILTERS.find((f) => f.value === item.kind)?.label ?? item.kind}
                      readOnly
                    />
                    <Text variant="caption" tone="subtle">
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </XStack>

                  <Text variant="subtitle" numberOfLines={2}>
                    {item.summary}
                  </Text>
                  <Text variant="small" tone="muted">
                    {item.requesterName}
                    {item.requesterEmail ? ` · ${item.requesterEmail}` : ''}
                  </Text>
                  {item.detail ? (
                    <Text variant="mono" tone="subtle" numberOfLines={1}>
                      {item.detail}
                    </Text>
                  ) : null}

                  {item.kind === 'document' ? (
                    <XStack marginTop={space[3]}>
                      <Button
                        size="sm"
                        onPress={() => router.push('/(app)/staff/documents')}
                        accessibilityLabel={`Review ${item.summary}`}
                      >
                        Review file
                      </Button>
                    </XStack>
                  ) : (
                    <XStack gap={space[3]} marginTop={space[3]}>
                      {ACTIONS[item.kind].map((action) => (
                        <View key={action.status} style={{ flex: 1 }}>
                          <Button
                            variant={action.tone === 'ok' ? 'primary' : 'destructive'}
                            size="sm"
                            fullWidth
                            disabled={pending}
                            onPress={() => decide(item, action.status)}
                            accessibilityLabel={`${action.label} ${item.summary} for ${item.requesterName}`}
                          >
                            {action.label}
                          </Button>
                        </View>
                      ))}
                    </XStack>
                  )}
                </Card>
              ))
            )}
          </YStack>
        </Section>
      </Screen>
    </>
  );
}
