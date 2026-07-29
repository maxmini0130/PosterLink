import assert from "node:assert/strict";
import test from "node:test";

import { orderPosterImageCandidates } from "./poster-image-rules.js";

function candidate(imageUrl, score, width, height, passes = true) {
  return {
    imageUrl,
    rule: {
      passes,
      score,
      dimensions: width && height ? { width, height } : null,
    },
  };
}

test("full portrait poster outranks and removes a 400px listing crop", () => {
  const proxy = candidate(
    "https://youth.seoul.go.kr/atch/getImg.do?id=1",
    93,
    400,
    400,
  );
  const portrait = candidate(
    "https://example.org/full-poster.jpg",
    90,
    1000,
    1413,
  );

  assert.deepEqual(
    orderPosterImageCandidates([proxy, portrait]).map((item) => item.imageUrl),
    [portrait.imageUrl],
  );
});

test("listing summary stays first for a multi-page square carousel", () => {
  const proxy = candidate(
    "https://youth.seoul.go.kr/atch/getImg.do?id=2",
    93,
    400,
    400,
  );
  const details = [
    candidate("https://example.org/detail-1.jpg", 100, 1080, 1080),
    candidate("https://example.org/detail-2.jpg", 100, 1080, 1080),
    candidate("https://example.org/detail-3.jpg", 100, 1080, 1080),
  ];

  const ordered = orderPosterImageCandidates([proxy, ...details]);
  assert.equal(ordered[0].imageUrl, proxy.imageUrl);
  assert.deepEqual(
    new Set(ordered.map((item) => item.imageUrl)),
    new Set([proxy, ...details].map((item) => item.imageUrl)),
  );
});

test("listing poster stays selected when the only original is an extreme composite", () => {
  const proxy = candidate(
    "https://youth.seoul.go.kr/atch/getImg.do?id=3",
    93,
    400,
    400,
  );
  const composite = candidate(
    "https://example.org/long-composite.jpg",
    63,
    1080,
    10800,
  );

  const ordered = orderPosterImageCandidates([proxy, composite]);
  assert.equal(ordered[0].imageUrl, proxy.imageUrl);
});
