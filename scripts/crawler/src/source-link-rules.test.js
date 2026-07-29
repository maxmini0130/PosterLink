import assert from "node:assert/strict";
import test from "node:test";

import {
  inferPosterLinkType,
  isLikelyApplicationLink,
  resolveCanonicalSource,
} from "./source-link-rules.js";

test("application forms are recognized across common providers", () => {
  assert.equal(isLikelyApplicationLink("https://forms.gle/abc123"), true);
  assert.equal(
    isLikelyApplicationLink(
      "https://docs.google.com/forms/d/e/example/viewform",
    ),
    true,
  );
  assert.equal(
    isLikelyApplicationLink("https://form.naver.com/response/abc"),
    true,
  );
  assert.equal(
    isLikelyApplicationLink(
      "https://example.org/program/123",
      "\uC2E0\uCCAD\uD558\uAE30",
    ),
    true,
  );
});

test("notice pages are not mistaken for application forms", () => {
  assert.equal(
    isLikelyApplicationLink(
      "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?sprtInfoId=72287",
    ),
    false,
  );
  assert.equal(
    isLikelyApplicationLink("https://example.org/board/notice/123"),
    false,
  );
});

test("untyped application links are promoted without changing notice links", () => {
  assert.equal(
    inferPosterLinkType("other", "https://forms.gle/abc123", ""),
    "official_apply",
  );
  assert.equal(
    inferPosterLinkType(
      "official_notice",
      "https://docs.google.com/forms/d/e/example/viewform",
      "",
    ),
    "official_apply",
  );
  assert.equal(
    inferPosterLinkType(
      "official_notice",
      "https://example.org/board/notice/123",
      "",
    ),
    "official_notice",
  );
});

test("canonical source falls back to the notice when resolution ends at a form", () => {
  const result = resolveCanonicalSource({
    url: "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?sprtInfoId=72287",
    sourceUrl: "https://docs.google.com/forms/d/e/example/viewform",
  });

  assert.equal(
    result.sourceUrl,
    "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?sprtInfoId=72287",
  );
  assert.equal(result.replacedApplicationSource, true);
  assert.equal(result.derivedLinks[0].link_type, "official_apply");
});

test("canonical source keeps a resolved agency notice page", () => {
  const result = resolveCanonicalSource({
    url: "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?sprtInfoId=72295",
    sourceUrl: "https://www.sba.seoul.kr/support/detail?id=123",
  });

  assert.equal(
    result.sourceUrl,
    "https://www.sba.seoul.kr/support/detail?id=123",
  );
  assert.equal(result.replacedApplicationSource, false);
  assert.deepEqual(result.derivedLinks, []);
});
