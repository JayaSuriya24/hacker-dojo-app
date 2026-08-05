import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { XStack, YStack } from 'tamagui';
import { AuthShell } from '~/features/auth/components/AuthShell';
import { authService } from '~/features/auth/services/auth.service';
import {
  otpRequestSchema,
  otpVerifySchema,
  type OtpRequestValues,
  type OtpVerifyValues,
} from '~/features/auth/validation/auth.schemas';
import { Button, Segmented, Text, TextField } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { radius, space } from '~/theme/tokens';

type Step = 'request' | 'verify';

/**
 * Passwordless sign-in.
 *
 * Two steps in one screen because they are one task: ask for a code, then enter
 * it. Splitting them across routes would put a back-stack entry between a
 * member and the code they are holding in their notification shade.
 */
export default function VerifyOtpScreen() {
  const palette = usePalette();
  const [step, setStep] = useState<Step>('request');
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [target, setTarget] = useState<{ email?: string; phone?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestForm = useForm<OtpRequestValues>({
    resolver: zodResolver(otpRequestSchema),
    mode: 'onBlur',
    defaultValues: { channel: 'email', email: '', phone: '' },
  });

  const verifyForm = useForm<OtpVerifyValues>({
    resolver: zodResolver(otpVerifySchema),
    mode: 'onChange',
    defaultValues: { token: '' },
  });

  const sendCode = requestForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (values.channel === 'phone') {
        const digits = (values.phone ?? '').replace(/\D/g, '');
        await authService.sendPhoneOtp(`+1${digits}`);
        setTarget({ phone: `+1${digits}` });
        setNotice('Code texted to your mobile.');
      } else {
        await authService.sendEmailOtp(values.email ?? '');
        setTarget({ email: values.email ?? '' });
        setNotice('Code sent — check your email.');
      }
      setStep('verify');
    } catch (error) {
      setFormError(userMessage(error));
    }
  });

  const verifyCode = verifyForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authService.verifyOtp({ ...target, token: values.token });
      router.replace('/(app)/(tabs)');
    } catch (error) {
      setFormError(userMessage(error));
    }
  });

  const resend = async () => {
    setFormError(null);
    verifyForm.reset({ token: '' });
    try {
      if (target.phone) await authService.sendPhoneOtp(target.phone);
      else if (target.email) await authService.sendEmailOtp(target.email);
      setNotice('New code sent.');
    } catch (error) {
      setFormError(userMessage(error));
    }
  };

  const banner = formError ? (
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
  ) : notice ? (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: palette.accentTint,
        borderWidth: 1,
        borderColor: palette.accentBorder,
        borderRadius: radius.md,
        padding: space[4],
      }}
    >
      <Text variant="small" tone="accent">
        {notice}
      </Text>
    </View>
  ) : null;

  if (step === 'verify') {
    const sentTo = target.phone ?? target.email ?? '';

    return (
      <AuthShell heading="Enter your code">
        <YStack gap={space[5]}>
          {banner}

          <Controller
            control={verifyForm.control}
            name="token"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Six-digit code"
                value={value}
                // Strip anything that is not a digit as it is typed, so a
                // pasted "123 456" still works.
                onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 6))}
                onBlur={onBlur}
                error={verifyForm.formState.errors.token?.message}
                placeholder="000000"
                keyboardType="number-pad"
                // Offers the code straight from the SMS or email on both platforms.
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                hint={`Sent to ${sentTo}`}
              />
            )}
          />

          <Button
            variant="solid"
            size="lg"
            fullWidth
            loading={verifyForm.formState.isSubmitting}
            disabled={!verifyForm.formState.isValid || verifyForm.formState.isSubmitting}
            onPress={() => void verifyCode()}
          >
            {verifyForm.formState.isSubmitting ? 'Verifying…' : 'Verify and sign in'}
          </Button>

          <XStack gap={space[3]}>
            <Button variant="ghost" onPress={() => void resend()}>
              Resend code
            </Button>
            <Button
              variant="ghost"
              onPress={() => {
                setStep('request');
                setNotice(null);
                setFormError(null);
              }}
            >
              Change address
            </Button>
          </XStack>
        </YStack>
      </AuthShell>
    );
  }

  return (
    <AuthShell heading="Sign in with a one-time code">
      <YStack gap={space[5]}>
        {banner}

        <Segmented
          accessibilityLabel="Where to send the code"
          options={[
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Mobile' },
          ]}
          value={channel}
          onChange={(next) => {
            setChannel(next);
            requestForm.setValue('channel', next);
            requestForm.clearErrors();
          }}
        />

        {channel === 'email' ? (
          <Controller
            control={requestForm.control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Email"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={requestForm.formState.errors.email?.message}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                autoCorrect={false}
              />
            )}
          />
        ) : (
          <Controller
            control={requestForm.control}
            name="phone"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Registered mobile"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={requestForm.formState.errors.phone?.message}
                prefix="+1"
                placeholder="(650) 555-0142"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                hint="Must match the number on your membership record."
              />
            )}
          />
        )}

        <Button
          variant="solid"
          size="lg"
          fullWidth
          loading={requestForm.formState.isSubmitting}
          disabled={requestForm.formState.isSubmitting}
          onPress={() => void sendCode()}
        >
          {requestForm.formState.isSubmitting
            ? 'Sending code…'
            : channel === 'phone'
              ? 'Text me a code'
              : 'Email me a code'}
        </Button>

        <Button variant="ghost" fullWidth onPress={() => router.back()}>
          Use my password instead
        </Button>
      </YStack>
    </AuthShell>
  );
}
