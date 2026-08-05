import { useLocalSearchParams } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Avatar, Card, Chip, ErrorState, ListSkeleton, Text } from '~/components/ui';
import { useMember } from '~/features/community/hooks/useCommunity';
import { space } from '~/theme/tokens';

/**
 * A member's profile.
 *
 * Read-only by design. Members can see who is here and what they are working
 * on — the whole point of the directory — but there is no in-app messaging, so
 * this does not offer a "message" button that would go nowhere. Introductions
 * happen on the floor, which is the Dojo's own answer.
 */
export default function MemberSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useMember(id ?? '');

  if (query.isPending) {
    return (
      <SheetScreen title="Member">
        <ListSkeleton count={3} height={72} />
      </SheetScreen>
    );
  }

  if (query.isError || !query.data) {
    return (
      <SheetScreen title="Member">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SheetScreen>
    );
  }

  const member = query.data;

  return (
    <SheetScreen title={member.name}>
      <YStack gap={space[5]}>
        <XStack alignItems="center" gap={space[4]}>
          <Avatar
            name={member.name}
            initials={member.initials}
            imageUrl={member.avatarPath}
            present={member.isHere}
            size={58}
            seed={member.id}
          />
          <YStack flex={1} gap={space[1]}>
            <Text variant="small" tone="muted">
              {member.isHere ? `On the floor · ${member.zoneName ?? 'in the space'}` : 'Away'}
            </Text>
            {member.memberSince ? (
              <Text variant="caption" tone="subtle">
                Member since{' '}
                {new Date(member.memberSince).toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            ) : null}
          </YStack>
        </XStack>

        {member.bio ? (
          <Text variant="small" tone="muted">
            {member.bio}
          </Text>
        ) : null}

        {member.skills.length ? (
          <YStack gap={space[3]}>
            <Text variant="eyebrow">Skills</Text>
            <XStack gap={space[2]} flexWrap="wrap">
              {member.skills.map((skill) => (
                <Chip key={skill} label={skill} readOnly />
              ))}
            </XStack>
          </YStack>
        ) : null}

        {member.currentProject ? (
          <Card tone="alt">
            <Text variant="eyebrow">Current project</Text>
            <Text variant="small" marginTop={space[2]}>
              {member.currentProject}
            </Text>
          </Card>
        ) : null}

        {member.company ? (
          <Text variant="caption" tone="subtle">
            {member.company}
          </Text>
        ) : null}
      </YStack>
    </SheetScreen>
  );
}
