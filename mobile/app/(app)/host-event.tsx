import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Chip, Text, TextField } from '~/components/ui';
import { useRequestToHost } from '~/features/events/hooks/useEvents';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { toDateKey } from '~/utils/format';
import { radius, space } from '~/theme/tokens';
import type { EventCategory } from '~/types/domain';

const CATEGORIES: EventCategory[] = ['Hackathons', 'Hardware', 'AI/ML', 'Community'];
const ROOMS = ['Large Conference', 'Event Hall', 'Small Meeting', 'Hardware Lab'];

const hostEventSchema = z.object({
  title: z.string().trim().min(3, 'Give your event a name.').max(160, 'That name is too long.'),
  category: z.enum(['Hackathons', 'Hardware', 'AI/ML', 'Community']),
  expectedSize: z.coerce
    .number({ message: 'Enter a number.' })
    .int()
    .min(1, 'At least one attendee.')
    .max(500, 'Over 500 needs a conversation with the events team.'),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
    .refine((value) => new Date(value) >= new Date(new Date().toDateString()), {
      message: 'Pick a date in the future.',
    }),
  preferredRoom: z.string().min(1, 'Pick a room.'),
  notes: z.string().trim().max(1000, 'Keep this under 1000 characters.').optional(),
});

type HostEventValues = z.input<typeof hostEventSchema>;

/**
 * Request to host an event.
 *
 * Submits a request, not an event — the events team confirms the room and
 * publishes the listing. The confirmation says so and hands back the reference
 * they will quote in their reply.
 */
export default function HostEventSheet() {
  const palette = usePalette();
  const requestToHost = useRequestToHost();
  const [reference, setReference] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<HostEventValues>({
    resolver: zodResolver(hostEventSchema),
    mode: 'onBlur',
    defaultValues: {
      title: '',
      category: 'Community',
      expectedSize: '' as unknown as number,
      preferredDate: toDateKey(new Date(Date.now() + 7 * 86_400_000)),
      preferredRoom: '',
      notes: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await requestToHost.mutateAsync({
        title: values.title,
        category: values.category,
        expectedSize: Number(values.expectedSize),
        preferredDate: values.preferredDate,
        preferredRoom: values.preferredRoom,
        ...(values.notes ? { notes: values.notes } : {}),
      });
      setReference(result.reference);
    } catch (error) {
      setFormError(userMessage(error));
    }
  });

  if (reference) {
    return (
      <SheetScreen eyebrow="Submitted" title="Request received">
        <YStack gap={space[5]} alignItems="center" paddingVertical={space[8]}>
          <Text variant="heading" tone="accent">
            {reference}
          </Text>
          <Text variant="small" tone="muted" center>
            The events team replies within two business days and handles the calendar listing.
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
      eyebrow="Request a slot"
      title="Host an event"
      footer={
        <Button
          variant="solid"
          size="lg"
          fullWidth
          loading={isSubmitting}
          disabled={!isValid || isSubmitting}
          onPress={() => void onSubmit()}
        >
          {isSubmitting ? 'Submitting…' : 'Submit request'}
        </Button>
      }
    >
      <YStack gap={space[5]}>
        {formError ? (
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
              {formError}
            </Text>
          </View>
        ) : null}

        <Controller
          control={control}
          name="title"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Event name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.title?.message}
              placeholder="e.g. Rust after dark"
              autoCapitalize="sentences"
            />
          )}
        />

        <Controller
          control={control}
          name="category"
          render={({ field: { onChange, value } }) => (
            <YStack gap={space[3]}>
              <Text variant="eyebrow" tone="subtle">
                Type
              </Text>
              <XStack gap={space[2]} flexWrap="wrap">
                {CATEGORIES.map((entry) => (
                  <Chip
                    key={entry}
                    label={entry}
                    selected={value === entry}
                    onPress={() => onChange(entry)}
                  />
                ))}
              </XStack>
            </YStack>
          )}
        />

        <XStack gap={space[3]}>
          <YStack flex={1}>
            <Controller
              control={control}
              name="expectedSize"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Expected attendees"
                  value={String(value ?? '')}
                  onChangeText={(text) => onChange(text.replace(/\D/g, ''))}
                  onBlur={onBlur}
                  error={errors.expectedSize?.message}
                  placeholder="40"
                  keyboardType="number-pad"
                />
              )}
            />
          </YStack>

          <YStack flex={1}>
            <Controller
              control={control}
              name="preferredDate"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Preferred date"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.preferredDate?.message}
                  placeholder="2026-08-20"
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                />
              )}
            />
          </YStack>
        </XStack>

        <Controller
          control={control}
          name="preferredRoom"
          render={({ field: { onChange, value } }) => (
            <YStack gap={space[3]}>
              <Text variant="eyebrow" tone="subtle">
                Room
              </Text>
              <XStack gap={space[2]} flexWrap="wrap">
                {ROOMS.map((room) => (
                  <Chip
                    key={room}
                    label={room}
                    selected={value === room}
                    onPress={() => onChange(room)}
                  />
                ))}
              </XStack>
              {errors.preferredRoom?.message ? (
                <View accessibilityLiveRegion="assertive">
                  <Text variant="caption" tone="error">
                    {errors.preferredRoom.message}
                  </Text>
                </View>
              ) : null}
            </YStack>
          )}
        />

        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Anything else"
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.notes?.message}
              placeholder="AV needs, catering, a co-host…"
              multiline
              numberOfLines={3}
              hint="Optional"
            />
          )}
        />
      </YStack>
    </SheetScreen>
  );
}
