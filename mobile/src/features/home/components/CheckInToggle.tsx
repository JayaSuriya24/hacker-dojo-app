import { Button } from '~/components/ui';

/**
 * The check in / check out control on the occupancy dial.
 *
 * A session row is the only thing the dial counts, and only a member can open
 * or close their own, so the number is not "live" until there is a way to say
 * "I'm here" — which is what this is. It sits on the occupancy card rather than
 * in a card of its own because the count is the whole reason to press it.
 *
 * One button with two labels rather than a switch: both directions are a
 * request that can fail, and a switch that flips back on a network error reads
 * as a bug where a button that stays put reads as "that didn't work".
 *
 * Held back until the session query has settled — rendering against an unknown
 * state would offer "Check in" to someone already on the floor for as long as
 * the request takes.
 */
export function CheckInToggle({
  checkedIn,
  busy,
  onToggle,
}: {
  checkedIn: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      size="sm"
      // Checking in is the action being offered; once in, leaving is the quieter
      // of the two, so it steps back to the neutral outline.
      variant={checkedIn ? 'secondary' : 'primary'}
      loading={busy}
      haptic="medium"
      onPress={onToggle}
      aria-label={checkedIn ? 'Check out of the floor' : 'Check in to the floor'}
      accessibilityHint={
        checkedIn
          ? 'Removes you from the live occupancy count.'
          : 'Adds you to the live occupancy count until you check out.'
      }
    >
      {checkedIn ? 'Check out' : 'Check in'}
    </Button>
  );
}
