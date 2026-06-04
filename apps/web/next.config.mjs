import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig = {
  turbopack: {
    root: repoRoot
  },
  transpilePackages: ["@tools/core", "@tools/analytics", "@tools/protocols"]
};

export default nextConfig;
