import type { Breadcrumb, Event, EventHint, spanToJSON } from "@sentry/nextjs";
type SpanJSON = ReturnType<typeof spanToJSON>;

// Diagnostic structure is retained; arbitrary application/user text is not.
const REMOVED = "[Removed for privacy]";
const routes = new Set([
  "",
  "privacy",
  "terms",
  "posters",
  "categories",
  "regions",
  "search",
  "login",
  "signup",
  "auth",
  "callback",
  "mypage",
  "admin",
  "institutions",
  "favorites",
  "notifications",
  "api",
  "signup-stats",
  "delete-account",
]);

export function sentrySafeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://www.posterlink.kr");
    // Source-map filenames remain useful without query strings or arbitrary paths.
    if (/^\/_next\/static\/[\w/.[\]()-]+\.(js|css)$/.test(url.pathname)) {
      return url.pathname;
    }
    return (
      "/" +
      url.pathname
        .split("/")
        .filter(Boolean)
        .map((part) => (routes.has(part) ? part : "[segment]"))
        .join("/")
    );
  } catch {
    return REMOVED;
  }
}

function safeSymbol(value?: string): string | undefined {
  return value &&
    /^[A-Za-z_$][\w.$<>\[\]-]{0,100}$/.test(value) &&
    !/^eyJ[A-Za-z0-9_-]*\./.test(value) &&
    !/[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(value)
    ? value
    : undefined;
}

export function sentryPrivateBreadcrumb(item: Breadcrumb): Breadcrumb | null {
  // Console/UI messages and arbitrary breadcrumb data can contain search/input text.
  if (
    !item.category ||
    !["navigation", "fetch", "xhr", "http"].includes(item.category)
  )
    return null;
  const data = item.data || {};
  return {
    category: item.category,
    timestamp: item.timestamp,
    type: item.category === "navigation" ? "navigation" : "http",
    data:
      item.category === "navigation"
        ? { from: sentrySafeUrl(data.from), to: sentrySafeUrl(data.to) }
        : {
            url: sentrySafeUrl(data.url),
            method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(
              data.method,
            )
              ? data.method
              : undefined,
            status_code:
              typeof data.status_code === "number"
                ? data.status_code
                : undefined,
          },
  };
}

export function sentryPrivateSpan(span: SpanJSON): SpanJSON {
  return {
    span_id: span.span_id,
    trace_id: span.trace_id,
    parent_span_id: span.parent_span_id,
    start_timestamp: span.start_timestamp,
    timestamp: span.timestamp,
    op: safeSymbol(span.op),
    status: safeSymbol(span.status),
    // Descriptions and span attributes may include SQL, URLs, search text or IDs.
    description: REMOVED,
    data: {},
  };
}

export function sentryPrivateEvent<T extends Event>(
  event: T,
  hint: EventHint,
): T {
  // SDK 10.50 creates attachment envelope items from this hint AFTER beforeSend.
  hint.attachments = [];
  const trace = event.contexts?.trace;
  return {
    event_id: event.event_id,
    type: event.type,
    timestamp: event.timestamp,
    start_timestamp: event.start_timestamp,
    level: event.level,
    platform: event.platform,
    environment: event.environment,
    release: event.release,
    dist: event.dist,
    sdk: event.sdk,
    // No user, headers, cookies, request body, query, extra, tags, logentry,
    // fingerprint, arbitrary contexts, threads, source context or local variables.
    message: event.message || event.logentry ? REMOVED : undefined,
    transaction: sentrySafeUrl(event.transaction),
    request: event.request
      ? {
          url: sentrySafeUrl(event.request.url),
          method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(
            event.request.method || "",
          )
            ? event.request.method
            : undefined,
        }
      : undefined,
    exception: event.exception
      ? {
          values: event.exception.values?.map((error) => ({
            type: safeSymbol(error.type) || "Error",
            value: REMOVED,
            mechanism: error.mechanism
              ? {
                  type: safeSymbol(error.mechanism.type) || "generic",
                  handled: error.mechanism.handled,
                }
              : undefined,
            stacktrace: error.stacktrace
              ? {
                  frames: error.stacktrace.frames?.map((frame) => ({
                    filename: sentrySafeUrl(frame.filename),
                    function: safeSymbol(frame.function),
                    lineno: frame.lineno,
                    colno: frame.colno,
                    in_app: frame.in_app,
                  })),
                }
              : undefined,
          })),
        }
      : undefined,
    contexts: trace
      ? {
          trace: {
            trace_id: trace.trace_id,
            span_id: trace.span_id,
            parent_span_id: trace.parent_span_id,
            op: safeSymbol(trace.op),
            status: safeSymbol(trace.status),
          },
        }
      : undefined,
    breadcrumbs: event.breadcrumbs
      ?.map(sentryPrivateBreadcrumb)
      .filter(Boolean),
    spans: event.spans?.map(sentryPrivateSpan),
  } as T;
}

export const sentryPrivacyOptions = {
  sendDefaultPii: false,
  enableLogs: false,
  // Both rates AND the absence of replayIntegration prevent Replay collection.
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
  beforeSend: sentryPrivateEvent,
  beforeSendTransaction: sentryPrivateEvent,
  beforeSendSpan: sentryPrivateSpan,
  beforeBreadcrumb: sentryPrivateBreadcrumb,
};
