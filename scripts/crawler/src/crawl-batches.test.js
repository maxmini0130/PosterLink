import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBatchSummaryPath,
  parseBatchOptions,
  parseExcludedSiteIds,
  selectCrawlBatch,
} from "./crawl-batches.js";

test("batch arguments default to a single complete crawl", () => {
  const options = parseBatchOptions([]);

  assert.deepEqual(options, { batchCount: 1, batchIndex: 0 });
  assert.deepEqual(selectCrawlBatch(["a", "b", "c"], options), ["a", "b", "c"]);
});

test("crawl targets are distributed across non-overlapping round-robin batches", () => {
  const targets = ["a", "b", "c", "d", "e", "f", "g"];
  const batches = Array.from({ length: 4 }, (_, batchIndex) =>
    selectCrawlBatch(targets, { batchCount: 4, batchIndex }),
  );

  assert.deepEqual(batches, [["a", "e"], ["b", "f"], ["c", "g"], ["d"]]);
  assert.deepEqual(batches.flat().sort(), [...targets].sort());
});

test("batch arguments support separate and inline values", () => {
  assert.deepEqual(
    parseBatchOptions(["--batch-index", "2", "--batch-count", "4"]),
    {
      batchCount: 4,
      batchIndex: 2,
    },
  );
  assert.deepEqual(parseBatchOptions(["--batch-index=1", "--batch-count=3"]), {
    batchCount: 3,
    batchIndex: 1,
  });
});

test("invalid batch arguments fail before crawling", () => {
  assert.throws(() => parseBatchOptions(["--batch-count", "0"]), /at least 1/);
  assert.throws(
    () => parseBatchOptions(["--batch-index", "4", "--batch-count", "4"]),
    /smaller than/,
  );
  assert.throws(
    () => parseBatchOptions(["--batch-count", "many"]),
    /non-negative integer/,
  );
});

test("batch result paths are unique while single crawls keep the legacy name", () => {
  const date = new Date("2026-08-04T00:00:00Z");

  assert.equal(buildBatchSummaryPath(date), "data/results/all_2026-08-04.json");
  assert.equal(
    buildBatchSummaryPath(date, { batchCount: 4, batchIndex: 2 }),
    "data/results/all_2026-08-04_batch-3-of-4.json",
  );
});

test("scheduled crawl exclusions accept comma-separated site ids", () => {
  assert.deepEqual(
    [...parseExcludedSiteIds(["--exclude-site", "kesco, slow-source"])],
    ["kesco", "slow-source"],
  );
  assert.deepEqual(
    [...parseExcludedSiteIds(["--exclude-site=kesco"])],
    ["kesco"],
  );
  assert.deepEqual([...parseExcludedSiteIds([])], []);
});
