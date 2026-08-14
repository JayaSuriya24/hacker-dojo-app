import { Alert, Platform } from 'react-native';

/**
 * A yes/no confirmation that works on every target.
 *
 * `Alert.alert` is a no-op on web — react-native-web ships it as literally
 * `static alert() {}`. Any flow that gated an action behind a confirmation
 * therefore did nothing at all on web: no dialog, no `onPress`, no action, and
 * no error to explain the silence. That is how sign-out ended up unreachable.
 *
 * Returning a promise rather than taking button callbacks is what makes the two
 * platforms expressible in one shape — `window.confirm` has no notion of a
 * button list, and a caller that says `if (await confirm(...))` reads the same
 * either way.
 *
 * Deliberately limited to two outcomes. A three-way prompt cannot be expressed
 * on web without building a real dialog, so anything richer should use the
 * app's own sheet rather than being bolted on here.
 */
export async function confirm(options: {
  title: string;
  message?: string;
  /** Label for the affirmative action. Native only — web uses the browser's. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the affirmative action in red on iOS. */
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive } = options;

  if (Platform.OS === 'web') {
    // `window.confirm` is synchronous and modal, and shows the browser's own
    // labels. Not beautiful, but it is a real dialog that actually resolves —
    // which is the entire point of this module.
    const text = message ? `${title}\n\n${message}` : title;
    return typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(text)
      : // Server rendering has no window; treat that as "not confirmed" rather
        // than throwing during a static render pass.
        false;
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
