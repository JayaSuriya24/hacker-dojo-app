import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isUsableEasProjectId, PLACEHOLDER_EAS_PROJECT_ID } from '../easProject';

/**
 * The EAS project id.
 *
 * The bug these lock down: the repository shipped
 * `00000000-0000-0000-0000-000000000000`, which is a WELL-FORMED UUID. Every
 * `?? fallback` in the Expo config was satisfied by it, so a production build
 * looked configured while `getExpoPushTokenAsync` failed against a project that
 * does not exist and `updates.url` pointed at the same nothing. Both failed
 * quietly, which is why a truthiness check is not enough anywhere.
 */

describe('isUsableEasProjectId', () => {
  it('rejects the placeholder the repository shipped', () => {
    // The whole point: this is truthy and correctly shaped, and still wrong.
    expect(PLACEHOLDER_EAS_PROJECT_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(isUsableEasProjectId(PLACEHOLDER_EAS_PROJECT_ID)).toBe(false);
  });

  it('rejects an absent or blank id', () => {
    expect(isUsableEasProjectId(undefined)).toBe(false);
    expect(isUsableEasProjectId('')).toBe(false);
    expect(isUsableEasProjectId('   ')).toBe(false);
  });

  it('rejects anything that is not a UUID', () => {
    expect(isUsableEasProjectId('hackerdojo')).toBe(false);
    expect(isUsableEasProjectId('not-a-uuid-at-all')).toBe(false);
    // A near miss: right shape, one character short.
    expect(isUsableEasProjectId('11111111-2222-4333-8444-55555555555')).toBe(false);
  });

  it('accepts a real project id, in either case, with surrounding space', () => {
    expect(isUsableEasProjectId('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).toBe(true);
    expect(isUsableEasProjectId('A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D')).toBe(true);
    expect(isUsableEasProjectId('  a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d  ')).toBe(true);
  });
});

/**
 * The build-time half of the rule lives inlined in `app.config.ts`, because
 * Expo transpiles only that file when reading the config and cannot resolve a
 * relative import. That module cannot be imported here (evaluating it throws by
 * design when no id is set), so it is asserted as source instead — which is
 * enough to catch the regression that matters: a fallback creeping back in.
 */
describe('app.config.ts', () => {
  const source = readFileSync(join(__dirname, '../../../app.config.ts'), 'utf8');

  /**
   * Comments stripped before asserting on code.
   *
   * The file documents the old `?? '00000000-…'` fallback in prose so the next
   * reader knows why the guard exists — which a naive search cannot tell apart
   * from the fallback itself.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('never falls back to a placeholder id', () => {
    // A `?? '00000000-…'` on either consumer is exactly what shipped.
    expect(code).not.toMatch(/\?\?\s*['"]0{8}-/);
  });

  it('refuses to build for production without a usable id', () => {
    expect(source).toContain("VARIANT === 'production'");
    expect(source).toContain('throw new Error');
  });

  it('also refuses on any EAS build, so preview cannot ship without one either', () => {
    expect(source).toContain("process.env['EAS_BUILD'] === 'true'");
  });

  it('derives extra.eas and updates.url from ONE resolved value', () => {
    // Two independent reads of the env var is how they drift apart.
    expect(source.match(/process\.env\['EAS_PROJECT_ID'\]/g)).toHaveLength(1);
    expect(source).toContain('https://u.expo.dev/${EAS_PROJECT_ID}');
  });

  it('omits both consumers entirely when there is no project', () => {
    // Omitted, not pointed at a project that does not exist.
    expect(source).toContain('...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {})');
  });
});
