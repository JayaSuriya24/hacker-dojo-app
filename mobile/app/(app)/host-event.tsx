import { useState } from 'react';
import { View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Chip, DateField, Segmented, Select, Text, TextField } from '~/components/ui';
import { useRequestToHost } from '~/features/events/hooks/useEvents';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { toDateKey } from '~/utils/format';
import { radius, space } from '~/theme/tokens';
import { EVENT_CATEGORIES } from '~/types/domain';
import { goBackOr } from '~/utils/navigation';

const ROOMS = ['Large Conference', 'Event Hall', 'Small Meeting', 'Hardware Lab'];

/** 1–12, as a clock face is read rather than as a computer stores it. */
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const hour = index + 1;
  return { value: String(hour), label: String(hour) };
});

/** Quarter hours. A meetup starting at 18:07 is not a thing anyone means. */
const MINUTE_OPTIONS = ['00', '15', '30', '45'].map((minute) => ({
  value: minute,
  label: minute,
}));

/**
 * Preset lengths up to two hours, then an escape hatch.
 *
 * Two hours covers the overwhelming majority of what runs here, and a list of
 * every possible minute would be a worse control than a text box. `custom`
 * reveals one.
 */
const DURATION_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '75', label: '1 hour 15 minutes' },
  { value: '90', label: '1 hour 30 minutes' },
  { value: '105', label: '1 hour 45 minutes' },
  { value: '120', label: '2 hours' },
  { value: 'custom', label: 'Custom…' },
];

/** 12-hour wall clock -> the 24-hour `HH:MM` the API stores. */
function to24Hour(hour: string, minute: string, meridiem: 'AM' | 'PM'): string {
  const asNumber = Number(hour) % 12;
  const hours24 = meridiem === 'PM' ? asNumber + 12 : asNumber;
  return `${String(hours24).padStart(2, '0')}:${minute}`;
}

