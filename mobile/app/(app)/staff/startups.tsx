import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
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
  Toggle,
} from '~/components/ui';
import {
  useCreateStartup,
  useDeleteStartup,
  useStartups,
  useUpdateStartup,
} from '~/features/community/hooks/useCommunity';
import { useIsStaff } from '~/features/staff/hooks/useStaff';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { goBackOr } from '~/utils/navigation';
import { radius, space } from '~/theme/tokens';
import type { Startup, StartupInput } from '~/types/domain';

/**
 * Managing the startup list.
 *
 * Lives under `(app)/staff` with the rest of the staff surface, and checks the
 * role again on entry. The API refuses a member either way — this is so a
 * member who reaches the URL sees an honest refusal rather than a form whose
 * every submission 403s.
 *
 * Add, edit and remove only. Display order is deliberately NOT editable here —
 * the per-row arrows were removed as clutter on a list that is rearranged a few
 * times a year. `PATCH /v1/startups/reorder` still exists and still works; it
 * simply has no control in the app, so order is changed by whoever curates the
 * list through the API.
 */

const EMPTY: StartupInput = {
  name: '',
  mark: '',
  tagline: '',
  stage: '',
  foundedYear: '',
  hiring: false,
  website: '',
};

/**
 * The same close control the sheets use.
 *
 * A component rather than inline JSX in the options object below, because it
 * needs `usePalette` and the options are a module constant — as a component it
 * renders inside the tree, where hooks are legal.
 */
function CloseControl() {
  const palette = usePalette();

  return (
    <Pressable
      onPress={() => goBackOr()}
      role="button"
      aria-label="Close"
      // 48 is the shared minimum tap target — Material's 48 also satisfies
      // HIG's 44, so one number serves both.
      hitSlop={12}
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.surfaceAlt,
      }}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M6 6l12 12M18 6L6 18"
          stroke={palette.textSubtle}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
}

/**
 * The `(app)` stack hides headers for every screen because the sheets do not
 * want one. A pushed screen does: the header is where the exit lives.
 *
 * The control is supplied explicitly rather than left to the navigator, which
 * only draws its own back arrow when it believes a screen sits behind this one.
 * A direct load of `/staff/startups` — a bookmark, a refresh, a pasted URL —
 * left the header empty and the page with no way out. `goBackOr` covers that:
 * back when the stack can serve it, Home when it cannot.
 *
 * On the right, matching every other ✕ in the app.
 */
const SCREEN_OPTIONS = {
  headerShown: true,
  title: 'Startups',
  headerRight: () => <CloseControl />,
};

