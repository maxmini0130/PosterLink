import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStructuredPosterFields,
  inferStructuredDeadlineType,
  normalizeStructuredDeadlineType,
} from "./poster-structured-fields.js";

test("deadline type stays unknown without explicit evidence", () => {
  assert.equal(inferStructuredDeadlineType({}), "unknown");
  assert.equal(normalizeStructuredDeadlineType("상시"), "ongoing");
});

test("deadline type uses explicit source wording before fixed date fallback", () => {
  assert.equal(
    inferStructuredDeadlineType({ sourceText: "참여자를 상시 모집합니다" }),
    "ongoing",
  );
  assert.equal(
    inferStructuredDeadlineType({ sourceText: "예산 소진 시 종료" }),
    "until_exhausted",
  );
  assert.equal(
    inferStructuredDeadlineType({ applicationEndAt: "2026-08-31" }),
    "fixed",
  );
});

test("structured fields preserve organization and readable notice facts", () => {
  const fields = buildStructuredPosterFields({
    fieldVerification: {
      confidence: 0.91,
      organization: {
        sourceOrgName: "수집 사이트",
        organizerName: "실제 주관기관",
        applicationOrganizationName: "접수 기관",
      },
      readableNotice: {
        facts: {
          target: "서울 거주 청년",
          application: "온라인 신청",
          contact: "02-1234-5678",
          location: "마포구청",
        },
      },
    },
    applicationEndAt: "2026-08-31",
    supportScale: "교육비 전액 지원",
  });

  assert.equal(fields.organizer_name, "실제 주관기관");
  assert.equal(fields.application_organization_name, "접수 기관");
  assert.equal(fields.deadline_type, "fixed");
  assert.equal(fields.eligibility_summary, "서울 거주 청년");
  assert.equal(fields.benefits_summary, "교육비 전액 지원");
  assert.equal(fields.application_method, "온라인 신청");
  assert.equal(fields.contact_info, "02-1234-5678");
  assert.equal(fields.event_location, "마포구청");
  assert.equal(fields.data_confidence, 0.91);
});

test("first-come single-day event notices reuse the event day for application and event dates", () => {
  const fields = buildStructuredPosterFields({
    fieldVerification: {
      confidence: 0.9,
      organization: {
        organizerName: "강서구립가양도서관",
      },
    },
    applicationEndAt: "2026-09-16",
    sourceText:
      "강서구립가양도서관 <9월 퇴근길 영화관 <죽은 시인의 사회>> [가양]퇴근길 영화관 <죽은 시인의 사회> 만12세 이상, 저녁 7시, 제2강의실 선착순!",
  });

  assert.equal(fields.deadline_type, "fixed");
  assert.equal(fields.application_start_at.slice(0, 10), "2026-09-16");
  assert.equal(fields.application_end_at.slice(0, 10), "2026-09-16");
  assert.equal(fields.event_start_at.slice(0, 10), "2026-09-16");
  assert.equal(fields.event_end_at.slice(0, 10), "2026-09-16");
});

test("first-come fallback does not override notices with an explicit application period", () => {
  const fields = buildStructuredPosterFields({
    applicationEndAt: "2026-09-16",
    sourceText:
      "신청기간 2026.09.01 ~ 2026.09.10 선착순 접수 행사일시 2026.09.16 영화 상영",
  });

  assert.equal(fields.application_start_at.slice(0, 10), "2026-09-01");
  assert.equal(fields.application_end_at.slice(0, 10), "2026-09-16");
  assert.equal(fields.event_start_at.slice(0, 10), "2026-09-16");
  assert.equal(fields.event_end_at.slice(0, 10), "2026-09-16");
});

test("open-ended first-come library notices keep start date and event date separate", () => {
  const fields = buildStructuredPosterFields({
    fieldVerification: {
      confidence: 0.9,
      readableNotice: {
        facts: {
          period: "2026-09-04 ~ [선착순 마감]",
          content:
            "곽재식 작가와의 만남(강서구립등빛도서관에서 진행) — 2026-09-15에 개최",
          location: "강서구립등빛도서관",
          application: "신청기간: 2026-09-04 ~ [선착순 마감]",
        },
      },
    },
    sourceText: "강서구립등빛도서관<곽재식 작가와의 만남>",
  });

  assert.equal(fields.deadline_type, "until_exhausted");
  assert.equal(fields.application_start_at.slice(0, 10), "2026-09-04");
  assert.equal(fields.application_end_at, null);
  assert.equal(fields.event_start_at.slice(0, 10), "2026-09-15");
  assert.equal(fields.event_end_at.slice(0, 10), "2026-09-15");
});

