import { useState } from 'react';
import { Platform, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import Svg, { Path } from 'react-native-svg';
import { XStack, YStack } from 'tamagui';
import { Button, Text } from '~/components/ui';
import { usePalette, useResolvedScheme } from '~/providers/ThemeProvider';
import { authService } from '../services/auth.service';
import { userMessage } from '~/services/api/errors';
import { space } from '~/theme/tokens';

/**
 * Third-party sign-in.
 *
 * On iOS, Apple's native button is used rather than a look-alike: App Store
 * Review guideline 4.8 requires Sign in with Apple wherever another social
 * login is offered, and Apple's Human Interface Guidelines require its own
 * button rendering — a custom one is a rejection.
 */

function GoogleMark() {
  return (
    <Svg width={16} height={16} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.6 9.2c0-.6-.05-1.2-.16-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"
      />
      <Path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
      <Path
        fill="#EA4335"
        d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"
      />
    </Svg>
  );
}

export function SocialSignIn({ onError }: { onError: (message: string) => void }) {
  const palette = usePalette();
  const scheme = useResolvedScheme();
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);

  const run = async (provider: 'google' | 'apple') => {
    setBusy(provider);
    try {
      if (provider === 'google') await authService.signInWithGoogle();
      else await authService.signInWithApple();
    } catch (error) {
      onError(userMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <YStack gap={space[4]}>
      <XStack alignItems="center" gap={space[4]} accessibilityElementsHidden>
        <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
        <Text variant="eyebrow" tone="subtle">
          or continue with
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
      </XStack>

      {Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          // Apple requires the button to contrast with its background; follow
          // the app's appearance so it does in both.
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={10}
          style={{ height: 48 }}
          onPress={() => void run('apple')}
        />
      ) : null}

      <Button
        variant="secondary"
        fullWidth
        icon={<GoogleMark />}
        loading={busy === 'google'}
        onPress={() => void run('google')}
        accessibilityLabel="Continue with Google"
      >
        Continue with Google
      </Button>
    </YStack>
  );
}
