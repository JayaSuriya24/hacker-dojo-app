import { forwardRef, useState } from 'react';
import { Pressable, TextInput, type TextInputProps, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { HIT_SLOP_MIN, radius, space } from '~/theme/tokens';

/**
 * The form field.
 *
 * Built to be driven by React Hook Form — it takes `value`/`onChangeText` and
 * an `error` string, and owns none of that state itself.
 *
 * The accessibility work here is the part that is easy to skip and expensive to
 * retrofit: the label is bound to the input via `aria-label`, the error
 * is announced through `accessibilityHint` and marked with
 * `aria-live` so TalkBack reads it when it appears, and the
 * invalid state is exposed to the OS rather than being conveyed by a red border
 * alone.
 */

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /** Rendered inside the field, before the input. */
  icon?: React.ReactNode;
  /** Rendered inside the field, after the input — the password Show/Hide toggle. */
  trailing?: React.ReactNode;
  /** Prefix shown flush against the input, e.g. "+1" on a phone field. */
  prefix?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, icon, trailing, prefix, ...inputProps },
  ref,
) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? palette.error : focused ? palette.accent : palette.border;

  return (
    <YStack gap={space[2]}>
      <Text variant="eyebrow" tone="subtle">
        {label}
      </Text>

      <XStack
        alignItems="center"
        gap={space[3]}
        backgroundColor="$surfaceAlt"
        borderWidth={1}
        borderColor={borderColor}
        borderRadius={radius.md}
        paddingHorizontal={space[4]}
        minHeight={HIT_SLOP_MIN}
      >
        {icon}
        {prefix ? (
          <Text variant="mono" tone="subtle">
            {prefix}
          </Text>
        ) : null}

        <TextInput
          ref={ref}
          aria-label={label}
          accessibilityHint={error ?? hint}
          // Screen readers announce "invalid entry" instead of the member
          // discovering the red border only by looking.
          aria-invalid={Boolean(error)}
          placeholderTextColor={palette.textSubtle}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            paddingVertical: space[4],
            color: palette.text,
            fontSize: 15,
          }}
          {...inputProps}
        />

        {trailing}
      </XStack>

      {error ? (
        // `assertive` interrupts to read a validation failure the moment it
        // appears; a polite region would queue behind whatever is being read.
        <View aria-live="assertive">
          <Text variant="caption" tone="error">
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" tone="subtle">
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
});

/** The Show/Hide affordance on a password field, sized to a real tap target. */
export function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onToggle}
      role="button"
      aria-label={visible ? 'Hide password' : 'Show password'}
      hitSlop={8}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text variant="caption" color={palette.accentText}>
        {visible ? 'Hide' : 'Show'}
      </Text>
    </Pressable>
  );
}
