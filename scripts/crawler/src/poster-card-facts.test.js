import assert from "node:assert/strict";
import test from "node:test";

import {
  BENEFIT_SUMMARY_MAX_LENGTH,
  buildCardFacts,
  buildCardFactsInputFromUpload,
  CARD_FACTS_STATUS,
  classifyRegionBasis,
  classifySchedule,
  explainBenefit,
  extractBenefit,
  extractOrganizerCandidate,
  extractTitleOrgPrefix,
  isMissingCardFactColumnError,
  isMissingRegionBasisColumnError,
  normalizeAmount,
  normalizeOrgKey,
  withoutCardFactFields,
} from "./poster-card-facts.js";
import { auditRows, formatTable, parseArgs as parseAuditArgs } from "./audit-card-facts.js";
import {
  buildReviewCsv,
  buildSqlPreview,
  institutionSlug,
  planOrganizerInstitutions,
} from "./plan-organizer-institutions.js";

// ---------------------------------------------------------------------------
// Benefit
// ---------------------------------------------------------------------------

test("benefit is null when the notice states nothing", () => {
  assert.equal(extractBenefit({ title: "청년 정책 안내", summary_long: "자세한 내용은 첨부 포스터를 확인하세요." }), null);
  assert.equal(extractBenefit({}), null);
});

test("K-Startup open-data footer never yields 무료", () => {
  const benefit = extractBenefit({
    title: "2026 글로벌 진출 프로그램",
    summary_long:
      "신청대상: 서울시 소재 스타트업\nK-Startup에 공고되는 정보는 공공데이터포털(www.data.go.kr)에서 공공데이터로 개방중이며 무료로 활용할 수 있습니다.",
  });
  assert.equal(benefit, null);
});

test("K-Startup notice with an explicit 교육비 line still extracts it", () => {
  const benefit = extractBenefit({
    summary_long: "교육비: 무료\n공공데이터포털(www.data.go.kr)에서 공공데이터로 개방중이며 무료로 활용할 수 있습니다.",
  });
  assert.equal(benefit.summary, "교육비 무료");
  assert.equal(benefit.kind, "free");
});

test("negated 무료 is not a benefit", () => {
  assert.equal(
    extractBenefit({ summary_long: "공간 이용료 무료가 모든 운영 비용 무료를 뜻하지 않습니다." }),
    null,
  );
  assert.equal(extractBenefit({ summary_long: "참여비용 무료 ~ 3,000원 (프로그램별 상이)" }), null);
});

test("parking and refund wording is ignored", () => {
  assert.equal(extractBenefit({ summary_long: "상가 주차장은 유료이며, 무료 주차시간은 공지사항 참고" }), null);
  const benefit = extractBenefit({ summary_long: "교육비 무료(예치금 20만원, 수료 후 전액 반환)" });
  assert.equal(benefit.summary, "교육비 무료");
  assert.match(benefit.evidence, /전액 반환/, "evidence quotes the raw source text");
});

test("fees and ticket prices are paid, never a benefit", () => {
  const fee = extractBenefit({ summary_short: "서울시민 20명, 참가비 1인 5만 원." });
  assert.deepEqual([fee.kind, fee.summary], ["paid", "참가비 1인 5만원"]);
  const ticket = extractBenefit({ summary_long: "장르 콘서트 가격 1층석 8만원 / 2층석 5만원 주최 강북문화재단" });
  assert.equal(ticket.kind, "paid");
  assert.equal(ticket.summary, "가격 1층석 8만원");
  const course = extractBenefit({ summary_long: "■수강료: 30,000원(총8차시)" });
  assert.deepEqual([course.kind, course.summary], ["paid", "수강료 3만원"]);
});

test("participation_fee leading amount is the total fee, not a breakdown item", () => {
  const benefit = extractBenefit({ participation_fee: "1인 50,000원(체험료 30,000원+숙박비 20,000원)" });
  assert.deepEqual([benefit.kind, benefit.summary], ["paid", "참가비 1인 5만원"]);
});

