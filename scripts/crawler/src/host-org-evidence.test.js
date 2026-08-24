import assert from "node:assert/strict";
import test from "node:test";

import { inferHostOrgEvidence } from "./host-org-evidence.js";

test("creates high-confidence host org evidence from title prefix", () => {
  const row = inferHostOrgEvidence({
    posterId: "poster-1",
    title: "서울청년센터 성북 <8월 법률 프로그램> 참여자 모집",
    organizerName: "서울청년센터 성북",
    sourceOrgName: "청년몽땅정보통",
  });

  assert.equal(row.field_key, "host_org");
  assert.equal(row.value_text, "서울청년센터 성북");
  assert.equal(row.confidence, 0.95);
  assert.equal(row.evidence_src, "body");
});

test("creates host org evidence when organizer appears in the title body", () => {
  const row = inferHostOrgEvidence({
    posterId: "poster-1",
    title: "[서울청년센터 금천 청춘삘딩] 2026 YOUTH CHAMPIONSHIP 신청",
    organizerName: "서울청년센터 금천",
    sourceOrgName: "청년몽땅정보통",
  });

  assert.equal(row.value_text, "서울청년센터 금천");
  assert.equal(row.confidence, 0.93);
});

test("uses body evidence when the organization appears in source text", () => {
  const row = inferHostOrgEvidence({
    posterId: "poster-1",
    title: "청년 법률상담 참여자 모집",
    organizerName: "서울청년센터 동대문",
    sourceText: "주관: 서울청년센터 동대문. 신청기간은 별도 공지합니다.",
  });

  assert.equal(row.value_text, "서울청년센터 동대문");
  assert.equal(row.confidence, 0.9);
  assert.equal(row.evidence_src, "body");
});

test("keeps body evidence centered on the organization name", () => {
  const row = inferHostOrgEvidence({
    posterId: "poster-1",
    title: "창업 프로그램 참가자 모집",
    organizerName: "재단법인 관악중소벤처진흥원",
    sourceText: `${"상세 안내 ".repeat(80)} 주관기관명: 재단법인 관악중소벤처진흥원 대상: 예비창업자`,
  });

  assert.equal(row.value_text, "재단법인 관악중소벤처진흥원");
  assert.equal(row.confidence, 0.9);
  assert.match(row.evidence_text, /재단법인 관악중소벤처진흥원/);
});

test("does not create evidence from generic collection portals", () => {
  const row = inferHostOrgEvidence({
    posterId: "poster-1",
    title: "청년몽땅정보통 <프로그램> 안내",
    sourceOrgName: "청년몽땅정보통",
  });

  assert.equal(row, null);
});
