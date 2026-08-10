import { render, screen, fireEvent } from '@testing-library/react-native';
import { TamaguiProvider } from 'tamagui';
import type { ReactElement } from 'react';
import config from '../../../../tamagui.config';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { Toggle } from '../Toggle';
import { StatusPill } from '../StatusPill';

/**
 * The design system's primitives.
 *
 * These assert the two things a visual review cannot: that the accessibility
 * contract each component documents actually reaches the tree, and that the
 * variants Nocturne constrains are the ones the type allows. A component that
 * announces itself wrongly to VoiceOver looks perfect in a screenshot.
 */
function renderWithTheme(ui: ReactElement) {
  // `defaultTheme` is required: without it Tamagui has no theme to resolve
  // `$accent` and friends against, and every themed style renders undefined.
  return render(
    <TamaguiProvider config={config} defaultTheme="light">
      {ui}
    </TamaguiProvider>,
  );
}

describe('Button', () => {
  it('exposes its label as the accessible name', () => {
    renderWithTheme(<Button onPress={jest.fn()}>Take a tour</Button>);

    expect(screen.getByRole('button', { name: 'Take a tour' })).toBeTruthy();
  });

  it('prefers an explicit accessibilityLabel over the visible text', () => {
    // Icon-ish labels like "‹" are meaningless read aloud, which is why every
    // call site that uses one passes a real label.
    renderWithTheme(
      <Button onPress={jest.fn()} aria-label="Previous quote">
        ‹
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Previous quote' })).toBeTruthy();
  });

  it('announces the busy state while loading', () => {
    renderWithTheme(
      <Button onPress={jest.fn()} loading>
        Reserving
      </Button>,
    );

    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ busy: true });
  });

  it('announces disabled, and does not fire', () => {
    const onPress = jest.fn();
    renderWithTheme(
      <Button onPress={onPress} disabled>
        Confirm
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not fire while loading either', () => {
    const onPress = jest.fn();
    renderWithTheme(
      <Button onPress={onPress} loading>
        Confirm
      </Button>,
    );

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('meets the 48pt minimum tap target at every size', () => {
    const sizes = ['sm', 'md', 'lg'] as const;

    for (const size of sizes) {
      const { unmount } = renderWithTheme(
        <Button onPress={jest.fn()} size={size}>
          Tap
        </Button>,
      );

      const style = screen.getByRole('button').props.style;
      const flattened = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;

      // 48 satisfies both HIG's 44 and Material's 48, so neither platform needs
      // a special case.
      expect(flattened.minHeight).toBeGreaterThanOrEqual(48);
      unmount();
    }
  });

  it('fires when enabled', () => {
    const onPress = jest.fn();
    renderWithTheme(<Button onPress={onPress}>Go</Button>);

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Chip', () => {
  it('exposes selection to assistive tech, not just as a tint', () => {
    renderWithTheme(<Chip label="Hardware" selected onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Hardware' }).props.accessibilityState).toMatchObject(
      { selected: true },
    );
  });

  it('renders a read-only chip as text rather than a button', () => {
    renderWithTheme(<Chip label="Most popular" readOnly />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Most popular')).toBeTruthy();
  });
});

describe('Toggle', () => {
  it('announces itself as a switch with its checked state', () => {
    renderWithTheme(
      <Toggle
        label="Booking reminders"
        value
        onChange={jest.fn()}
        description="15 minutes before"
      />,
    );

    const toggle = screen.getByRole('switch', { name: 'Booking reminders' });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
  });

  it('toggles from the whole row, which is the platform list pattern', () => {
    const onChange = jest.fn();
    renderWithTheme(<Toggle label="Haptics" value={false} onChange={onChange} />);

    fireEvent.press(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('StatusPill', () => {
  /**
   * Nocturne's status colours are reinforcement, never the message. A member
   * with a colour vision deficiency still has to be able to read "At capacity".
   */
  it('always carries the status in words', () => {
    renderWithTheme(<StatusPill label="At capacity" tone="error" />);

    expect(screen.getByLabelText('At capacity')).toBeTruthy();
  });
});