export default function StaffStartupsScreen() {
  const palette = usePalette();
  const isStaff = useIsStaff();

  const list = useStartups();
  const create = useCreateStartup();
  const update = useUpdateStartup();
  const remove = useDeleteStartup();

  const [editing, setEditing] = useState<Startup | null>(null);
  const [draft, setDraft] = useState<StartupInput>(EMPTY);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const startForm = useCallback((startup: Startup | null) => {
    setEditing(startup);
    setDraft(
      startup
        ? {
            name: startup.name,
            mark: startup.mark,
            tagline: startup.tagline,
            stage: startup.stage,
            foundedYear: startup.foundedYear,
            hiring: startup.hiring,
            website: startup.website ?? '',
          }
        : EMPTY,
    );
    setError(null);
    setOpen(true);
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    // The website column takes null, not "". An empty field means "no site",
    // and sending the empty string would fail the URL constraint.
    const payload: StartupInput = { ...draft, website: draft.website?.trim() || null };

    try {
      if (editing) await update.mutateAsync({ id: editing.id, patch: payload });
      else await create.mutateAsync(payload);
      setOpen(false);
    } catch (caught) {
      // The server's own sentence — it distinguishes a duplicate name from a
      // malformed year, which a generic "could not save" would not.
      setError(userMessage(caught));
    }
  }, [draft, editing, create, update]);

  if (!isStaff) {
    return (
      <>
        <Stack.Screen options={SCREEN_OPTIONS} />
        <Screen withTabBar={false}>
          <EmptyState
            title="Stewards only"
            description="Managing the startup list is a staff task."
            actionLabel="Back"
            onAction={() => goBackOr()}
          />
        </Screen>
      </>
    );
  }

  const busy = create.isPending || update.isPending;

  return (
    /*
     * `Stack.Screen` is a SIBLING of `Screen`, not a child of it.
     *
     * `Screen` renders its children inside a ScrollView, and a screen-options
     * element nested in there never reaches the navigator — which is why this
     * page had no header, and so no back button, while `staff/documents` (which
     * uses this same fragment shape) has had one all along.
     */
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      <Screen
        withTabBar={false}
        onRefresh={() => void list.refetch()}
        refreshing={list.isRefetching}
      >
        <ScreenHeader eyebrow="Staff" title="Manage startups" />

        {error ? (
          <Text variant="small" tone="error" aria-live="polite">
            {error}
          </Text>
        ) : null}

        {open ? (
          <Card gap={space[3]}>
            <Text variant="subtitle">{editing ? `Edit ${editing.name}` : 'Add a startup'}</Text>

            <TextField
              label="Name"
              value={draft.name}
              onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
            />
            <TextField
              label="Mark"
              hint="Two or three letters for the tile."
              value={draft.mark}
              autoCapitalize="characters"
              onChangeText={(mark) => setDraft((d) => ({ ...d, mark }))}
            />
            <TextField
              label="Tagline"
              value={draft.tagline}
              onChangeText={(tagline) => setDraft((d) => ({ ...d, tagline }))}
            />
            <TextField
              label="Stage"
              hint="Seed, Series A, Acquired…"
              value={draft.stage}
              onChangeText={(stage) => setDraft((d) => ({ ...d, stage }))}
            />
            <TextField
              label="Founded"
              hint="Four-digit year."
              value={draft.foundedYear}
              keyboardType="number-pad"
              maxLength={4}
              onChangeText={(foundedYear) => setDraft((d) => ({ ...d, foundedYear }))}
            />
            <TextField
              label="Website"
              hint="Optional. Must start with https://"
              value={draft.website ?? ''}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={(website) => setDraft((d) => ({ ...d, website }))}
            />
            <Toggle
              label="Hiring"
              description="Shows a Hiring chip on the card."
              value={draft.hiring}
              onChange={(hiring) => setDraft((d) => ({ ...d, hiring }))}
            />

            <XStack gap={space[3]}>
              <Button
                variant="primary"
                loading={busy}
                disabled={busy}
                onPress={() => void submit()}
              >
                {editing ? 'Save changes' : 'Add startup'}
              </Button>
              <Button variant="ghost" onPress={() => setOpen(false)}>
                Cancel
              </Button>
            </XStack>
          </Card>
        ) : (
          <Button variant="primary" fullWidth onPress={() => startForm(null)}>
            Add a startup
          </Button>
        )}

        <YStack gap={space[3]} marginTop={space[4]}>
          {list.isPending ? (
            <ListSkeleton count={4} height={96} />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : (list.data ?? []).length === 0 ? (
            <EmptyState title="No startups yet" description="Add the first one above." />
          ) : (
            (list.data ?? []).map((startup) => (
              <Card key={startup.id} gap={space[3]}>
                <XStack alignItems="flex-start" gap={space[3]}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
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
                    <XStack alignItems="center" gap={space[2]}>
                      <Text variant="subtitle">{startup.name}</Text>
                      {startup.hiring ? <Chip label="Hiring" readOnly /> : null}
                    </XStack>
                    <Text variant="caption" tone="subtle" numberOfLines={2}>
                      {startup.tagline}
                    </Text>
                    <Text variant="caption" tone="subtle">
                      {startup.stage} · {startup.foundedYear}
                    </Text>
                  </YStack>
                </XStack>

                <XStack gap={space[3]}>
                  <Button variant="secondary" size="sm" onPress={() => startForm(startup)}>
                    Edit
                  </Button>

                  {/*
                  Two taps to delete. There is no undo and no soft-delete column,
                  so a single destructive tap next to Edit is how a startup
                  disappears by accident.
                */}
                  {confirmingDelete === startup.id ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        loading={remove.isPending}
                        onPress={() => {
                          void remove
                            .mutateAsync(startup.id)
                            .catch((caught: unknown) => setError(userMessage(caught)));
                          setConfirmingDelete(null);
                        }}
                      >
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" onPress={() => setConfirmingDelete(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => setConfirmingDelete(startup.id)}
                      aria-label={`Remove ${startup.name}`}
                    >
                      Remove
                    </Button>
                  )}
                </XStack>
              </Card>
            ))
          )}
        </YStack>
      </Screen>
    </>
  );
}