test("research compensation is not a participant fee", () => {
  assert.equal(extractBenefit({ summary_long: "각 검사 당 소정의 연구 참여비 1만원 제공 (모두 참여 시 4만원 제공)" }), null);
});

test("contest awards are prizes", () => {
  const total = extractBenefit({ facts: { content: "심사 및 시상(총상금 2,000만 원, 대상 1,000만 원 등) 안내" } });
  assert.deepEqual([total.kind, total.summary], ["prize", "총상금 2,000만원"]);
  const rank = extractBenefit({ summary_long: "공모전 상금 및 시장 표창 수여(대상 100만원 · 최우수상 50만원)" });
  assert.equal(rank.kind, "prize");
});

test("대상 label or headcount is not a benefit", () => {
  assert.equal(extractBenefit({ facts: { target: "대상: 서울시 청년" }, summary_long: "참가인원: 서울시민 33명" }), null);
  assert.equal(extractBenefit({ summary_long: "모집인원: 선착순 40명" }), null);
});

test("grant amounts keep their modifiers and skip eligibility thresholds", () => {
  const grant = extractBenefit({ facts: { content: "이사지원금 최대 30만원 지급 (*청소비용 지원 불가)" } });
  assert.deepEqual([grant.kind, grant.summary], ["grant", "이사지원금 최대 30만원"]);
  const verb = extractBenefit({ summary_short: "중개보수와 이사비를 최대 40만원 지원합니다." });
  assert.deepEqual([verb.kind, verb.summary], ["grant", "최대 40만원 지원"]);
  assert.equal(
    extractBenefit({ summary_long: "전세보증금 1억원 이하 또는 임차보증금 8,000만원/월세 60만원 이하에 거주하는 1인가구" }),
    null,
  );
  assert.equal(extractBenefit({ summary_long: "75만원 상당의 갤럽강점검사" }), null);
});

test("ambiguous 활동비 without payout verb is skipped", () => {
  assert.equal(extractBenefit({ summary_long: "💸 활동비: 5,000원 나를 더 잘 이해하고" }), null);
  const paid = extractBenefit({ summary_long: "SNS 활동 2건 이상 업로드 시 활동비 100,000원 지급" });
  assert.deepEqual([paid.kind, paid.summary], ["grant", "활동비 10만원"]);
});

test("loans are service, not grant", () => {
  const loan = extractBenefit({ summary_long: "중위소득 100% 이하 저소득층 가구에 저리(1%)로 최대 500만 원 보증금 대출" });
  assert.equal(loan.kind, "service");
  assert.equal(loan.summary, "대출 최대 500만원");
});

test("free services and sessions", () => {
  assert.deepEqual(
    (({ kind, summary }) => [kind, summary])(extractBenefit({ summary_short: "전문 상담 8회 무료 제공" })),
    ["service", "상담 8회 무료"],
  );
  assert.equal(extractBenefit({ title: "성북구보건소 <대사증후군 무료검진> 안내" }).summary, "무료 검진");
  assert.equal(extractBenefit({ benefits_summary: "AI역량검사 무료 체험권" }), null, "a voucher is not a free program");
});

test("free with material cost and extras", () => {
  const material = extractBenefit({ summary_short: "수강료 무료, 재료비 12,000원." });
  assert.deepEqual([material.kind, material.summary], ["paid", "수강료 무료 · 재료비 12,000원"]);
  const extra = extractBenefit({ facts: { content: "교육비 전액 무료·수료증 발급 가능" } });
  assert.equal(extra.summary, "교육비 전액 무료 · 수료증");
  const noMeal = extractBenefit({ summary_long: "참여 비용: 무료! 점심시간이며, 식사는 제공되지 않아 인근 식당 이용" });
  assert.equal(noMeal.summary, "무료");
});

