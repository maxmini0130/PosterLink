import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the mocked E2E server separate from the user's local preview build.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  transpilePackages: ["@posterlink/ui", "@posterlink/types", "@posterlink/lib"],
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../.."),
    outputFileTracingIncludes: {
      "/api/admin/crawler/run": ["./.generated/crawler/**/*"],
      // The default poster image reads its font from disk at runtime.
      "/posters/[id]/poster-image": ["./public/fonts/NotoSerifKR-Bold.woff"],
    },
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    deviceSizes: [360, 540, 720],
    imageSizes: [360],
    formats: ["image/avif", "image/webp"],
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
    console.warn(
      "[Sentry] Source map upload failed without blocking the build:",
      err.message,
    );
  },
});
