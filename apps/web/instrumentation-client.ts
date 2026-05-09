import * as Sentry from "@sentry/nextjs";

const rawDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryDsn = rawDsn?.startsWith("https://") ? rawDsn : undefined;

Sentry.init({
  dsn: sentryDsn,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production" && !!sentryDsn,
  tracesSampleRate: 0.2,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.05,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