test("conflicting free and paid fees yield null", () => {
  const explanation = explainBenefit({ summary_long: "1강 수강료: 무료 / 2강 수강료: 20,000원" });
  assert.equal(explanation.result, null);
  assert.equal(explanation.reason, "conflict_free_and_paid");
});

test("English poster summary only counts with an explicit free term", () => {
  assert.equal(extractBenefit({ poster_text_summary: "Free participation for 40 people" }).summary, "무료");
  assert.equal(extractBenefit({ poster_text_summary: "Feel free to ask; barrier-free venue" }), null);
});

test("summaries never exceed the column limit", () => {
  const benefit = extractBenefit({ summary_long: "청년 월세 지원금 월 최대 20만원 × 12개월 지급" });
  assert.ok(benefit.summary.length <= BENEFIT_SUMMARY_MAX_LENGTH, benefit.summary);
  assert.equal(normalizeAmount("50,000원"), "5만원");
  assert.equal(normalizeAmount("1,000만 원"), "1,000만원");
  assert.equal(normalizeAmount("24,000원"), "24,000원");
});

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

test("schedule kinds use Asia/Seoul calendar days", () => {
  assert.equal(classifySchedule({}).kind, "unknown");
  assert.equal(
    classifySchedule({ event_start_at: "2026-11-14T15:00:00Z", event_end_at: "2026-11-15T14:59:00Z" }).kind,
    "single",
    "KST midnight-to-midnight is one day",
  );
  assert.equal(classifySchedule({ event_start_at: "2026-11-14T04:00:00Z" }).kind, "single");
  assert.equal(
    classifySchedule({ event_start_at: "2026-10-01T01:00:00Z", event_end_at: "2026-10-03T09:00:00Z" }).kind,
    "range",
  );
  assert.equal(
    classifySchedule({
      event_start_at: "2026-11-04T15:00:00Z",
      event_end_at: "2026-12-03T14:59:00Z",
      summary_long: "일 시: 2026. 11. 5. ~ 12. 3. (매주 목) 10:00~12:00",
    }).kind,
    "recurring",
  );
});

test("suspicious event dates are flagged without changing them", () => {
  const input = {
    event_start_at: "2026-11-01T15:00:00Z",
    event_end_at: "2026-11-06T14:59:00Z",
    application_start_at: "2026-11-01T15:00:00Z",
    application_end_at: "2026-11-06T14:59:00Z",
  };
  const result = classifySchedule(input);
  assert.ok(result.issues.includes("event_range_matches_application_period"));
  assert.equal(input.event_start_at, "2026-11-01T15:00:00Z");

  const early = classifySchedule(
    { event_start_at: "2026-11-05T01:00:00Z", event_end_at: "2026-11-05T03:00:00Z", application_end_at: "2026-11-20T14:59:00Z" },
    { now: new Date("2026-11-03T00:00:00Z") },
  );
  assert.ok(early.issues.includes("event_ends_before_open_application_end"));
  assert.ok(
    classifySchedule({ event_start_at: "2026-11-05T00:00:00Z", event_end_at: "2026-11-04T00:00:00Z" }).issues.includes(
      "event_end_before_start",
    ),
  );
});

// ---------------------------------------------------------------------------
// Organizer
// ---------------------------------------------------------------------------

const YOUTH = { source_institution_name: "청년몽땅정보통", source_institution_slug: "youth-seoul", source_org_name: "청년몽땅정보통" };

test("organizer names normalize legal forms, 구청 and departments", () => {
  assert.equal(normalizeOrgKey("(주)오픈놀"), normalizeOrgKey("㈜ 오픈놀"));
  assert.equal(normalizeOrgKey("동대문구청 경제진흥과"), normalizeOrgKey("동대문구"));
  assert.equal(normalizeOrgKey("서울특별시·청년인생설계학교 운영사무국"), normalizeOrgKey("서울시"));
  assert.notEqual(normalizeOrgKey("고용노동부"), normalizeOrgKey("고용노동"));
});

