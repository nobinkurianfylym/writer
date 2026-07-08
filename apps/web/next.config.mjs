import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@fylym/ui", "@fylym/editor", "@fylym/screenplay-core"],
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Linting is centralized via `pnpm lint` (turbo + our flat eslint config);
  // Next's own build-time lint step doesn't detect FlatCompat-wrapped configs.
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.workerPublicPath = "/_next/";
    }
    return config;
  },
};

export default nextConfig;
