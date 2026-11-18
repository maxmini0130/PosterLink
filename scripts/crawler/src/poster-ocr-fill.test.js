import assert from "node:assert/strict";
import test from "node:test";

import {
  OCR_FIELD_CONFIDENCE_CAP,
  buildOcrFieldFills,
  buildStructuredPosterFields,
  isImageOnlyBody,
  ocrFactsNeedPersonReview,
  ocrFactsSummaryLine,
  usablePosterOcr,
} from "./poster-structured-fields.js";

const seoulDay = (value) =>
  value ? new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;

// The youth portal body of an image-only notice: header lines and the placeholder.
const IMAGE_ONLY_SOURCE = [
  "서울청년센터 강서 <청년 탄소중립 실천단> 모집",
  "신청기간 2026-11-20 ~ 2026-12-05",
  "대상",
  "담당기관 기타 (서울청년센터 강서)",
  "상세 내용은 이미지로 제공됩니다. 이미지 갤러리에서 전체 안내를 확인하세요.",
].join("\n");
const TITLE = "서울청년센터 강서 <청년 탄소중립 실천단> 모집";
const OCR = {
  ocrText: [
    "청년 탄소중립 실천단 모집",
    "모집대상 : 강서구 거주 또는 활동 청년(19~39세) 20명",
    "모집기간 : 2026. 11. 20.(금) ~ 12. 5.(토) 18:00",
    "활동내용 : 에코마일리지 가입 및 탄소중립 실천 미션",
    "문의 : 서울청년센터 강서 02-2600-1234",
  ].join("\n"),
  hasReadableText: true,
  confidence: 0.9,
  model: "gpt-5-mini",
  checkedAt: "2026-11-19T00:00:00.000Z",
};

test("image-only body detection ignores the portal header and placeholder", () => {
  assert.equal(isImageOnlyBody(IMAGE_ONLY_SOURCE, TITLE), true);
  const prose = `${TITLE}\n강서구 청년이 일상에서 탄소중립을 실천하도록 돕는 프로그램입니다. 매주 미션을 수행하고 활동 기록을 공유하며 우수 참여자에게는 활동 인증서를 드립니다. 첫 모임은 센터 3층 세미나실에서 열리고 이후에는 온라인으로 진행합니다.`;
  assert.equal(isImageOnlyBody(prose, TITLE), false);
});

test("OCR fills 대상, 모집기간 and 문의 only when the body has none, marked as ocr with a capped confidence", () => {
  const structured = buildStructuredPosterFields({ sourceText: "에코마일리지 소개\n상세 내용은 이미지로 제공됩니다.", title: "에코마일리지 소개" });
  assert.equal(structured.eligibility_summary, null);
  assert.equal(structured.application_end_at, null);
  const fills = buildOcrFieldFills({
    structured,
    posterOcr: OCR,
    sourceText: "에코마일리지 소개\n상세 내용은 이미지로 제공됩니다.",
    title: "에코마일리지 소개",
  });
  assert.ok(fills);
  assert.match(fills.columns.eligibility_summary, /강서구 거주 또는 활동 청년/);
  assert.equal(seoulDay(fills.columns.application_start_at), "2026-11-20");
  // The stated closing time is kept: 2026-12-05 18:00 KST.
  assert.equal(fills.columns.application_end_at, "2026-12-05T09:00:00.000Z");
  assert.match(fills.columns.contact_info, /02-2600-1234/);
  assert.equal(fills.columns.deadline_type, "fixed");
  assert.equal(fills.columns.verification_status, "needs_review");
  assert.ok(fills.columns.data_confidence <= OCR_FIELD_CONFIDENCE_CAP);
  assert.equal(fills.record.source, "ocr");
  assert.equal(fills.record.needsPersonReview, true);
  assert.ok(fills.record.fields.application_end_at.evidence.startsWith("모집기간"));
  assert.equal(ocrFactsNeedPersonReview({ ocrFacts: fills.record }), true);
  assert.equal(ocrFactsSummaryLine(fills), "대상: 강서구 거주 또는 활동 청년(19~39세) 20명 · 기간: 2026-11-20 ~ 2026-12-05 · 문의: 서울청년센터 강서 02-2600-1234");
});

test("a value the body already gives is never replaced by OCR", () => {
  const structured = buildStructuredPosterFields({ sourceText: IMAGE_ONLY_SOURCE, title: TITLE, applicationEndAt: "2026-12-05" });
  assert.equal(seoulDay(structured.application_end_at), "2026-12-05");
  const fills = buildOcrFieldFills({ structured, posterOcr: OCR, sourceText: IMAGE_ONLY_SOURCE, title: TITLE });
  assert.equal(fills.columns.application_end_at, undefined);
  assert.equal(fills.columns.application_start_at, undefined);
  assert.ok(fills.columns.eligibility_summary);
});

test("no OCR fill for a text body, a weak or failed OCR, or unlabeled text", () => {
  const prose = `${TITLE}\n강서구 청년이 일상에서 탄소중립을 실천하도록 돕는 프로그램입니다. 매주 미션을 수행하고 활동 기록을 공유하며 우수 참여자에게는 활동 인증서를 드립니다. 첫 모임은 센터 3층 세미나실에서 열리고 이후에는 온라인으로 진행합니다.`;
  assert.equal(buildOcrFieldFills({ structured: {}, posterOcr: OCR, sourceText: prose, title: TITLE }), null);
  assert.equal(usablePosterOcr({ ...OCR, confidence: 0.4 }), null);
  assert.equal(usablePosterOcr({ ocrText: "", hasReadableText: false, confidence: 0, reason: "OCR failed: timeout" }), null);
  assert.equal(usablePosterOcr(undefined), null);
  const unlabeled = { ...OCR, ocrText: "청년 탄소중립 실천단 함께해요! 11월 20일부터 12월 5일까지 02-2600-1234" };
  assert.equal(buildOcrFieldFills({ structured: {}, posterOcr: unlabeled, sourceText: "에코마일리지 소개", title: "에코마일리지 소개" }), null);
});

test("without a year anywhere the OCR period is left empty (no year is invented)", () => {
  const noYear = { ...OCR, ocrText: "모집기간 : 11. 20.(금) ~ 12. 5.(토)\n모집대상 : 강서구 청년" };
  const fills = buildOcrFieldFills({ structured: {}, posterOcr: noYear, sourceText: "에코마일리지 소개", title: "에코마일리지 소개" });
  assert.equal(fills.columns.application_end_at, undefined);
  assert.match(fills.columns.eligibility_summary, /강서구 청년/);
});

test("an empty portal 대상 header does not take the next header as the target", () => {
  const empty = buildStructuredPosterFields({ sourceText: "신청기간 2026-11-03 ~ 2026-11-13\n대상\n담당기관 기타 (은평구청)\n진행일정: 2026-11-13" });
  assert.equal(empty.eligibility_summary, null);
  const later = buildStructuredPosterFields({ sourceText: "대상\n담당기관 기타 (은평구청)\n모집대상: 은평구 거주 청년 15명\n문의 02-351-3711" });
  assert.equal(later.eligibility_summary, "은평구 거주 청년 15명");
});
