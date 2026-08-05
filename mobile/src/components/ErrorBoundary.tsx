import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { logger } from '~/services/logger';
import { lightPalette, radius, space } from '~/theme/tokens';

/**
 * The global error boundary.
 *
 * A render error anywhere below this unmounts the tree and leaves a white
 * screen. This catches it, reports it, and offers a way out.
 *
 * The fallback is built on plain React Native primitives and literal token
 * values rather than the design system, on purpose: if the failure was in the
 * theme provider or a styled component, rendering the fallback through that
 * same machinery would throw again inside the boundary. A fallback must not
 * depend on anything that could have caused the error it is catching.
 */

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.exception(error, {
      scope: 'ErrorBoundary',
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleReset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: lightPalette.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: space[8],
          gap: space[6],
        }}
      >
        <View accessible accessibilityRole="alert" style={{ alignItems: 'center', gap: space[3] }}>
          <Text style={{ fontSize: 20, fontWeight: '500', color: lightPalette.text }}>
            Something broke
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: lightPalette.textMuted,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            The app hit an unexpected error. Reloading this screen usually fixes it.
          </Text>

          {/* The raw message is a development aid. In a release build it would
              only ever confuse the member, and can carry internal detail. */}
          {__DEV__ ? (
            <Text style={{ fontSize: 12, color: lightPalette.error, textAlign: 'center' }}>
              {error.message}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={this.handleReset}
          accessibilityRole="button"
          accessibilityLabel="Reload this screen"
          style={{
            minHeight: 48,
            paddingHorizontal: space[7],
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: lightPalette.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: lightPalette.accentText, fontSize: 14 }}>Reload this screen</Text>
        </Pressable>
      </View>
    );
  }
}