test("title prefix patterns", () => {
  assert.equal(extractTitleOrgPrefix("강동구 청년해냄센터 <취약분야 창업 컨설팅>").name, "강동구 청년해냄센터");
  assert.equal(extractTitleOrgPrefix("[서울청년센터 성북] 공간기획단 모집").name, "서울청년센터 성북");
  assert.equal(extractTitleOrgPrefix("[모집] 11월 원데이클래스"), null);
  assert.equal(extractTitleOrgPrefix("2026년 복지법률 토론회 <육아휴직>"), null);
  assert.equal(extractTitleOrgPrefix("숨어있던 산타를 제보하는 <산타제보소> 사연자 모집"), null);
  assert.equal(extractTitleOrgPrefix("[서초/문화예술] 서초문화재단 <예술가곡>").name, "서초문화재단");
  assert.equal(extractTitleOrgPrefix("(재)마포문화재단 서울마포음악창작소 공연").name, "(재)마포문화재단");
});

test("youth portal: title prefix wins, channel name is never the organizer", () => {
  const agree = extractOrganizerCandidate({ ...YOUTH, title: "강동구청 <자전거 정비교실> 모집", organizer_name: "강동구청" });
  assert.deepEqual([agree.name, agree.basis, agree.confidence], ["강동구청", "title_prefix", 0.95]);
  const channel = extractOrganizerCandidate({ ...YOUTH, title: "독서문화프로그램", organizer_name: "청년몽땅정보통" });
  assert.equal(channel, null);
  const seoul = extractOrganizerCandidate({ ...YOUTH, title: "서울특별시 <청년인생설계학교> 참여자 모집" });
  assert.equal(seoul.name, "서울특별시", "Seoul City is a real organizer on the youth portal");
  const coHost = extractOrganizerCandidate({
    ...YOUTH,
    title: "서울특별시 X 동국대학교 <청년취업사관학교>",
    organizer_name: "동국대학교 청년취업사관학교 대학+",
  });
  assert.equal(coHost.name, "동국대학교");
});

test("aggregators prefer explicit existing organizer fields", () => {
  const kstartup = extractOrganizerCandidate({
    title: "2026 서울창업허브 창동 데모데이 참관 신청",
    organizer_name: "(주)오픈놀",
    organization: { confidence: 0.95 },
    source_institution_name: "K-Startup",
    source_institution_slug: "k-startup",
  });
  assert.deepEqual([kstartup.name, kstartup.basis], ["(주)오픈놀", "existing_field"]);
  const portal = extractOrganizerCandidate({
    title: "자전거타기 좋은 서울 영상 공모전",
    organizer_name: "서울특별시장",
    source_institution_name: "서울특별시",
    source_institution_slug: "seoul-city",
  });
  assert.equal(portal, null, "the Seoul portal is not first-party for its own channel name");
});

test("first-party boards use the source institution unless the title names another org", () => {
  const own = extractOrganizerCandidate({
    title: "11월 원데이클래스",
    source_institution_name: "구립마포청소년문화의집",
    source_institution_slug: "mapo-youth",
  });
  assert.deepEqual([own.name, own.basis], ["구립마포청소년문화의집", "first_party_source"]);
  const other = extractOrganizerCandidate({
    title: "(재)마포문화재단 인디스커버리 페스타 공연 안내",
    source_institution_name: "마포구청",
    source_institution_slug: "mapo-gu",
  });
  assert.deepEqual([other.name, other.basis], ["마포문화재단", "title_prefix"]);
});

// ---------------------------------------------------------------------------
// Region basis
// ---------------------------------------------------------------------------

