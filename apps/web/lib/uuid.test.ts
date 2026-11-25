import assert from "node:assert/strict";
import test from "node:test";

import { isUuid } from "./uuid";

test("accepts poster ids", () => {
  assert.equal(isUuid("215aa705-423b-42c3-9bd0-b3ca7f9bc8b5"), true);
  assert.equal(isUuid("215AA705-423B-42C3-9BD0-B3CA7F9BC8B5"), true);
});

test("rejects values that make Postgres fail with 22P02", () => {
  for (const value of ["null", "undefined", "", "215aa705", "215aa705-423b-42c3-9bd0-b3ca7f9bc8b5x", null, undefined, 1]) {
    assert.equal(isUuid(value), false, String(value));
  }
});
