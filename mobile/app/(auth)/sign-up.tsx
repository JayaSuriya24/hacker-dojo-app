import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { XStack, YStack } from 'tamagui';
import { AuthShell } from '~/features/auth/components/AuthShell';
import { AuthModeSwitch } from '~/features/auth/components/AuthModeSwitch';
import { SocialSignIn } from '~/features/auth/components/SocialSignIn';
import { authService } from '~/features/auth/services/auth.service';
import {
  passwordStrength,
  signUpSchema,
  strengthHint,
  type SignUpValues,
} from '~/features/auth/validation/auth.schemas';
import { Button, PasswordToggle, Text, TextField } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { radius, space } from '~/theme/tokens';

/**
 * Create an account.
 *
 * An account only — no plan, and no card. Choosing how to pay happens later,
 * from the pricing table on the Dojo tab, where the plans can be read properly
 * rather than skimmed as three radio rows in the middle of a signup form.
 *
 * That order is also the correct one technically: a membership needs an account
 * to attach to, and this form stays free of any payment surface.
 */
export default function SignUpScreen() {
  const palette = usePalette();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  /** Set once the account exists but is waiting on an emailed confirmation. */
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    // `onTouched`, not `onBlur`. Both hold errors back until a field has been
    // left once — nobody should be told their email is invalid while they are
    // still typing it — but `onBlur` recomputes `isValid` ONLY on a blur event,
    // and the code-of-conduct checkbox is a `Pressable` that can never emit
    // one. Ticking it set the value and left `isValid` false, so a completed
    // form kept a disabled button with nothing to explain it. `onTouched`
    // re-validates on change after the first blur, which covers controls that
    // only ever change.
    mode: 'onTouched',
    defaultValues: { fullName: '', email: '', password: '', agree: false },
  });

  const password = watch('password') ?? '';
  const strength = passwordStrength(password);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { needsEmailConfirmation } = await authService.signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      });

      // Without a session there is nothing to navigate to — `(app)` is behind
      // the auth guard, so routing on would bounce straight back here and the
      // member would see no outcome at all. Say what happened instead.
      if (needsEmailConfirmation) {
        setConfirmationSentTo(values.email.trim().toLowerCase());
        return;
      }

      // Confirmed already (confirmations off): into the app. Not to checkout —
      // no plan has been chosen at this point, and sending someone to a payment
      // screen for a membership they have not picked is the wrong first move.
      // Plans live on the Dojo tab, where they can be read before being bought.
      router.replace('/(app)/(tabs)');
    } catch (error) {
      setFormError(userMessage(error));
    }
  });

  // The account exists; it just cannot sign in until the emailed link is
  // followed. Replacing the form rather than annotating it is deliberate —
  // leaving the fields on screen invites a second submission, which would only
  // return "that email already has an account".
  if (confirmationSentTo) {
    return (
      <AuthShell heading="Check your email">
        <YStack gap={space[5]} aria-live="polite" role="alert">
          <View
            style={{
              // No `okTint` in the palette, so the surface carries the panel and
              // `ok` carries the meaning — rather than inventing a colour that
              // sits outside the ramp.
              backgroundColor: palette.surfaceAlt,
              borderWidth: 1,
              borderColor: palette.ok,
              borderRadius: radius.md,
              padding: space[4],
              gap: space[2],
            }}
          >
            <Text variant="subtitle" tone="ok">
              Account created
            </Text>
            <Text variant="small" tone="subtle">
              We sent a confirmation link to {confirmationSentTo}. Open it to activate your account,
              then sign in to choose how you pay.
            </Text>
          </View>

          <Text variant="caption" tone="subtle">
            No email after a minute or two? Check your spam folder — the link expires in 24 hours.
          </Text>

          <Button variant="primary" onPress={() => router.replace('/(auth)/sign-in')}>
            Go to sign in
          </Button>
        </YStack>
      </AuthShell>
    );
  }

  return (
    <AuthShell heading="Create your membership">
      <YStack gap={space[5]}>
        <AuthModeSwitch mode="signUp" />

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
          name="fullName"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Full name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.fullName?.message}
              placeholder="Ana Reyes"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              hint="This is the name on your keycard."
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Email"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              autoCorrect={false}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <YStack gap={space[3]}>
              <TextField
                label="Create a password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                trailing={
                  <PasswordToggle
                    visible={showPassword}
                    onToggle={() => setShowPassword((current) => !current)}
                  />
                }
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                // `newPassword` prompts iOS and Android to offer a generated
                // strong password and save it to the keychain.
                autoComplete="new-password"
                textContentType="newPassword"
              />

              {/* Strength meter. Indicative — the schema is what gates submit,
                  and the hint text carries the same information as the bars for
                  anyone who cannot distinguish the colours. */}
              <YStack gap={space[2]} aria-hidden>
                <XStack gap={space[1]}>
                  {[0, 1, 2, 3].map((index) => (
                    <View
                      key={index}
                      style={{
                        flex: 1,
                        height: 3,
                        borderRadius: 2,
                        backgroundColor:
                          index < strength
                            ? strength < 3
                              ? palette.warn
                              : palette.ok
                            : palette.border,
                      }}
                    />
                  ))}
                </XStack>
                <Text variant="caption" tone="subtle">
                  {strengthHint(password)}
                </Text>
              </YStack>
            </YStack>
          )}
        />

        <Controller
          control={control}
          name="agree"
          render={({ field: { onChange, value } }) => (
            <YStack gap={space[2]}>
              <Pressable
                onPress={() => onChange(!value)}
                role="checkbox"
                aria-label="I agree to the community code of conduct and the safety rules for shop equipment"
                aria-checked={Boolean(value)}
                style={{ minHeight: 44 }}
              >
                <XStack gap={space[3]} alignItems="flex-start" paddingVertical={space[2]}>
                  <View
                    style={{
                      width: 19,
                      height: 19,
                      marginTop: 1,
                      borderRadius: radius.sm + 1,
                      borderWidth: 1,
                      borderColor: value ? palette.accent : palette.border,
                      backgroundColor: value ? palette.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {value ? (
                      <Text variant="caption" tone="onAccent">
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="small" tone="muted" flex={1}>
                    I agree to the community code of conduct and the safety rules for shop
                    equipment.
                  </Text>
                </XStack>
              </Pressable>

              {errors.agree?.message ? (
                <View aria-live="assertive">
                  <Text variant="caption" tone="error">
                    {errors.agree.message}
                  </Text>
                </View>
              ) : null}
            </YStack>
          )}
        />

        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={isSubmitting}
          disabled={!isValid || isSubmitting}
          onPress={() => void onSubmit()}
        >
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>

        <SocialSignIn onError={setFormError} />

        <YStack
          marginTop={space[5]}
          paddingTop={space[5]}
          borderTopWidth={1}
          borderTopColor="$borderColor"
          gap={space[4]}
        >
          <Text variant="caption" tone="subtle" center>
            Already have an account?
          </Text>
          <Button variant="primary" fullWidth onPress={() => router.replace('/(auth)/sign-in')}>
            Sign in instead
          </Button>
        </YStack>
      </YStack>
    </AuthShell>
  );
}
