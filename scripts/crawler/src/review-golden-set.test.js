import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  BASELINE_FILE,
  GOLDEN_FILE,
  compareWithBaseline,
  formatComparisonTable,
  kstDate,
  kstMinute,
  measure,
  pickFields,
  pickReplayInput,
  redactText,
  replayRow,
} from "./review-golden-set.js";

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

test("redaction removes phone numbers and e-mail addresses", () => {
  assert.equal(redactText("문의 02-592-3721 / 010-2648-3720, a.b@x.go.kr"), "문의 [phone] / [phone], [email]");
  assert.equal(redactText("대표 1588-1234"), "대표 [phone]");
  assert.equal(redactText("신청기간 2026-11-05 ~ 2026-11-20 14:00"), "신청기간 2026-11-05 ~ 2026-11-20 14:00");
});

test("pickReplayInput keeps structuring inputs only, without the contact fact", () => {
  const input = pickReplayInput({
    summary_long: "신청기간 2026-11-05 ~ 2026-11-20\n문의 010-1234-5678",
    field_verification: {
      confidence: 0.8,
      reason: "model reasoning",
      sourceReview20261112: { note: "reviewer note" },
      organization: { organizerName: "A", reason: "x" },
      readableNotice: { facts: { period: "2026-11-05 ~ 2026-11-20", contact: "010-1234-5678" } },
    },
  });
  assert.equal(input.summary_long, "신청기간 2026-11-05 ~ 2026-11-20\n문의 [phone]");
  assert.deepEqual(input.field_verification.organization, { organizerName: "A" });
  assert.equal("contact" in input.field_verification.readableNotice.facts, false);
  assert.equal("reason" in input.field_verification, false);
  assert.equal("sourceReview20261112" in input.field_verification, false);
});

test("the committed fixture carries replay inputs and no contact details", () => {
  const text = fs.readFileSync(GOLDEN_FILE, "utf8");
  const golden = JSON.parse(text);
  assert.ok(golden.rows.every((r) => r.input && "field_verification" in r.input));
  assert.equal(/\b01[016789]-\d{3,4}-\d{4}\b/.test(text), false);
  assert.equal(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text), false);
});

test("replay re-extracts dates with the current code", () => {
  const row = {
    crawler: { title: "모집", organizer_name: "기관", application_end_at: "2026-11-20T00:00:00+00:00", event_start_at: null, event_end_at: null, deadline_type: "fixed", link_urls: [], category_ids: [], audience_ids: [] },
    input: { summary_long: "신청기간 2026-11-05 ~ 2026-11-20", field_verification: {} },
  };
  const replayed = replayRow(row);
  // A day-only deadline closes at the end of the Seoul day.
  assert.equal(kstMinute(replayed.application_end_at), "2026-11-20T23:59");
  assert.equal(kstDate(replayed.application_start_at), "2026-11-05");
  assert.equal(replayed.organizer_name, "기관");
});

test("replay measurement is deterministic", () => {
  const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, "utf8"));
  assert.deepEqual(measure(golden), measure(golden));
  assert.equal(measure(golden).fields.find((f) => f.field === "organizer_name").source, "replay");
  assert.equal(measure(golden, { replay: false }).mode, "stored");
});

const report = (counts) => ({
  rows: 10,
  fields: Object.entries(counts).map(([field, correct]) => ({ field, source: "replay", correct, total: 10, accuracy: correct * 10 })),
});
const baseline = { rows: 10, fields: { a: { correct: 8, total: 10, accuracy: 80 }, b: { correct: 5, total: 10, accuracy: 50 } } };

test("check fails only on drops beyond the tolerance", () => {
  assert.equal(compareWithBaseline(report({ a: 8, b: 5 }), baseline).ok, true);
  const within = compareWithBaseline(report({ a: 7, b: 5 }), baseline);
  assert.equal(within.ok, true);
  assert.equal(within.fields[0].status, "within tolerance");
  const dropped = compareWithBaseline(report({ a: 6, b: 5 }), baseline);
  assert.equal(dropped.ok, false);
  assert.deepEqual(dropped.regressed.map((f) => f.field), ["a"]);
  assert.match(formatComparisonTable(dropped), /\| a \| replay \| 80% \(8\) \| 60% \(6\/10\) \| -2 \| ❌ regressed \|/);
  assert.equal(compareWithBaseline(report({ a: 6, b: 5 }), baseline, { tolerance: 2 }).ok, true);
});

test("improvements pass and are reported; a changed row count fails", () => {
  const better = compareWithBaseline(report({ a: 10, b: 9 }), baseline);
  assert.equal(better.ok, true);
  assert.deepEqual(better.improved.map((f) => f.field), ["a", "b"]);
  const resized = compareWithBaseline({ ...report({ a: 8, b: 5 }), rows: 11 }, baseline);
  assert.equal(resized.ok, false);
  const missing = compareWithBaseline(report({ a: 8 }), baseline);
  assert.equal(missing.ok, false);
});

test("the committed baseline matches the current code", () => {
  const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, "utf8"));
  const committed = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  assert.equal(compareWithBaseline(measure(golden), committed).ok, true);
});
