import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@posterlink/ui", "@posterlink/types", "@posterlink/lib"],
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
