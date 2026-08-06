import { useState } from 'react';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { YStack } from 'tamagui';
import { AuthShell } from '~/features/auth/components/AuthShell';
import { authService } from '~/features/auth/services/auth.service';
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from '~/features/auth/validation/auth.schemas';
import { Button, Card, Text, TextField } from '~/components/ui';
import { space } from '~/theme/tokens';

/**
 * Password reset request.
 *
 * The confirmation is deliberately unconditional — "if that address is
 * registered" — and the service swallows the underlying result. Reporting
 * whether an address exists would turn this into an account-enumeration oracle
 * for anyone with a list of emails.
 */
export default function ForgotPasswordScreen() {
  const [sent, setSent] = useState(false);

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await authService.sendPasswordReset(values.email);
    setSent(true);
  });

  if (sent) {
    return (
      <AuthShell heading="Check your inbox">
        <YStack gap={space[6]}>
          <Card tone="accent">
            <Text variant="subtitle">Reset link sent</Text>
            <Text variant="small" tone="muted">
              If {getValues('email')} is registered, a reset link is on its way. It expires in one
              hour.
            </Text>
          </Card>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.replace('/(auth)/sign-in')}
          >
            Back to sign in
          </Button>

          <Button variant="ghost" fullWidth onPress={() => setSent(false)}>
            Use a different address
          </Button>
        </YStack>
      </AuthShell>
    );
  }

  return (
    <AuthShell heading="Reset your password">
      <YStack gap={space[5]}>
        <Text variant="small" tone="muted">
          Enter the email on your membership and we will send a link to set a new password.
        </Text>

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
              returnKeyType="send"
              onSubmitEditing={() => void onSubmit()}
            />
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
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>

        <Button variant="ghost" fullWidth onPress={() => router.back()}>
          Back to sign in
        </Button>
      </YStack>
    </AuthShell>
  );
}
