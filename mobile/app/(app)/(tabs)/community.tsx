import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListSkeleton,
  ScreenHeader,
  Segmented,
  Text,
  TextField,
} from '~/components/ui';
import { useDebounced, useDirectory, useStartups } from '~/features/community/hooks/useCommunity';
import { useMe } from '~/features/profile/hooks/useProfile';
import { usePreferencesStore } from '~/store/preferences.store';
import { usePalette } from '~/providers/ThemeProvider';
import { radius, space } from '~/theme/tokens';

const SKILLS = [
  'Rust',
  'iOS',
  'Hardware',
  'AI/ML',
  'Design',
  'VC Pitching',
  'Bio',
  'Robotics',
  'Systems',
];

/**
 * Community — who is on the floor, the full directory, and the startups.
 *
 * The search field is debounced (see `useDebounced`) so typing a name is one
 * query per word rather than one per keystroke against a trigram index over the
 * whole member table.
 */
export default function CommunityScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { data: me } = useMe();

  const tab = usePreferencesStore((state) => state.communityTab);
  const setTab = usePreferencesStore((state) => state.setCommunityTab);
  const skills = usePreferencesStore((state) => state.directorySkills);
  const toggleSkill = usePreferencesStore((state) => state.toggleDirectorySkill);
  const clearSkills = usePreferencesStore((state) => state.clearDirectorySkills);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const isMember = me?.isActiveMember ?? false;

  const directory = useDirectory({
    search: debouncedSearch || undefined,
    skills: skills.length ? skills : undefined,
    here: tab === 'here' || undefined,
  });
  const startups = useStartups();

  const hasFilters = skills.length > 0 || search.length > 0;
  const showingPeople = tab !== 'startups';

  // A guest gets the join prompt, not a permission error they cannot act on.
  if (showingPeople && !isMember) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.background,
          paddingTop: insets.top + space[6],
          paddingHorizontal: space[5],
        }}
      >
        <ScreenHeader eyebrow="Members only" title="Community" />

        <Segmented
          aria-label="Community view"
          options={[
            { value: 'here', label: "Who's here" },
            { value: 'members', label: 'Members' },
            { value: 'startups', label: 'Startups' },
          ]}
          value={tab}
          onChange={setTab}
        />

        <YStack marginTop={space[6]}>
          <Card tone="dashed" alignItems="center" gap={space[3]}>
            <Text variant="title" center>
              The directory is for members
            </Text>
            <Text variant="small" tone="subtle" center>
              Members can see who is on the floor, what they are working on, and reach out directly.
            </Text>
            <XStack gap={space[3]} marginTop={space[2]}>
              <Button onPress={() => router.push('/(app)/(tabs)/dojo')}>See plans</Button>
              <Button variant="secondary" onPress={() => router.push('/(app)/tour')}>
                Take a tour
              </Button>
            </XStack>
          </Card>
        </YStack>
      </View>
    );
  }

  const header = (
    <YStack gap={space[4]}>
      <ScreenHeader
        eyebrow={
          directory.data
            ? `${directory.data.filter((member) => member.isHere).length} checked in right now`
            : 'Community'
        }
        title="Community"
      />

      <Segmented
        aria-label="Community view"
        options={[
          { value: 'here', label: "Who's here" },
          { value: 'members', label: 'Members' },
          { value: 'startups', label: 'Startups' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {showingPeople ? (
        <YStack gap={space[3]}>
          <TextField
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Name, skill, or company"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -space[5] }}
            contentContainerStyle={{ paddingHorizontal: space[5], gap: space[2] }}
          >
            {SKILLS.map((skill) => (
              <Chip
                key={skill}
                label={skill}
                selected={skills.includes(skill)}
                onPress={() => toggleSkill(skill)}
              />
            ))}
          </ScrollView>

          <XStack alignItems="center" gap={space[3]}>
            <Text variant="caption" tone="subtle">
              {directory.data
                ? `${directory.data.length} ${directory.data.length === 1 ? 'person' : 'people'} ${
                    tab === 'here' ? 'on the floor' : 'in the directory'
                  }`
                : ''}
            </Text>
            {hasFilters ? (
              <Pressable
                onPress={() => {
                  clearSkills();
                  setSearch('');
                }}
                role="button"
                aria-label="Clear all filters"
                hitSlop={8}
                style={{ marginLeft: 'auto' }}
              >
                <Text variant="caption" tone="accent">
                  Clear filters
                </Text>
              </Pressable>
            ) : null}
          </XStack>
        </YStack>
      ) : null}
    </YStack>
  );

  if (!showingPeople) {
    return (
      <FlatList
        style={{ flex: 1, backgroundColor: palette.background }}
        contentContainerStyle={{
          paddingTop: insets.top + space[6],
          paddingBottom: insets.bottom + 96,
          paddingHorizontal: space[5],
          gap: space[4],
        }}
        data={startups.data ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: space[3] }}
        renderItem={({ item }) => (
          <Card flexDirection="row" gap={space[4]} alignItems="flex-start">
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: radius.md,
                backgroundColor: palette.accentTintStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden
            >
              <Text variant="mono" fontWeight="700" tone="accent">
                {item.mark}
              </Text>
            </View>

            <YStack flex={1} gap={space[1]}>
              <XStack alignItems="center" gap={space[2]}>
                <Text variant="subtitle">{item.name}</Text>
                {item.hiring ? <Chip label="Hiring" readOnly /> : null}
              </XStack>
              <Text variant="small" tone="muted">
                {item.tagline}
              </Text>
              <Text variant="caption" tone="subtle">
                {item.stage} · Founded at the Dojo {item.foundedYear}
              </Text>
            </YStack>
          </Card>
        )}
        ListEmptyComponent={startups.isPending ? <ListSkeleton count={4} height={110} /> : null}
        refreshControl={
          <RefreshControl
            refreshing={startups.isRefetching}
            onRefresh={() => void startups.refetch()}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    );
  }

  if (directory.isError) {
    return (
      <View
        style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top + space[6] }}
      >
        <ErrorState error={directory.error} onRetry={() => void directory.refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + space[6],
        paddingBottom: insets.bottom + 96,
        paddingHorizontal: space[5],
        gap: space[3],
      }}
      data={directory.data ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={{ marginBottom: space[3] }}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/(app)/member/${item.id}`)}
          role="button"
          aria-label={`${item.name}. ${item.isHere ? `On the floor in ${item.zoneName ?? 'the space'}.` : 'Away.'} ${item.skillLine}`}
          accessibilityHint="Opens their profile"
        >
          <Card interactive flexDirection="row" gap={space[4]} alignItems="flex-start">
            <Avatar
              name={item.name}
              initials={item.initials}
              imageUrl={item.avatarUrl}
              present={item.isHere}
              seed={item.id}
            />

            <YStack flex={1} gap={space[1]}>
              <XStack alignItems="baseline" gap={space[2]}>
                <Text variant="subtitle" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="caption" tone="subtle">
                  {item.zoneName ?? 'Away'}
                </Text>
              </XStack>

              {item.currentProject ? (
                <Text variant="small" tone="muted" numberOfLines={2}>
                  {item.currentProject}
                </Text>
              ) : null}

              <Text variant="mono" tone="subtle" numberOfLines={1}>
                {item.skillLine}
              </Text>
            </YStack>
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        directory.isPending ? (
          <ListSkeleton count={5} height={92} />
        ) : (
          <EmptyState
            title="No one matches"
            description="Try fewer skill filters or a shorter search."
            actionLabel={hasFilters ? 'Reset filters' : undefined}
            onAction={
              hasFilters
                ? () => {
                    clearSkills();
                    setSearch('');
                  }
                : undefined
            }
          />
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={directory.isRefetching}
          onRefresh={() => void directory.refetch()}
          tintColor={palette.accent}
          colors={[palette.accent]}
        />
      }
      showsVerticalScrollIndicator={false}
      windowSize={7}
      removeClippedSubviews
      initialNumToRender={8}
    />
  );
}
