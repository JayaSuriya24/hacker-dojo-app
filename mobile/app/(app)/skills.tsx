import { useCallback, useState } from 'react';
import { Stack, router } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { Button, Chip, Screen, ScreenHeader, Text, TextField } from '~/components/ui';
import { useMe, useUpdateProfile } from '~/features/profile/hooks/useProfile';
import { MAX_SKILLS, SUGGESTED_SKILLS } from '~/constants/skills';
import { userMessage } from '~/services/api/errors';
import { APP_HOME } from '~/utils/navigation';
import { space } from '~/theme/tokens';

/**
 * The one-time skills prompt.
 *
 * The directory has always been able to search and filter on skills, and
 * nothing ever asked for them — so the column was empty for everyone who never
 * went looking for the profile editor, and the filter chips returned nobody.
 *
 * Shown once, after the account exists. Both buttons record that the prompt has
 * run, because the alternative is asking again on every launch until someone
 * gives an answer, which is how a helpful question becomes a nag. Skipping is a
 * real answer and is treated as one.
 *
 * Nothing here is required and nothing blocks: a member who closes the app
 * mid-prompt simply sees it once more, which is the right failure.
 */
export default function SkillsScreen() {
  const { data: me } = useMe();
  const updateProfile = useUpdateProfile();

  const [selected, setSelected] = useState<string[]>(me?.skills ?? []);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);

  const atLimit = selected.length >= MAX_SKILLS;

  const toggle = useCallback((skill: string) => {
    setError(null);
    setSelected((current) =>
      current.includes(skill)
        ? current.filter((s) => s !== skill)
        : current.length >= MAX_SKILLS
          ? current
          : [...current, skill],
    );
  }, []);

  const addCustom = useCallback(() => {
    const value = custom.trim();
    if (!value) return;

    // Case-insensitive, so "rust" does not sit beside "Rust" in the directory
    // as two different filters.
    if (selected.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setCustom('');
      return;
    }
    if (selected.length >= MAX_SKILLS) {
      setError(`That is the ${MAX_SKILLS} skill limit.`);
      return;
    }

    setSelected((current) => [...current, value]);
    setCustom('');
  }, [custom, selected]);

  /**
   * Both paths end the same way: mark the prompt as run and leave.
   *
   * `skills` is only sent when saving — a skip must not clear a profile that
   * already had some, which is exactly what sending an empty array would do.
   */
  const finish = useCallback(
    async (withSkills: boolean) => {
      setError(null);
      try {
        await updateProfile.mutateAsync(
          withSkills ? { skills: selected, skills_prompted: true } : { skills_prompted: true },
        );
        router.replace(APP_HOME);
      } catch (caught) {
        setError(userMessage(caught));
      }
    },
    [selected, updateProfile],
  );

  const busy = updateProfile.isPending;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen withTabBar={false}>
        <ScreenHeader
          eyebrow="One quick thing"
          title={
            me?.name ? `What do you work on, ${me.name.split(' ')[0]}?` : 'What do you work on?'
          }
        />

        <Text variant="small" tone="muted">
          Members find each other by skill in the directory. Pick up to {MAX_SKILLS} — you can
          change these any time in Settings.
        </Text>

        <XStack flexWrap="wrap" gap={space[2]} marginTop={space[4]}>
          {SUGGESTED_SKILLS.map((skill) => {
            const on = selected.includes(skill);
            return (
              <Chip
                key={skill}
                label={skill}
                selected={on}
                // A chip that cannot be turned on at the limit still turns off,
                // so someone at eight can swap one out without starting over.
                onPress={() => (on || !atLimit ? toggle(skill) : undefined)}
              />
            );
          })}
        </XStack>

        <YStack gap={space[2]} marginTop={space[5]}>
          <TextField
            label="Something else?"
            value={custom}
            onChangeText={setCustom}
            onSubmitEditing={addCustom}
            returnKeyType="done"
            placeholder="Welding, Kubernetes, Mandarin…"
            maxLength={40}
            autoCapitalize="words"
            hint={`${selected.length} of ${MAX_SKILLS} chosen`}
          />
          <XStack>
            <Button variant="secondary" size="sm" onPress={addCustom} disabled={!custom.trim()}>
              Add
            </Button>
          </XStack>
        </YStack>

        {/* Anything typed in appears as a removable chip alongside the rest. */}
        {selected.some(
          (s) => !SUGGESTED_SKILLS.includes(s as (typeof SUGGESTED_SKILLS)[number]),
        ) ? (
          <XStack flexWrap="wrap" gap={space[2]} marginTop={space[3]}>
            {selected
              .filter((s) => !SUGGESTED_SKILLS.includes(s as (typeof SUGGESTED_SKILLS)[number]))
              .map((skill) => (
                <Chip key={skill} label={skill} selected onPress={() => toggle(skill)} />
              ))}
          </XStack>
        ) : null}

        {error ? (
          <Text variant="small" tone="error" aria-live="polite" marginTop={space[3]}>
            {error}
          </Text>
        ) : null}

        <YStack gap={space[3]} marginTop={space[6]}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            disabled={busy || selected.length === 0}
            onPress={() => void finish(true)}
          >
            {selected.length > 0 ? `Save ${selected.length} skills` : 'Save'}
          </Button>

          <Button
            variant="ghost"
            fullWidth
            disabled={busy}
            onPress={() => void finish(false)}
            aria-label="Skip adding skills"
          >
            Skip for now
          </Button>
        </YStack>
      </Screen>
    </>
  );
}
