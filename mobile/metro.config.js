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

module.exports = config;