test("region basis: eligibility, venue, institution, related", () => {
  const result = classifyRegionBasis(
    {
      ...YOUTH,
      title: "강동구청 <정비교실>",
      eligibility_summary: "성북구 거주 청년",
      event_location: "서울 성동구 왕십리로 220",
      regions: [
        { code: "REG_SEOUL", name: "서울특별시" },
        { code: "REG_SEOUL_SEONGBUK", name: "성북구" },
        { code: "REG_SEOUL_SEONGDONG", name: "성동구" },
        { code: "REG_SEOUL_GANGDONG", name: "강동구" },
        { code: "REG_SEOUL_MAPO", name: "마포구" },
      ],
      fv_regions: [
        { code: "REG_SEOUL", source: "eligibility_scope", evidence: "서울시 거주" },
        { code: "REG_SEOUL_SEONGDONG", source: "keyword", evidence: "성동구" },
        { code: "REG_SEOUL_MAPO", source: "keyword", evidence: "망원" },
      ],
    },
    { organizerName: "강동구청" },
  );
  const byCode = Object.fromEntries(result.map((item) => [item.code, item.basis]));
  assert.deepEqual(byCode, {
    REG_SEOUL: "eligibility",
    REG_SEOUL_SEONGBUK: "eligibility",
    REG_SEOUL_SEONGDONG: "venue",
    REG_SEOUL_GANGDONG: "institution",
    REG_SEOUL_MAPO: "related",
  });
});

test("first-party source region without other evidence is institution", () => {
  const [basis] = classifyRegionBasis({
    source_institution_name: "마포구민체육센터",
    source_institution_slug: "mapo-sports",
    source_region_name: "서울특별시 마포구",
    regions: [{ code: "REG_SEOUL_MAPO", name: "마포구" }],
  });
  assert.equal(basis.basis, "institution");
});

// ---------------------------------------------------------------------------
// Aggregate, upload compatibility helpers
// ---------------------------------------------------------------------------

test("buildCardFacts always marks needs_review and records evidence", () => {
  const facts = buildCardFacts(
    { ...YOUTH, title: "강동구청 <정비교실>", summary_short: "참가비 무료.", regions: [] },
    { now: new Date("2026-11-03T00:00:00Z") },
  );
  assert.equal(facts.columns.card_facts_status, CARD_FACTS_STATUS);
  assert.equal(facts.columns.benefit_summary, "참가비 무료");
  assert.equal(facts.evidence.status, "needs_review");
  assert.equal(facts.evidence.benefit.kind, "free");
  assert.equal(facts.evidence.organizer.basis, "title_prefix");
  assert.equal(facts.evidence.extractedAt, "2026-11-03T00:00:00.000Z");

  const empty = buildCardFacts({ title: "공지" });
  assert.equal(empty.columns.benefit_summary, null);
  assert.equal(empty.columns.benefit_kind, null);
  assert.equal(empty.columns.event_schedule_kind, "unknown");
  assert.equal(empty.evidence.benefit.rule, "no_candidate");
});

test("missing card fact columns are detected without swallowing other errors", () => {
  assert.equal(
    isMissingCardFactColumnError({ code: "PGRST204", message: "Could not find the 'benefit_kind' column of 'posters' in the schema cache" }),
    true,
  );
  assert.equal(isMissingCardFactColumnError({ code: "42703", message: 'column "card_facts_status" of relation "posters" does not exist' }), true);
  assert.equal(isMissingCardFactColumnError({ code: "PGRST204", message: "Could not find the 'organizer_name' column" }), false);
  assert.equal(isMissingCardFactColumnError({ code: "23514", message: "violates check constraint benefit_summary" }), false);
  assert.equal(isMissingCardFactColumnError(null), false);
  assert.equal(isMissingRegionBasisColumnError({ code: "PGRST204", message: "Could not find the 'basis' column of 'poster_regions'" }), true);
  assert.equal(isMissingRegionBasisColumnError({ code: "23505", message: "duplicate key" }), false);

  const record = { title: "x", benefit_summary: "무료", benefit_kind: "free", event_schedule_kind: "single", card_facts_status: "needs_review", field_verification: { cardFacts: {} } };
  assert.deepEqual(withoutCardFactFields(record), { title: "x", field_verification: { cardFacts: {} } });
});

