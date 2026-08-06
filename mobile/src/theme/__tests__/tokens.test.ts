import { fontFamily, motion, radius, shadows, shadowStyle, space } from '../tokens';
import { focusRing } from '../focus';
import { lightPalette, darkPalette } from '../tokens';
import config from '../../../tamagui.config';

/**
 * Design fidelity, asserted.
 *
 * Every case here corresponds to a rule written down in the Nocturne readme or
 * its `styles.css`. A screenshot review catches a wrong colour; it does not
 * catch a font family that silently falls back, or a token that exists and is
 * never used.
 */

describe('fonts', () => {
  /**
   * The bug this file exists for. `tamagui.config.ts` previously declared
   * `'Inter, system-ui, sans-serif'` — a CSS fallback stack, which React Native
   * hands whole to the platform font resolver. It matched nothing, so every
   * glyph rendered in San Francisco or Roboto.
   */
  it('uses loaded font names, never a CSS fallback stack', () => {
    for (const family of Object.values(fontFamily)) {
      expect(family).not.toContain(',');
      expect(family).not.toContain('sans-serif');
      expect(family).not.toContain('system-ui');
    }
  });

  it('names the Inter and JetBrains Mono faces the loader registers', () => {
    expect(fontFamily.regular).toBe('Inter_400Regular');
    expect(fontFamily.medium).toBe('Inter_500Medium');
    expect(fontFamily.mono).toBe('JetBrainsMono_500Medium');
  });

  it('maps every weight the type scale uses to its own face', () => {
    const body = config.fonts.body;

    // Without a per-weight face, a 500 is synthesised from the 400 file, which
    // on Android is a smeared faux-medium rather than Inter Medium.
    expect(body.face?.['400']).toBeDefined();
    expect(body.face?.['500']).toBeDefined();
    expect(body.face?.['600']).toBeDefined();
    expect(body.face?.['700']).toBeDefined();
  });
});

describe('motion', () => {
  it('carries Nocturne’s own curve', () => {
    // cubic-bezier(.32,.72,0,1) — the sheet curve from the design file.
    expect(motion.curve).toEqual([0.32, 0.72, 0, 1]);
  });

  it('keeps every duration short enough not to block a tap', () => {
    expect(motion.fast).toBeLessThanOrEqual(200);
    expect(motion.base).toBeLessThanOrEqual(250);
    expect(motion.slow).toBeLessThanOrEqual(300);
  });
});

describe('elevation', () => {
  /**
   * "On a dark ground elevation is an edge plus ambient darkness." The dark
   * ground needs materially more of it than the light one, and a set that
   * ignores that reads as flat on one appearance.
   */
  it('gives the dark ground deeper ambience than the light one', () => {
    const lightAlpha = Number(shadows.light.lg.color.match(/,([\d.]+)\)$/)?.[1]);
    const darkAlpha = Number(shadows.dark.lg.color.match(/,([\d.]+)\)$/)?.[1]);

    expect(darkAlpha).toBeGreaterThan(lightAlpha);
  });

  it('sets Android elevation alongside the iOS properties', () => {
    const style = shadowStyle('dark', 'md');

    // A component styled for one platform and flat on the other is the usual
    // way this goes wrong.
    expect(style.elevation).toBeGreaterThan(0);
    expect(style.shadowRadius).toBeGreaterThan(0);
    expect(style.shadowOpacity).toBe(1);
  });

  it('exposes the shadow tokens through the theme, so components can reach them', () => {
    expect(config.themes.light.shadowColorRaised).toBeDefined();
    expect(config.themes.dark.shadowColorFloating).toBeDefined();
  });
});

describe('radii', () => {
  it('carries the tag radius from `.tag`, not a pill', () => {
    // Nocturne: `border-radius: calc(var(--radius-md) * 0.75)`.
    expect(radius.tag).toBe(Math.round(radius.md * 0.75));
  });

  it('keeps the base scale the design specifies', () => {
    expect(radius.sm).toBe(4);
    expect(radius.md).toBe(8);
    expect(radius.lg).toBe(14);
  });
});

describe('spacing', () => {
  it('rounds the 0.70× density scale to whole pixels', () => {
    // Fractional pixels seam between adjacent surfaces at some scale factors,
    // so they are rounded once here rather than per renderer.
    for (const value of Object.values(space)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('focus', () => {
  it('is the 2px accent outline the system mandates', () => {
    const ring = focusRing(lightPalette);

    expect(ring).toMatchObject({
      outlineColor: lightPalette.accent,
      outlineWidth: 2,
      outlineOffset: 2,
      outlineStyle: 'solid',
    });
  });
});

describe('palettes', () => {
  it('defines every semantic role in both appearances', () => {
    // A key present in one and missing in the other renders as `undefined`,
    // which is transparent rather than an obvious failure.
    expect(Object.keys(lightPalette).sort()).toEqual(Object.keys(darkPalette).sort());
  });

  it('never resolves a role to an empty value', () => {
    for (const palette of [lightPalette, darkPalette]) {
      for (const value of Object.values(palette)) {
        expect(value).toBeTruthy();
      }
    }
  });
});
