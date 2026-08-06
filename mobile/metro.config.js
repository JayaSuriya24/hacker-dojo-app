const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro, configured for an npm-workspaces monorepo.
 *
 * Without the two settings below, Metro watches only `mobile/` and resolves
 * only `mobile/node_modules` — but npm hoists nearly every dependency to the
 * workspace root, so the bundler would report half the imports as missing.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Note: `disableHierarchicalLookup` is deliberately left at Expo's default.
// It used to be recommended for monorepos, but Expo's own resolver handles
// workspace hoisting now and forcing it on trips `expo-doctor`.

/**
 * Web-only aliases for packages that are native-only.
 *
 * `@stripe/stripe-react-native` declares no `browser` entry, so on web Metro
 * resolves its `main` into the REAL `react-native` package instead of
 * `react-native-web`. That drags in `Libraries/Core/setUpReactDevTools.js`,
 * which requires an RN internal published only as `.ios.js` / `.android.js` —
 * and the web bundle fails to resolve it.
 *
 * Mapping the package to a stub keeps `npm run web` usable for laying out
 * screens. iOS and Android are untouched and resolve the real SDK.
 */
const WEB_ALIASES = {
  '@stripe/stripe-react-native': path.resolve(projectRoot, 'src/services/stripe.web.ts'),
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName in WEB_ALIASES) {
    return {
      filePath: WEB_ALIASES[moduleName],
      type: 'sourceFile',
    };
  }

  // Fall through to whatever Expo installed, then to Metro's own resolver.
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
