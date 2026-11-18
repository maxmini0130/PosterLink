import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { GOLDEN_FILE, kstDate, kstMinute, measure, pickFields } from "./review-golden-set.js";

test("Seoul calendar day and minute", () => {
  assert.equal(kstDate("2026-11-20T14:59:59+00:00"), "2026-11-20");
  assert.equal(kstDate("2026-11-20T00:00:00+00:00"), "2026-11-20");
  assert.equal(kstDate("2026-11-19T15:00:00+00:00"), "2026-11-20");
  assert.equal(kstMinute("2026-11-20T14:59:59+00:00"), "2026-11-20T23:59");
  assert.equal(kstDate(null), null);
});

test("pickFields keeps only comparable fields, sorted", () => {
  const fields = pickFields({
    title: " a  b ",
    poster_links: [{ url: "https://b" }, { url: "https://a" }],
    poster_categories: [{ category_id: "2" }, { category_id: "1" }],
    contact_info: "02-000-0000",
  });
  assert.equal(fields.title, "a b");
  assert.deepEqual(fields.link_urls, ["https://a", "https://b"]);
  assert.deepEqual(fields.category_ids, ["1", "2"]);
  assert.equal("contact_info" in fields, false);
});

test("the committed golden set loads and measures every field", () => {
  const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, "utf8"));
  assert.ok(golden.count >= 200, `golden rows ${golden.count}`);
  assert.equal(golden.rows.length, golden.count);
  const report = measure(golden);
  for (const field of report.fields) {
    assert.ok(field.total > 0, field.field);
    assert.ok(field.accuracy >= 0 && field.accuracy <= 100, field.field);
  }
});
