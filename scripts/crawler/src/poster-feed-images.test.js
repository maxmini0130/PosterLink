import assert from "node:assert/strict";
import test from "node:test";
import { inspectFeedImage } from "./poster-feed-images.js";
import { auditFeedImages } from "./audit-feed-images.js";
test("collection fills dimensions and never treats failed probes as a positive poster judgment", async () => {
  const probe = async () => ({ dimensions: { width: 800, height: 1200 } });
  assert.equal(
    (await inspectFeedImage("https://example/image", { probe })).image_status,
    "ok",
  );
  assert.equal(
    (
      await inspectFeedImage("https://example/image", {
        probe,
        classification: { isPoster: false, confidence: 0.9 },
      })
    ).image_status,
    "unsuitable",
  );
  assert.equal(
    (
      await inspectFeedImage("https://example/image", {
        probe,
        classification: { isPoster: false, confidence: 0.3 },
      })
    ).image_status,
    null,
  );
  assert.equal(
    (
      await inspectFeedImage("https://example/image", {
        probe: async () => {
          throw Error("offline");
        },
      })
    ).image_status,
    null,
  );
  assert.equal(
    (await inspectFeedImage(null, { probe })).image_status,
    "missing",
  );
  assert.equal(
    (await inspectFeedImage("x", { probe, classification: { isPoster: true } }))
      .image_status,
    null,
  );
});
test("offline audit has no apply mode or database writes and keeps unknown separate", () => {
  const audit = auditFeedImages([
    { id: "1", url: "x", width: 300, height: 700 },
    { id: "2", url: "x" },
    { id: "3", url: null },
  ]);
  assert.equal(audit.mode, "dry-run");
  assert.deepEqual(audit.counts, {
    ok: 0,
    missing: 1,
    unsuitable: 1,
    broken: 0,
    uninspected: 1,
  });
});
