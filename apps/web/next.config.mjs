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
  disableLogger: true,
  automaticVercelMonitors: false,
  errorHandler: (err) => {
    console.warn("[Sentry] 소스맵 업로드 실패 (빌드에 영향 없음):", err.message);
  },
});
