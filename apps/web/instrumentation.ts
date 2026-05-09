import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const rawDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    const dsn = rawDsn?.startsWith("https://") ? rawDsn : undefined;
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      enabled: process.env.NODE_ENV === "production" && !!dsn,
      tracesSampleRate: 0.2,
    });
  }
}
