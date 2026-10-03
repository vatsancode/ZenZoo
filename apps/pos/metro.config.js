const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Metro needs to see sibling workspace packages (@zenzoo/ui-native etc.),
// which live outside apps/pos under pnpm's workspace layout.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// pnpm's content-addressed store means a package can be resolved through a
// symlink Metro's default hierarchical lookup won't always follow correctly
// across the workspace boundary; disabling it and relying on the explicit
// nodeModulesPaths above is pnpm + Metro's documented monorepo setup.
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
