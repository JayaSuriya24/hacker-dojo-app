/**
 * Babel configuration.
 *
 * Order matters: `react-native-worklets/plugin` (the Reanimated 4 worklet
 * transform) must be last, because it needs to see the output of every other
 * plugin to decide what to hoist onto the UI thread.
 */
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Tamagui's compiler: evaluates style props that are static at build time
      // and flattens them to plain views, which is where the win on long lists
      // comes from.
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './tamagui.config.ts',
          logTimings: false,
          disableExtraction: process.env['NODE_ENV'] === 'development',
        },
      ],
      'react-native-worklets/plugin',
    ],
  };
};
