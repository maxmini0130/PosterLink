/**
 * A product event that did not reach record_product_event used to vanish:
 * supabase-js resolves with { error } instead of rejecting, and the caller
 * threw the result away. This decides what to report and keeps it small and
 * free of personal data (no visitor key, no poster id, no metadata).
 */

export type EventFailure = {
  event: string;
  code: string;
  message: string;
};

type ErrorLike = { code?: unknown; message?: unknown; status?: unknown };

export function describeEventFailure(
  event: string,
  error: unknown,
): EventFailure {
  const value = (error ?? {}) as ErrorLike;
  const code =
    typeof value.code === "string" && value.code
      ? value.code
      : typeof value.status === "number"
        ? `http_${value.status}`
        : error instanceof Error
          ? error.name
          : "unknown";
  const message = String(
    typeof value.message === "string" ? value.message : (error ?? ""),
  )
    .replace(/\s+/g, " ")
    .slice(0, 160);
  return { event, code, message };
}

/** Report each event/code pair once per page load, so a broken path cannot flood Sentry. */
export function createFailureGate() {
  const seen = new Set<string>();
  return (failure: EventFailure) => {
    const key = `${failure.event}:${failure.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}
