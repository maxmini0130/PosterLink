// Test-only preload: prevent accidental operational writes from the local Next
// server, including server handlers that a browser route cannot intercept.
const originalFetch = globalThis.fetch;
const readRpcs = new Set([
  "search_public_posters",
  "count_public_posters",
  "resolve_closed_poster_alert_default",
  "get_recommended_posters_v2",
]);
globalThis.fetch = function (input, init) {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  const method = String(
    init?.method || (input instanceof Request ? input.method : "GET"),
  ).toUpperCase();
  if (
    url.hostname.endsWith(".supabase.co") &&
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (method !== "POST" || !readRpcs.has(rpc))
      throw new Error("Read-only verification blocked Supabase mutation");
  }
  return originalFetch(input, init);
};
