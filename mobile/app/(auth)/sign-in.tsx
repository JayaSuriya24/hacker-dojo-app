import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { XStack, YStack } from 'tamagui';
import Svg, { Path, Rect } from 'react-native-svg';
import { AuthShell } from '~/features/auth/components/AuthShell';
import { AuthModeSwitch } from '~/features/auth/components/AuthModeSwitch';
import { SocialSignIn } from '~/features/auth/components/SocialSignIn';
import { authService } from '~/features/auth/services/auth.service';
import { signInSchema, type SignInValues } from '~/features/auth/validation/auth.schemas';
import { Button, PasswordToggle, Text, TextField } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { radius, space } from '~/theme/tokens';

function MailIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5} width={18} height={14} rx={2.5} stroke={color} strokeWidth={1.8} />
      <Path d="M3.5 7l8.5 6 8.5-6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function LockIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={10.5} width={16} height={10.5} rx={2.5} stroke={color} strokeWidth={1.8} />
      <Path
        d="M8 10.5V7a4 4 0 0 1 8 0v3.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Sign in with email and password.
 *
 * React Hook Form owns the field state; Zod owns the rules. No manual
 * validation anywhere — a hand-rolled check is how a client-side rule ends up
 * disagreeing with the server's.
 *
 * `mode: 'onBlur'` rather than `onChange`: validating while someone is still
 * typing their email shows "that doesn't look right" at the second character,
 * which reads as the form arguing with them.
 */
export default function SignInScreen() {
  const palette = usePalette();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '', remember: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authService.signInWithPassword(values.email, values.password);
      // The AuthProvider picks up the session and the entry route redirects;
      // replace rather than push so Back does not return to a signed-in
      // member's sign-in screen.
      router.replace('/(app)/(tabs)');
    } catch (error) {
      setFormError(userMessage(error));
    }
  });

  return (
    <AuthShell heading="Sign in to your account">
      <YStack gap={space[5]}>
        <AuthModeSwitch mode="signIn" />

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
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Email"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              icon={<MailIcon color={palette.textSubtle} />}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              // Lets the OS offer a saved credential from the password manager.
              textContentType="username"
              autoCorrect={false}
              returnKeyType="next"
              submitBehavior="submit"
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              icon={<LockIcon color={palette.textSubtle} />}
              trailing={
                <PasswordToggle
                  visible={showPassword}
                  onToggle={() => setShowPassword((current) => !current)}
                />
              }
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
            />
          )}
        />

        <XStack alignItems="center">
          <Controller
            control={control}
            name="remember"
            render={({ field: { onChange, value } }) => (
              <Pressable
                onPress={() => onChange(!value)}
                role="checkbox"
                aria-label="Keep me signed in"
                aria-checked={Boolean(value)}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <XStack alignItems="center" gap={space[3]}>
                  <View
                    style={{
                      width: 19,
                      height: 19,
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
                  <Text variant="small" tone="muted">
                    Keep me signed in
                  </Text>
                </XStack>
              </Pressable>
            )}
          />

          <Link href="/(auth)/forgot-password" asChild>
            <Pressable
              role="link"
              style={{ marginLeft: 'auto', minHeight: 44, justifyContent: 'center' }}
            >
              <Text variant="small" tone="subtle">
                Forgot password?
              </Text>
            </Pressable>
          </Link>
        </XStack>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={isSubmitting}
          disabled={!isValid || isSubmitting}
          onPress={() => void onSubmit()}
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <Button variant="ghost" fullWidth onPress={() => router.push('/(auth)/verify-otp')}>
          Use a one-time code instead
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
            Not a member yet?
          </Text>
          <Button variant="primary" fullWidth onPress={() => router.push('/(auth)/sign-up')}>
            Become a member
          </Button>

          {/*
            Secondary to joining, not an alternative to it: "what does it cost?"
            is the question that comes before an email address, and `GET /plans`
            is public so it can be answered without one.
          */}
          <Button variant="secondary" fullWidth onPress={() => router.push('/(auth)/plans')}>
            Choose your plan
          </Button>
        </YStack>
      </YStack>
    </AuthShell>
  );
}
