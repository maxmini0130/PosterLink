"use client";

/** The SDK can defer a hit after gtag() returns. Recheck consent at dispatch. */
export function installAnalyticsTransportGuard(
  measurementId: string,
  canSend: () => boolean,
) {
  const blocked = (input: string | URL) => {
    try {
      const url = new URL(String(input), location.href);
      return (
        /(^|\.)google-analytics\.com$/.test(url.hostname) &&
        url.pathname === "/g/collect" &&
        url.searchParams.get("tid") === measurementId &&
        !canSend()
      );
    } catch {
      return false;
    }
  };
  const fetch = window.fetch;
  window.fetch = function (input, init) {
    if (blocked(input instanceof Request ? input.url : input)) {
      // Drop the SDK's queued hit without a rejection/retry or service error.
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return fetch.call(this, input, init);
  };
  const beacon = navigator.sendBeacon;
  if (beacon) {
    navigator.sendBeacon = function (url, data) {
      return blocked(url) ? true : beacon.call(this, url, data);
    };
  }
  const requests = new WeakMap<XMLHttpRequest, string>();
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async = true,
    username?: string | null,
    password?: string | null,
  ) {
    requests.set(this, String(url));
    return open.call(this, method, url, async, username, password);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (blocked(requests.get(this) || "")) {
      this.abort();
      return;
    }
    return send.call(this, body);
  };
}
