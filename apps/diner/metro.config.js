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

module.exports = config;