test("upload input mapping uses classification regions and organization slug", () => {
  const input = buildCardFactsInputFromUpload({
    post: { title: "강동구청 <정비교실>", site: "청년몽땅정보통" },
    title: "강동구청 <정비교실>",
    summaryShort: "참가비 무료.",
    structuredFields: { event_location: "강동구청 1층", event_start_at: "2026-11-14T01:00:00Z" },
    fieldVerification: { organization: { sourceOrgName: "청년몽땅정보통", collectionSourceSlug: "youth-seoul" } },
    classification: { regions: [{ code: "REG_SEOUL_GANGDONG", source: "keyword", evidence: "강동구" }] },
  });
  const facts = buildCardFacts(input);
  assert.equal(facts.organizer.name, "강동구청");
  assert.equal(facts.schedule.kind, "single");
  assert.deepEqual(facts.regionBasis.map((item) => item.basis), ["venue"]);
});

// ---------------------------------------------------------------------------
// Offline scripts
// ---------------------------------------------------------------------------

const SNAPSHOT_ROWS = [
  { id: "p1", ...YOUTH, title: "강동구청 <정비교실> 모집", organizer_name: "강동구청", summary_short: "참가비 무료." },
  { id: "p2", ...YOUTH, title: "강동구 <걷기 대회>", summary_short: "참가비 1만원" },
  {
    id: "p3",
    title: "11월 원데이클래스",
    source_institution_id: "inst-mapo-youth",
    source_institution_name: "구립마포청소년문화의집",
    source_institution_slug: "mapo-youth",
    source_region_name: "서울특별시 마포구",
    regions: [{ code: "REG_SEOUL_MAPO", name: "마포구" }],
  },
  { id: "p4", ...YOUTH, source_institution_id: "inst-youth", title: "독서문화프로그램", organizer_name: "청년몽땅정보통" },
];

test("audit aggregates per source without a database", () => {
  assert.throws(() => parseAuditArgs(["--apply"]), /read-only/);
  const audit = auditRows(SNAPSHOT_ROWS, { now: new Date("2026-11-03T00:00:00Z") });
  assert.equal(audit.total.n, 4);
  assert.equal(audit.total.benefit.free, 1);
  assert.equal(audit.total.benefit.paid, 1);
  assert.equal(audit.total.organizer.none, 1);
  assert.match(formatTable(audit, { minRows: 1 }), /TOTAL \| 4/);
});

test("organizer plan merges variants, matches source institutions and writes a preview", () => {
  const plan = planOrganizerInstitutions(SNAPSHOT_ROWS);
  assert.equal(plan.summary.institutions, 2, "강동구청 and 강동구 share one canonical key");
  const gangdong = plan.institutions.find((item) => item.key === normalizeOrgKey("강동구"));
  assert.equal(gangdong.posterIds.length, 2);
  assert.equal(gangdong.action, "create_unverified");
  const mapo = plan.institutions.find((item) => item.name === "구립마포청소년문화의집");
  assert.equal(mapo.action, "match_existing_source_institution");
  assert.equal(mapo.existingId, "inst-mapo-youth");
  assert.equal(plan.summary.postersLinked, 3);

  const sql = buildSqlPreview(plan, { input: "snapshot.jsonl", minConfidence: 0.7 });
  assert.match(sql, /^-- =+\n-- PREVIEW ONLY - DO NOT RUN WITHOUT APPROVAL/);
  assert.match(sql, /'unverified', false\) ON CONFLICT DO NOTHING/);
  assert.match(sql, /verification_status IS DISTINCT FROM 'verified'/);
  assert.match(sql, /ROLLBACK;\n$/);
  assert.equal(institutionSlug(" 강동구청 "), institutionSlug("강동구청"));

  const csv = buildReviewCsv(plan);
  assert.ok(csv.startsWith("﻿poster_id,"));
  assert.equal(csv.trim().split("\r\n").length, 1 + plan.posterRows.length);
});
