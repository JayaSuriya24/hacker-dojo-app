/**
 * The design-system barrel.
 *
 * Screens import from `~/components/ui`, never from a component's file
 * directly, so a primitive can be split or renamed without a repo-wide edit.
 */
export { Text, type TextProps } from './Text';
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Card, type CardProps } from './Card';
export { Chip, type ChipProps } from './Chip';
export { TextField, PasswordToggle, type TextFieldProps } from './TextField';
export { Avatar, type AvatarProps } from './Avatar';
export { Segmented, type SegmentedProps, type SegmentedOption } from './Segmented';
export { Toggle, type ToggleProps } from './Toggle';
export { ProgressRing, type ProgressRingProps } from './ProgressRing';
export {
  Skeleton,
  ListSkeleton,
  LoadingState,
  EmptyState,
  ErrorState,
  type EmptyStateProps,
} from './States';
export { Screen, ScreenHeader, Section } from './Screen';
export { StatusPill } from './StatusPill';
