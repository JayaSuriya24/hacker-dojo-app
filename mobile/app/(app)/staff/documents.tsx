import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import { Stack } from 'expo-router';
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
  Text,
  TextField,
} from '~/components/ui';
import { usePendingDocuments, useReviewDocument } from '~/features/staff/hooks/useStaff';
import { usePalette } from '~/providers/ThemeProvider';
import { formatBytes } from '~/utils/format';
import { space } from '~/theme/tokens';
import type { DocumentKind } from '~/types/domain';

/**
 * Document review.
 *
 * Separate from the main queue because it is the one decision that cannot be
 * made from a summary line: a steward has to open the student ID and read it.
 * The signed URL arrives with the row and expires in five minutes, which is why
 * the list is never cached and the screen refetches on focus.
 */

const KIND_LABEL: Record<DocumentKind, string> = {
  student_id: 'Student ID',
  veteran_proof: 'Veteran proof',
  certification: 'Certification',
  other: 'Other',
};

export default function StaffDocumentsScreen() {
  const palette = usePalette();
  const documents = usePendingDocuments();
  const review = useReviewDocument();

  // Per-document, so a note typed against one file does not follow the next.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const decide = useCallback(
    (id: string, status: 'approved' | 'rejected') => {
      setActing(id);
      const note = notes[id]?.trim();

      review.mutate(
        { id, status, ...(note ? { reviewNote: note } : {}) },
        {
          onSettled: () => {
            setActing(null);
            setNotes((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
          },
        },
      );
    },
    [notes, review],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Verification',
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.accentText,
          headerTitleStyle: { color: palette.text },
        }}
      />

      <Screen
        withTabBar={false}
        onRefresh={() => void documents.refetch()}
        refreshing={documents.isRefetching}
      >
        <ScreenHeader eyebrow="Awaiting review" title="Documents" />

        <YStack gap={space[4]}>
          {documents.isError ? (
            <ErrorState error={documents.error} onRetry={() => void documents.refetch()} />
          ) : documents.isPending ? (
            <ListSkeleton count={3} height={180} />
          ) : (documents.data ?? []).length === 0 ? (
            <EmptyState
              title="Nothing to verify"
              description="Student IDs and service proofs land here when a member uploads one."
            />
          ) : (
            (documents.data ?? []).map((document) => (
              <Card key={document.id} gap={space[3]}>
                <XStack alignItems="center" gap={space[2]} flexWrap="wrap">
                  <Chip label={KIND_LABEL[document.kind]} readOnly />
                  <Text variant="caption" tone="subtle">
                    {formatBytes(document.sizeBytes)} ·{' '}
                    {new Date(document.submittedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </XStack>

                <Text variant="subtitle" numberOfLines={1}>
                  {document.fileName}
                </Text>

                {document.url ? (
                  <Button
                    variant="secondary"
                    onPress={() => void Linking.openURL(document.url as string)}
                    aria-label={`Open ${document.fileName}`}
                    accessibilityHint="Opens the file in your browser"
                  >
                    Open file
                  </Button>
                ) : (
                  <Text variant="caption" tone="subtle">
                    That link expired. Pull to refresh.
                  </Text>
                )}

                <TextField
                  label="Note"
                  value={notes[document.id] ?? ''}
                  onChangeText={(text) =>
                    setNotes((current) => ({ ...current, [document.id]: text }))
                  }
                  placeholder="Optional — shown to the member"
                  multiline
                />

                <XStack gap={space[3]}>
                  <View style={{ flex: 1 }}>
                    <Button
                      fullWidth
                      loading={acting === document.id && review.isPending}
                      disabled={review.isPending}
                      onPress={() => decide(document.id, 'approved')}
                      aria-label={`Approve ${document.fileName}`}
                    >
                      Approve
                    </Button>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      variant="destructive"
                      fullWidth
                      disabled={review.isPending}
                      onPress={() => decide(document.id, 'rejected')}
                      aria-label={`Reject ${document.fileName}`}
                    >
                      Reject
                    </Button>
                  </View>
                </XStack>
              </Card>
            ))
          )}
        </YStack>
      </Screen>
    </>
  );
}