/** Index is the JS/Postgres `dow`: 0 = Sunday … 6 = Saturday. */
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const hostEventSchema = z
  .object({
    title: z.string().trim().min(3, 'Give your event a name.').max(160, 'That name is too long.'),
    category: z.enum(EVENT_CATEGORIES),
    preferredDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
      .refine((value) => new Date(value) >= new Date(new Date().toDateString()), {
        message: 'Pick a date in the future.',
      }),
    preferredRoom: z.string().min(1, 'Pick a room.'),
    notes: z.string().trim().max(1000, 'Keep this under 1000 characters.').optional(),

    startHour: z.string(),
    startMinute: z.string(),
    startMeridiem: z.enum(['AM', 'PM']),
    durationChoice: z.string(),
    customDuration: z.string().optional(),
    repeatMode: z.enum(['once', 'weekly']),
    /** Postgres `dow`: 0 = Sunday … 6 = Saturday. */
    repeatWeekdays: z.array(z.number().int().min(0).max(6)),
    repeatUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    // A weekly request with no days chosen would expand to nothing, so it is
    // refused here rather than accepted into an empty schedule.
    if (value.repeatMode === 'weekly' && value.repeatWeekdays.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['repeatWeekdays'],
        message: 'Pick at least one day.',
      });
    }
    if (value.durationChoice === 'custom') {
      const minutes = Number(value.customDuration);
      if (!Number.isInteger(minutes) || minutes < 15 || minutes > 1440) {
        ctx.addIssue({
          code: 'custom',
          path: ['customDuration'],
          message: 'Between 15 and 1440 minutes.',
        });
      }
    }
    if (value.repeatUntil && value.repeatUntil < value.preferredDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['repeatUntil'],
        message: 'The last date cannot be before the first.',
      });
    }
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
    watch,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<HostEventValues>({
    resolver: zodResolver(hostEventSchema),
    // See the note in sign-up: `category` and `preferredRoom` are chip pickers
    // rather than inputs, so they never blur and `onBlur` would leave `isValid`
    // stale after either is chosen.
    mode: 'onTouched',
    defaultValues: {
      title: '',
      category: 'Community',
      preferredDate: toDateKey(new Date(Date.now() + 7 * 86_400_000)),
      preferredRoom: '',
      notes: '',
      startHour: '6',
      startMinute: '30',
      startMeridiem: 'PM' as const,
      durationChoice: '90',
      customDuration: '',
      repeatMode: 'once' as const,
      // Seeded from the chosen date, so "every week" means the day they picked
      // without making them state it twice.
      repeatWeekdays: [new Date(Date.now() + 7 * 86_400_000).getDay()],
      repeatUntil: '',
    },
  });

  // Drives which schedule fields are on screen; watched rather than read from
  // `getValues` so the section appears the moment the chip is tapped.
  const repeatMode = watch('repeatMode');
  const durationChoice = watch('durationChoice');

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await requestToHost.mutateAsync({
        title: values.title,
        category: values.category,
        preferredDate: values.preferredDate,
        preferredRoom: values.preferredRoom,
        ...(values.notes ? { notes: values.notes } : {}),
        preferredTime: to24Hour(values.startHour, values.startMinute, values.startMeridiem),
        durationMinutes:
          values.durationChoice === 'custom'
            ? Number(values.customDuration)
            : Number(values.durationChoice),
        repeatMode: values.repeatMode,
        repeatWeekdays: values.repeatMode === 'weekly' ? values.repeatWeekdays : [],
        ...(values.repeatMode === 'weekly' && values.repeatUntil
          ? { repeatUntil: values.repeatUntil }
          : {}),
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
            <Button variant="primary" fullWidth onPress={() => goBackOr()}>
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
          variant="primary"
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
                {EVENT_CATEGORIES.map((entry) => (
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

        {/* ---- When it runs -------------------------------------------- */}
        <Controller
          control={control}
          name="preferredDate"
          render={({ field: { onChange, value } }) => (
            <DateField
              label="Preferred date"
              value={value}
              onChange={onChange}
              error={errors.preferredDate?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="repeatMode"
          render={({ field: { onChange, value } }) => (
            <YStack gap={space[3]}>
              <Text variant="eyebrow" tone="subtle">
                How often
              </Text>
              <XStack gap={space[2]} flexWrap="wrap">
                <Chip
                  label="Just once"
                  selected={value === 'once'}
                  onPress={() => onChange('once')}
                />
                <Chip
                  label="Every week"
                  selected={value === 'weekly'}
                  onPress={() => onChange('weekly')}
                />
              </XStack>
            </YStack>
          )}
        />

        {/*
          The weekday and end-date pickers exist only for a repeating event.
          Showing them greyed out for a one-off would ask the host to reason
          about fields that cannot apply to what they just chose.
        */}
        {repeatMode === 'weekly' ? (
          <>
            <Controller
              control={control}
              name="repeatWeekdays"
              render={({ field: { onChange, value } }) => (
                <YStack gap={space[3]}>
                  <Text variant="eyebrow" tone="subtle">
                    Which days
                  </Text>
                  <XStack gap={space[2]} flexWrap="wrap">
                    {WEEKDAY_LABELS.map((label, day) => (
                      <Chip
                        key={label}
                        label={label}
                        selected={value.includes(day)}
                        onPress={() =>
                          onChange(
                            value.includes(day)
                              ? value.filter((entry) => entry !== day)
                              : [...value, day].sort((a, b) => a - b),
                          )
                        }
                      />
                    ))}
                  </XStack>
                  {errors.repeatWeekdays?.message ? (
                    <View aria-live="assertive">
                      <Text variant="caption" tone="error">
                        {errors.repeatWeekdays.message}
                      </Text>
                    </View>
                  ) : null}
                </YStack>
              )}
            />

            <Controller
              control={control}
              name="repeatUntil"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Repeat until"
                  placeholder="YYYY-MM-DD"
                  hint="Leave empty to keep going until you stop it."
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  error={errors.repeatUntil?.message}
                />
              )}
            />
          </>
        ) : null}

        {/* ---- Start time, stated the way people say it ------------------ */}
        <YStack gap={space[3]}>
          <Text variant="eyebrow" tone="subtle">
            Start time
          </Text>
          <XStack gap={space[3]} alignItems="flex-start">
            <YStack flex={1}>
              <Controller
                control={control}
                name="startHour"
                render={({ field: { onChange, value } }) => (
                  <Select
                    label="Hour"
                    hideLabel
                    value={value}
                    options={HOUR_OPTIONS}
                    onChange={onChange}
                  />
                )}
              />
            </YStack>
            <YStack flex={1}>
              <Controller
                control={control}
                name="startMinute"
                render={({ field: { onChange, value } }) => (
                  <Select
                    label="Minute"
                    hideLabel
                    value={value}
                    options={MINUTE_OPTIONS}
                    onChange={onChange}
                  />
                )}
              />
            </YStack>
          </XStack>
          <Controller
            control={control}
            name="startMeridiem"
            render={({ field: { onChange, value } }) => (
              <Segmented
                aria-label="AM or PM"
                value={value}
                onChange={onChange}
                options={[
                  { value: 'AM', label: 'AM' },
                  { value: 'PM', label: 'PM' },
                ]}
              />
            )}
          />
        </YStack>

        {/* ---- How long ------------------------------------------------- */}
        <Controller
          control={control}
          name="durationChoice"
          render={({ field: { onChange, value } }) => (
            <Select
              label="How long"
              value={value}
              options={DURATION_OPTIONS}
              onChange={onChange}
              hint="Up to two hours. Choose Custom for anything else."
            />
          )}
        />

        {/*
          The custom box appears only when Custom is chosen. Leaving a free
          number field on screen next to a list of presets invites someone to
          fill in both and wonder which one won.
        */}
        {durationChoice === 'custom' ? (
          <Controller
            control={control}
            name="customDuration"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Custom length (minutes)"
                placeholder="150"
                keyboardType="number-pad"
                value={String(value ?? '')}
                onChangeText={onChange}
                onBlur={onBlur}
                hint="Between 15 minutes and 24 hours."
                error={errors.customDuration?.message}
              />
            )}
          />
        ) : null}

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
                <View aria-live="assertive">
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
