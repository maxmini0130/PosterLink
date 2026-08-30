import assert from "node:assert/strict";
import test from "node:test";

import { compareImagelessCandidates } from "./measure-imageless-candidates.js";

test("compareImagelessCandidates reports imageless candidate reduction", () => {
  const before = [
    { site: "a", images: [] },
    { site: "a", images: ["https://example.com/poster.jpg"] },
    { site: "b" },
    { site: "c", contentMode: "text_notice" },
  ];
  const after = [
    { site: "a", images: ["https://example.com/poster.jpg"] },
    { site: "b", images: ["C:\\tmp\\poster.png"], attachmentImageCandidates: [{ url: "C:\\tmp\\poster.png" }] },
    { site: "c", images: [], contentMode: "text_notice" },
  ];

  const report = compareImagelessCandidates(before, after);
  assert.equal(report.before.total, 4);
  assert.equal(report.before.imageless, 3);
  assert.equal(report.after.total, 3);
  assert.equal(report.after.imageless, 1);
  assert.equal(report.delta.imageless, -2);
  assert.equal(report.after.attachment_image_candidate, 1);
  assert.equal(report.before.imageless_by_site.a, 1);
});
