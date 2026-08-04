import assert from "node:assert/strict";
import test from "node:test";

import { buildPosterStructuredSeoData } from "./posterStructuredSeo";

const options = {
  pageUrl: "https://www.posterlink.kr/posters/poster-1",
  imageUrls: ["https://cdn.example.com/poster.jpg"],
  primaryLinkUrl: "https://example.com/notice",
};

test("unverified structured facts are excluded from SEO data", () => {
  const data = buildPosterStructuredSeoData({
    title: "청년 지원사업",
    source_org_name: "공식 수집처",
    organizer_name: "미검증 주관기관",
    verification_status: "needs_review",
    verified_at: null,
    deadline_type: "fixed",
    application_end_at: "2026-08-10T14:59:59.000Z",
    event_start_at: "2026-08-20T01:00:00.000Z",
    eligibility_summary: "미검증 신청 대상",
    event_location: "미검증 장소",
  }, options);

  const serialized = JSON.stringify(data);
  assert.equal("@graph" in data, false);
  assert.match(serialized, /공식 수집처/);
  assert.doesNotMatch(serialized, /미검증 주관기관|미검증 신청 대상|미검증 장소|2026-08-10|2026-08-20/);
});

test("verified event facts extend SEO data with an Event entity", () => {
  const data = buildPosterStructuredSeoData({
    title: "청년 지원사업",
    source_org_name: "공식 수집처",
    organizer_name: "검증된 주관기관",
    verification_status: "verified",
    verified_at: "2026-08-04T03:00:00.000Z",
    deadline_type: "fixed",
    application_start_at: "2026-08-01T00:00:00.000Z",
    application_end_at: "2026-08-10T14:59:59.000Z",
    event_start_at: "2026-08-20T01:00:00.000Z",
    event_end_at: "2026-08-20T03:00:00.000Z",
    eligibility_summary: "서울시 청년",
    event_location: "서울시청",
  }, options);

  assert.equal("@graph" in data, true);
  const serialized = JSON.stringify(data);
  assert.match(serialized, /검증된 주관기관/);
  assert.match(serialized, /"@type":"Event"/);
  assert.match(serialized, /2026-08-20T01:00:00.000Z/);
  assert.match(serialized, /서울시 청년/);
  assert.match(serialized, /서울시청/);
});
