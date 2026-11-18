import assert from "node:assert/strict";
import test from "node:test";

import { scorePosterDuplicate } from "./poster-duplicate-detector.js";

// 2026-11-19: linked notice URLs are evidence, not identity; a shared image
// with an unrelated title is not the same notice.
test("a notice whose source is only a linked URL of another poster is not auto-merged", () => {
  const existing = {
    id: "a",
    title: "강북구청<12월 정보화교육 [솔샘] 생활밀착! 스마트폰 200% 활용>모집",
    source_key: "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75935",
    poster_links: [{ link_type: "official_notice", url: "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75934" }],
  };
  const candidate = {
    title: "강북구청<12월 정보화교육 [솔샘] 파워포인트 활용(2021)>모집",
    source_key: "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75934",
  };
  const result = scorePosterDuplicate(candidate, existing);
  assert.notEqual(result.decision, "merge");
  assert.ok(result.matched.includes("linked-notice-url"));
});

test("the same own source URL still merges", () => {
  const url = "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75935";
  const result = scorePosterDuplicate({ title: "A 공고", source_key: url }, { id: "a", title: "전혀 다른 제목", source_key: url });
  assert.equal(result.decision, "merge");
  assert.equal(result.reason, "same-source-url");
});

test("an identical image with an unrelated title does not merge", () => {
  const image = "https://example.kr/upload/series-template.png";
  const result = scorePosterDuplicate(
    { title: "청년 재무상담 참여자 모집", images: [image] },
    { id: "a", title: "가을 등산 프로그램 안내", images: [image] },
  );
  assert.notEqual(result.decision, "merge");
});

test("an identical image with a similar title still merges", () => {
  const image = "https://example.kr/upload/poster-1.png";
  const result = scorePosterDuplicate(
    { title: "서울청년센터 강동 <12월 티톡> 참여자 추가모집", images: [image] },
    { id: "a", title: "서울청년센터 강동 <12월 티톡> 참여자 모집", images: [image] },
  );
  assert.equal(result.decision, "merge");
});
