/**
 * The EAS project id, as the RUNTIME sees it.
 *
 * The build-time half of this rule is inlined in `app.config.ts` — Expo
 * transpiles only that file when it reads the config, so it cannot import this
 * module. This half exists because the two failures are different: the build
 * guard stops a bad artefact being produced, and this one stops an artefact
 * that somehow has a bad id from asking Expo for a push token against a project
 * that does not exist.
 *
 * The id is not a secret. It ships in the bundle and appears in `updates.url`;
 * the only thing that matters about it is that it is the right one.
 */

/**
 * The id this repository shipped with.
 *
 * Treated as absent rather than as a value, which is the entire bug: it is a
 * well-formed UUID, so every `?? fallback` was satisfied by it and nothing
 * noticed. `getExpoPushTokenAsync` then failed against a non-existent project,
 * the failure was caught and reported as `denied`, and the member was told to
 * allow notifications they had already allowed.
 */
export const PLACEHOLDER_EAS_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether this value can actually identify an EAS project.
 *
 * Deliberately NOT just a truthiness check — the placeholder is truthy, and
 * that is exactly how it reached production.
 */
export function isUsableEasProjectId(value: string | undefined): value is string {
  const raw = value?.trim();
  return Boolean(raw) && raw !== PLACEHOLDER_EAS_PROJECT_ID && UUID_PATTERN.test(raw as string);
}
