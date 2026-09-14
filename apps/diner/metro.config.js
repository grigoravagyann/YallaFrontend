// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// The shared packages live outside this app's folder and ship raw TypeScript, so
// Metro has to watch the whole workspace or an edit to @yalla/format will not
// trigger a reload.
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// With a hoisted layout there is exactly one copy of react and react-native at
// the workspace root; letting Metro walk upward from a package would risk a
// second copy and the "Invalid hook call" that comes with it.
config.resolver.disableHierarchicalLookup = true;

// Watching the whole workspace includes the console's Vite cache. Vite creates and
// deletes `node_modules/.vite/deps_temp_*` while it pre-bundles, and without
// watchman Metro's fallback watcher crashes on a folder that vanished between
// being found and being watched — which is what `pnpm dev:real` does to it by
// starting both at once. The blockList is also the watcher's ignore pattern.
config.resolver.blockList = [
  ...config.resolver.blockList,
  /[\\/]node_modules[\\/]\.vite(?:[\\/].*)?$/,
];

module.exports = config;
