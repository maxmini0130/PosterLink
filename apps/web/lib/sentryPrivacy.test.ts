import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import type { Event, EventHint } from "@sentry/nextjs";
import {
  sentryPrivateEvent,
  sentryPrivateSpan,
  sentryPrivacyOptions,
  sentrySafeUrl,
} from "./sentryPrivacy";

const pii = "synthetic.person@example.invalid";
const authId = "12345678-1234-4234-8234-123456789abc";
const token = "eyJhbGciOiJIUzI1NiJ9.synthetic.signature";
const search = "가상 개인정보 검색 원문";
const secret = `${pii} ${authId} ${token} ${search}`;
const url = `https://www.posterlink.kr/posters/${authId}?q=${encodeURIComponent(search)}&token=${token}#${pii}`;

function fixture(): Event {
  return {
    event_id: "11111111111111111111111111111111",
    level: "error",
    platform: "javascript",
    user: { id: authId, email: pii, ip_address: "192.0.2.1" },
    message: secret,
    logentry: { message: secret, params: [secret] },
    request: {
      url,
      method: "GET",
      headers: { Authorization: token },
      cookies: { session: secret },
      data: secret,
      query_string: secret,
    },
    transaction: url,
    fingerprint: [secret],
    extra: { nested: { secret } },
    tags: { secret },
    contexts: { custom: { secret } },
    server_name: pii,
    exception: {
      values: [
        {
          type: "TypeError",
          value: secret,
          mechanism: { type: "generic", handled: false, data: { secret } },
          stacktrace: {
            frames: [
              {
                filename: url,
                function: "render",
                lineno: 17,
                colno: 2,
                vars: { secret },
                pre_context: [secret],
                context_line: secret,
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      { category: "console", message: secret, data: { secret } },
      { category: "ui.click", message: secret, data: { secret } },
      { category: "navigation", data: { from: url, to: url, secret } },
      {
        category: "fetch",
        message: secret,
        data: {
          url,
          method: "POST",
          status_code: 503,
          body: secret,
          headers: { Authorization: token },
        },
      },
    ],
    spans: [
      {
        trace_id: "1".repeat(32),
        span_id: "2".repeat(16),
        start_timestamp: 1,
        timestamp: 2,
        description: secret,
        data: { secret },
        op: "http.client",
      },
    ],
  };
}

test("errors and performance events retain diagnosis structure without user text or attachments", () => {
  for (const type of [undefined, "transaction"] as const) {
    const event = { ...fixture(), type };
    const hint: EventHint = { attachments: [{ filename: pii, data: secret }] };
    const clean = sentryPrivateEvent(event, hint);
    const json = JSON.stringify(clean);
    for (const value of [
      pii,
      authId,
      token,
      search,
      encodeURIComponent(search),
      "192.0.2.1",
    ])
      assert(!json.includes(value), value);
    assert.deepEqual(hint.attachments, []);
    assert.equal(clean.exception.values[0].type, "TypeError");
    assert.equal(clean.exception.values[0].stacktrace.frames[0].lineno, 17);
    assert.equal(clean.breadcrumbs.length, 2);
    assert.equal(clean.breadcrumbs[1].data.status_code, 503);
    assert.equal(clean.spans[0].timestamp, 2);
    assert.equal(
      event.user.id,
      authId,
      "do not mutate application-owned input",
    );
  }
});

test("URLs remove query, hash, identifiers and arbitrary route text; static source filenames survive", () => {
  assert.equal(sentrySafeUrl(url), "/posters/[segment]");
  assert.equal(
    sentrySafeUrl(`/search/${encodeURIComponent(search)}?q=secret`),
    "/search/[segment]",
  );
  assert.equal(
    sentrySafeUrl(
      "https://preview.vercel.app/_next/static/chunks/app/page-abc123.js?secret=yes",
    ),
    "/_next/static/chunks/app/page-abc123.js",
  );
  assert.equal(sentrySafeUrl("http://[invalid"), "[Removed for privacy]");
});

test("Replay is absent and disabled on both runtimes; privacy hooks include spans", () => {
  assert.equal(sentryPrivacyOptions.sendDefaultPii, false);
  assert.equal(sentryPrivacyOptions.replaysOnErrorSampleRate, 0);
  assert.equal(sentryPrivacyOptions.replaysSessionSampleRate, 0);
  assert.deepEqual(sentryPrivateSpan(fixture().spans[0]).data, {});
  for (const file of [
    "apps/web/instrumentation.ts",
    "apps/web/instrumentation-client.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert(source.includes("...sentryPrivacyOptions"));
    assert(!source.includes("replayIntegration"));
  }
});

test("malformed diagnostic names cannot carry emails, Auth IDs, JWTs or free text", () => {
  for (const value of [
    pii,
    authId,
    token,
    search,
    "synthetic private search",
  ]) {
    const event = fixture();
    event.exception.values[0].type = value;
    event.exception.values[0].stacktrace.frames[0].function = value;
    event.spans[0].op = value;
    assert(!JSON.stringify(sentryPrivateEvent(event, {})).includes(value));
  }
});

test("installed SDK transport sends a scrubbed error and no attachment envelope", async () => {
  // Exercise the real installed SDK pipeline, not just the sanitizer return value.
  const requireWeb = createRequire(new URL("../package.json", import.meta.url));
  const requireSdk = createRequire(requireWeb.resolve("@sentry/nextjs"));
  const { BrowserClient, Scope } = requireSdk("@sentry/browser");
  const envelopes: unknown[] = [];
  const client = new BrowserClient({
    dsn: "https://synthetic@example.invalid/1",
    integrations: [],
    stackParser: () => [],
    transport: () => ({
      send: async (envelope: unknown) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
    ...sentryPrivacyOptions,
  });
  client.init();
  const scope = new Scope();
  scope.setClient(client);
  scope.setUser({ id: authId, email: pii, ip_address: "192.0.2.1" });
  scope.addAttachment({ filename: "synthetic.txt", data: secret });
  scope.captureEvent(fixture());
  scope.captureEvent({
    ...fixture(),
    type: "transaction",
    event_id: "3".repeat(32),
  });
  await client.flush(2000);
  assert.equal(envelopes.length, 2);
  const json = JSON.stringify(envelopes);
  for (const value of [pii, authId, token, search, '"attachment"'])
    assert(!json.includes(value), value);
  assert(json.includes("TypeError"));
  await client.close();
});
