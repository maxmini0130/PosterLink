import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions } from "./lib/sentryPrivacy";

const rawDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryDsn = rawDsn?.startsWith("https://") ? rawDsn : undefined;

Sentry.init({
  dsn: sentryDsn,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production" && !!sentryDsn,
  tracesSampleRate: 0.2,
  ...sentryPrivacyOptions,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
