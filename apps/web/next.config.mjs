import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@posterlink/ui", "@posterlink/types", "@posterlink/lib"],
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../.."),
    outputFileTracingIncludes: {
      "/api/admin/crawler/run": ["./.generated/crawler/**/*"],
    },
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "posterlink",
  project: "posterlink-web",
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
  errorHandler: (err) => {
    console.warn("[Sentry] Source map upload failed without blocking the build:", err.message);
  },
});
