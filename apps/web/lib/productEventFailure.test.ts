import assert from "node:assert/strict";
import test from "node:test";

import { createFailureGate, describeEventFailure } from "./productEventFailure";

test("a PostgREST error keeps its code and a short message only", () => {
  assert.deepEqual(
    describeEventFailure("favorite_add", {
      code: "22023",
      message: "unsupported event",
      details: "visitor 1234-secret",
      hint: null,
    }),
    { event: "favorite_add", code: "22023", message: "unsupported event" },
  );
});

test("network failures and odd values still describe themselves", () => {
  assert.equal(
    describeEventFailure("share_click", new TypeError("Failed to fetch")).code,
    "TypeError",
  );
  assert.equal(
    describeEventFailure("share_click", { status: 401 }).code,
    "http_401",
  );
  assert.equal(describeEventFailure("share_click", undefined).code, "unknown");
  assert.equal(
    describeEventFailure("share_click", { message: "x".repeat(500) }).message
      .length,
    160,
  );
});

test("each event and code is reported once per page load", () => {
  const gate = createFailureGate();
  const failure = { event: "favorite_add", code: "42501", message: "" };
  assert.equal(gate(failure), true);
  assert.equal(gate(failure), false);
  assert.equal(gate({ ...failure, code: "22023" }), true);
  assert.equal(gate({ ...failure, event: "share_click" }), true);
});
