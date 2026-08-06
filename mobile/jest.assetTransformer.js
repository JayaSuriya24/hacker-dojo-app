/**
 * Binary assets under Jest.
 *
 * Font files and images are imported by real modules (`useAppFonts` imports six
 * TTFs), and Jest would otherwise hand a font's bytes to the JavaScript parser.
 * Each one becomes a stable stub — enough for a component to reference it,
 * nothing more.
 */
module.exports = {
  process(_source, filename) {
    return { code: `module.exports = ${JSON.stringify(filename)};` };
  },
  getCacheKey() {
    return 'asset-stub-v1';
  },
};
