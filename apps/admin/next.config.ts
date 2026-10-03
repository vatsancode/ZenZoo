import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allows Next.js to transpile the workspace's own TS-source packages
  // (no separate build step for them - see each package's own notes).
  transpilePackages: ["@zenzoo/ui-web", "@zenzoo/design-tokens", "@zenzoo/types"],
};

export default nextConfig;
