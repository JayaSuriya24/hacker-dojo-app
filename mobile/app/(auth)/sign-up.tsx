import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { XStack, YStack } from 'tamagui';
import { AuthShell } from '~/features/auth/components/AuthShell';
import { SocialSignIn } from '~/features/auth/components/SocialSignIn';
import { authService } from '~/features/auth/services/auth.service';
import {
  passwordStrength,
  signUpSchema,
  strengthHint,
  type SignUpValues,
} from '~/features/auth/validation/auth.schemas';
import { usePlans } from '~/features/profile/hooks/useProfile';
import { Button, PasswordToggle, Text, TextField } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { formatCurrency } from '~/utils/format';
import { radius, space } from '~/theme/tokens';

/**
 * Create an account.
 *
 * The plan chosen here is recorded as an intent, not a purchase — no card is
 * taken on this screen. Payment happens after the account exists, through
 * Stripe's own sheet, which is both the correct order (an account to attach the
 * membership to) and what keeps this form free of any payment surface.
 */
export default function SignUpScreen() {
  const palette = usePalette();
  const { data: plans } = usePlans();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const selectablePlans = (plans ?? []).filter((plan) => !plan.isAddon);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    mode: 'onBlur',
    defaultValues: { fullName: '', email: '', password: '', planId: 'standard', agree: false },
  });

  const password = watch('password') ?? '';
  const strength = passwordStrength(password);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authService.signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      });
      // Straight to checkout with the chosen plan. Supabase may still require
      // email confirmation; the checkout screen handles that state.
      router.replace({
        pathname: '/(app)/checkout',
        params: { planId: values.planId, period: 'month' },
      });
    } catch (error) {
      setFormError(userMessage(error));
    }
  });

  return (
    <AuthShell heading="Create your membership">
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
          name="planId"
          render={({ field: { onChange, value } }) => (
            <YStack gap={space[3]}>
              <Text variant="eyebrow" tone="subtle">
                Choose a plan
              </Text>

              <YStack gap={space[2]} role="radiogroup">
                {selectablePlans.map((plan) => {
                  const selected = plan.id === value;

                  return (
                    <Pressable
                      key={plan.id}
                      onPress={() => onChange(plan.id)}
                      role="radio"
                      aria-label={`${plan.name}, ${formatCurrency(plan.priceMonthlyCents)} per month`}
                      accessibilityHint={plan.description}
                      aria-selected={selected}
                      style={{
                        minHeight: 56,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space[4],
                        paddingHorizontal: space[4],
                        paddingVertical: space[3],
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: selected ? palette.accent : palette.border,
                        backgroundColor: selected ? palette.accentTint : palette.surfaceAlt,
                      }}
                    >
                      <View
                        style={{
                          width: 19,
                          height: 19,
                          borderRadius: radius.pill,
                          borderWidth: 1,
                          borderColor: selected ? palette.accent : palette.border,
                          backgroundColor: selected ? palette.accent : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {selected ? (
                          <Text variant="caption" tone="onAccent">
                            ✓
                          </Text>
                        ) : null}
                      </View>

                      <YStack flex={1} gap={space[1]}>
                        <Text variant="body">{plan.name}</Text>
                        <Text variant="caption" tone="subtle">
                          {plan.description}
                        </Text>
                      </YStack>

                      <Text variant="mono" tone="accent">
                        {formatCurrency(plan.priceMonthlyCents)}/mo
                      </Text>
                    </Pressable>
                  );
                })}
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