test("history exploration notices extract labeled dates, location, grade ages, capacity, and first-come deadline", () => {
  const sourceText = `
    2026년 마포구 청소년 역사유적 탐방 참가자 모집 안내
    1. 행 사 명: 2026년 마포구 청소년 역사유적 탐방
    2. 탐방일시: 2026. 9. 12.(토) 9:00 ~ 16:00
    3. 탐방장소: 수원화성 일대
    4. 탐방주제: 정조의 효심을 넘어 새로운 시대를 꿈꾼 백성의 도시
    5. 주 관: 마포구 청소년지도협의회
    6. 모집대상: 관내 초등학생 4~6학년 48명
    7. 모집기간: 2026. 9. 1.(화) ~ 9. 6.(일) ※ 선착순 접수
  `;

  const fields = buildStructuredPosterFields({
    fieldVerification: {
      confidence: 0.86,
      readableNotice: {
        facts: {
          period:
            "~9월 6일(일)까지, 탐방일: 2026년 9월 12일(토) 09:00~16:00, 탐방장소: 수원화성 일대",
          target: "마포구 거주 초등학교 4~6학년",
        },
      },
    },
    sourceText,
  });

  assert.equal(fields.deadline_type, "until_exhausted");
  assert.equal(fields.application_start_at.slice(0, 10), "2026-09-01");
  assert.equal(fields.application_end_at.slice(0, 10), "2026-09-06");
  assert.equal(fields.event_start_at.slice(0, 10), "2026-09-12");
  assert.equal(fields.event_end_at.slice(0, 10), "2026-09-12");
  assert.equal(fields.target_age_min, 10);
  assert.equal(fields.target_age_max, 12);
  assert.equal(fields.recruitment_count, "48명");
  assert.equal(fields.event_location, "수원화성 일대");
});

test("counseling program notices extract attached emoji labels and event ranges", () => {
  const sourceText = `
    [모집] 집단상담 프로그램 '숨비소리' 2기 참여자 모집
    📆일정2026년 10월 6일(화) ~ 11월 24일(화) 매주 화요일, 19:00 ~ 21:00 (총 8회기)
    🚩장소어텀인남산 (서울 용산구 만리재로186 3층)
    🎯대상부장·국장·시설장 급을 제외한 사회복지종사자 5명
    📢모집기간2026년 9월 3일(목) ~ 9월 20일(일)
  `;

  const fields = buildStructuredPosterFields({
    fieldVerification: {
      confidence: 0.9,
      organization: {
        organizerName: "사회복지종사자 권익지원센터",
      },
      readableNotice: {
        facts: {
          period: "2026년 9월 3일(목) ~ 9월 20일(일)",
        },
      },
    },
    sourceText,
  });

  assert.equal(fields.deadline_type, "fixed");
  assert.equal(fields.application_start_at.slice(0, 10), "2026-09-03");
  assert.equal(fields.application_end_at.slice(0, 10), "2026-09-20");
  assert.equal(fields.event_start_at.slice(0, 10), "2026-10-06");
  assert.equal(fields.event_end_at.slice(0, 10), "2026-11-24");
  assert.equal(
    fields.eligibility_summary,
    "부장·국장·시설장 급을 제외한 사회복지종사자 5명",
  );
  assert.equal(fields.recruitment_count, "5명");
  assert.equal(
    fields.event_location,
    "어텀인남산 (서울 용산구 만리재로186 3층)",
  );
});

test("unsafe readable facts never reach structured poster columns", () => {
  const fields = buildStructuredPosterFields({
    fieldVerification: {
      confidence: 0.95,
      readableNotice: {
        facts: {
          target: "서울 청년 ● 모집인원: 20명",
          application: "온라인 신청 https://www",
          contact: "02-1234-5678 4. 진행일정: 2026.9.1",
          location: "마포구청 ● 문의처: 02-0000-0000",
        },
      },
    },
  });

  assert.equal(fields.eligibility_summary, "서울 청년");
  assert.equal(fields.application_method, null);
  assert.equal(fields.contact_info, "02-1234-5678");
  assert.equal(fields.event_location, "마포구청");
});

test("LLM-filled facts remain review suggestions instead of public fields", () => {
  const fields = buildStructuredPosterFields({
    fieldVerification: {
      confidence: 0.88,
      readableNotice: {
        facts: {
          period: "2026. 8. 1. ~ 8. 31.",
          target: "서울 거주 청년",
          content: "친환경 생활 실천",
          application: "텀블러를 지참해 참여",
          contact: "02-1234-5678",
        },
        factsLlmMeta: {
          filledByLlm: ["period", "content", "application"],
        },
      },
    },
  });

  assert.equal(fields.deadline_type, "unknown");
  assert.equal(fields.eligibility_summary, "서울 거주 청년");
  assert.equal(fields.benefits_summary, null);
  assert.equal(fields.application_method, null);
  assert.equal(fields.contact_info, "02-1234-5678");
});
