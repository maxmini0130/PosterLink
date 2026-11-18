import assert from "node:assert/strict";
import test from "node:test";

import { mergeScheduledCollectionSourceSites } from "./collection-source-tracker.js";

const staticSites = [{ id: "mapo-gu", name: "마포구청", boards: [{ url: "https://www.mapo.go.kr/site/main/board/notice/list" }] }];
const source = (slug, status, extra = {}) => ({
  id: `id-${slug}`,
  source_slug: slug,
  name: slug,
  status,
  collection_method: "html",
  list_url: `https://${slug}.example.kr/board/list`,
  homepage_url: `https://${slug}.example.kr`,
  config_json: { adapter: "generic-board" },
  ...extra,
});

test("scheduled crawl retries sources left in error after a failed or partial run", () => {
  const sites = mergeScheduledCollectionSourceSites(staticSites, [
    source("active-src", "active"),
    source("error-src", "error"),
  ]);
  const ids = sites.map((site) => site.id);
  assert.ok(ids.includes("mapo-gu"));
  assert.ok(ids.some((id) => id.includes("active-src")), ids.join(","));
  assert.ok(ids.some((id) => id.includes("error-src")), ids.join(","));
});

test("planned, paused, retired and manual sources are not scheduled", () => {
  const sites = mergeScheduledCollectionSourceSites(staticSites, [
    source("planned-src", "planned"),
    source("paused-src", "paused"),
    source("retired-src", "retired"),
    source("manual-src", "active", { collection_method: "manual" }),
  ]);
  assert.deepEqual(sites.map((site) => site.id), ["mapo-gu"]);
});
