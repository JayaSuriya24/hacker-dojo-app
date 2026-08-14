import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Card, Chip, ListSkeleton, StatusPill, Text } from '~/components/ui';
import {
  useDeleteDocument,
  useDocumentUpload,
  useMyDocuments,
} from '~/features/uploads/hooks/useUploads';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { formatBytes } from '~/utils/format';
import { radius, space } from '~/theme/tokens';
import type { DocumentKind, DocumentStatus } from '~/types/domain';

/**
 * Verification uploads.
 *
 * Checkout tells members on the Student and Veteran rates to "upload a current
 * student ID or a DD-214 from Profile & settings" — a screen that did not
 * exist, against a storage bucket whose policies were already in place. This is
 * that screen.
 *
 * A member can submit, see the decision, and withdraw anything still pending.
 * They cannot withdraw a reviewed document, because the review is the record.
 */

const KINDS: Array<{ value: DocumentKind; label: string; hint: string }> = [
  {
    value: 'student_id',
    label: 'Student ID',
    hint: 'A current, dated student ID or enrolment letter.',
  },
  {
    value: 'veteran_proof',
    label: 'Service proof',
    hint: 'A DD-214 or VA card. Redact anything you would rather not share.',
  },
];

const STATUS_TONE: Record<DocumentStatus, 'ok' | 'warn' | 'error'> = {
  approved: 'ok',
  submitted: 'warn',
  rejected: 'error',
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  approved: 'Approved',
  submitted: 'Waiting on review',
  rejected: 'Not accepted',
};

export default function VerificationSheet() {
  const palette = usePalette();
  const documents = useMyDocuments();
  const upload = useDocumentUpload();
  const remove = useDeleteDocument();

  const [error, setError] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<DocumentKind | null>(null);

  const submit = useCallback(
    async (kind: DocumentKind) => {
      setError(null);
      setUploadingKind(kind);

      try {
        await upload.pickAndUpload(kind);
      } catch (caught) {
        setError(userMessage(caught));
      } finally {
        setUploadingKind(null);
      }
    },
    [upload],
  );

  return (
    <SheetScreen eyebrow="Membership rates" title="Verification">
      <YStack gap={space[5]}>
        <Text variant="small" tone="muted">
          The Student and Veteran rates need one document. A steward reviews it — usually the same
          day — and the rate applies from your next invoice.
        </Text>

        {error ? (
          <View
            aria-live="assertive"
            role="alert"
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

        <YStack gap={space[3]}>
          {KINDS.map((kind) => (
            <Card key={kind.value} gap={space[2]}>
              <Text variant="subtitle">{kind.label}</Text>
              <Text variant="small" tone="subtle">
                {kind.hint}
              </Text>
              <YStack marginTop={space[3]} alignSelf="flex-start">
                <Button
                  loading={uploadingKind === kind.value}
                  disabled={upload.isPending}
                  onPress={() => void submit(kind.value)}
                  aria-label={`Upload a ${kind.label}`}
                >
                  Choose a photo
                </Button>
              </YStack>
            </Card>
          ))}
        </YStack>

        <YStack gap={space[3]}>
          <Text variant="eyebrow" role="heading">
            Submitted
          </Text>

          {documents.isPending ? (
            <ListSkeleton count={2} height={80} />
          ) : (documents.data ?? []).length === 0 ? (
            <Card tone="alt">
              <Text variant="small" tone="subtle">
                Nothing uploaded yet.
              </Text>
            </Card>
          ) : (
            (documents.data ?? []).map((document) => (
              <Card key={document.id} gap={space[2]}>
                <XStack alignItems="center" gap={space[3]}>
                  <YStack flex={1} gap={space[1]}>
                    <Text variant="small" numberOfLines={1}>
                      {document.fileName}
                    </Text>
                    <Text variant="caption" tone="subtle">
                      {formatBytes(document.sizeBytes)} ·{' '}
                      {new Date(document.submittedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </YStack>
                  <StatusPill
                    label={STATUS_LABEL[document.status]}
                    tone={STATUS_TONE[document.status]}
                  />
                </XStack>

                {document.reviewNote ? (
                  <Text variant="small" tone="muted">
                    {document.reviewNote}
                  </Text>
                ) : null}

                {document.status === 'submitted' ? (
                  <XStack marginTop={space[2]}>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={remove.isPending && remove.variables === document.id}
                      onPress={() => remove.mutate(document.id)}
                      aria-label={`Withdraw ${document.fileName}`}
                    >
                      Withdraw
                    </Button>
                  </XStack>
                ) : (
                  <Chip
                    label={document.status === 'approved' ? 'On file' : 'Upload a replacement'}
                    readOnly
                    tone={document.status === 'approved' ? 'ok' : 'warn'}
                  />
                )}
              </Card>
            ))
          )}
        </YStack>
      </YStack>
    </SheetScreen>
  );
}
