/**
 * The suggested skill vocabulary.
 *
 * Shared rather than declared per screen, and for a specific reason: the
 * directory filters on these exact strings. A chip the onboarding prompt never
 * offers is a filter that returns nobody, and a skill someone types by hand is
 * a chip that will never match it. One list keeps the two ends agreeing.
 *
 * Suggestions, not an enum — `profiles.skills` is free text, the server
 * validates only length and count, and a member can add anything they like.
 * These are the starting points, chosen to span the things people actually come
 * to the Dojo to do rather than to be exhaustive.
 */
export const SUGGESTED_SKILLS = [
  'Rust',
  'iOS',
  'Hardware',
  'AI/ML',
  'Design',
  'VC Pitching',
  'Bio',
  'Robotics',
  'Systems',
  'Electronics',
  '3D Printing',
  'CAD',
  'Security',
  'Web',
  'Data',
  'Teaching',
] as const;

/**
 * Matches the `array_length(skills, 1) <= 8` check on the column and the
 * `.max(8)` in the API schema. Stated here so the UI can stop someone at the
 * limit rather than letting the server refuse the save.
 */
export const MAX_SKILLS = 8;
