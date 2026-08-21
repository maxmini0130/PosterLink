import assert from "node:assert/strict";
import test from "node:test";

import { scorePosterDuplicate } from "./poster-duplicate-detector.js";
import { evaluatePosterQuality } from "./poster-quality-gate.js";
import { getPostExclusionReason } from "./post-candidate-filter.js";
import { buildReadableNoticeInfo } from "./upload-to-supabase.js";
import { getAttachmentFailureCode } from "./attachment-text-extractor.js";
import { choosePreferredDetailTitle, inferSpecificTitle } from "./adapters/youth-seoul.js";
import { extractOrgFromTitle, resolveSourceOrgName } from "./poster-org.js";
import { isLikelyApplicationLink, sanitizeKnownShortUrl } from "./source-link-rules.js";

const org = "금천구";

test("extractOrgFromTitle pulls the host org before the program bracket", () => {
  assert.equal(extractOrgFromTitle("관악구 <2026년 여름 청년행정체험단 모집> 안내"), "관악구");
  assert.equal(extractOrgFromTitle("서울청년센터 강동 <든든캠퍼스 3기> 참여자 모집"), "서울청년센터 강동");
});

test("extractOrgFromTitle returns null when no clean org prefix exists", () => {
  assert.equal(extractOrgFromTitle("렛유인에듀 안내"), null); // '<' 없음
  assert.equal(
    extractOrgFromTitle("서울청년센터 관악 신림동쓰리룸 2026 렛츠 크루 - 커넥팅 리더 진행 <반려견>"),
    null,
  ); // 앞부분이 너무 긺(프로그램 설명 섞임)
});

test("resolveSourceOrgName replaces portal name with the title org", () => {
  assert.equal(
    resolveSourceOrgName("강동구보건소 <청년 액티브 챌린지> 참여자 모집", "청년몽땅정보통"),
    "강동구보건소",
  );
});

test("resolveSourceOrgName keeps a real org name unchanged", () => {
  assert.equal(resolveSourceOrgName("마포문화재단 공지", "마포문화재단"), "마포문화재단");
});

test("resolveSourceOrgName keeps the portal name when the title is not extractable", () => {
  assert.equal(resolveSourceOrgName("렛유인에듀 안내", "청년몽땅정보통"), "청년몽땅정보통");
});

test("weekday variants of the same futsal program merge", () => {
  const result = scorePosterDuplicate(
    { title: "2026년 금천구 생활체육교실 <여성풋살교실(8~10월 매주 월요일)> 참여자 모집", source_org_name: org },
    { title: "2026년 금천구 생활체육교실 <여성풋살교실(8~10월 매주 금요일)> 참여자 모집", source_org_name: org },
  );
  assert.equal(result.decision, "merge");
});

test("month/new-program variants of the same badminton lesson merge", () => {
  const result = scorePosterDuplicate(
    { title: "여름맞이 배드민턴 소그룹 집중 레슨(특강) 신규 프로그램 안내", source_org_name: org },
    { title: "여름맞이 배드민턴 소그룹 집중 레슨(특강) 8월", source_org_name: org },
  );
  assert.equal(result.decision, "merge");
});

test("matching attachment hashes strengthen duplicate detection", () => {
  const hash = "a".repeat(64);
  const result = scorePosterDuplicate(
    {
      title: "2026 청소년 여름 미술교실 참가자 모집",
      source_org_name: "마포문화센터",
      attachmentAnalysis: { sources: [{ contentHash: hash }] },
    },
    {
      title: "청소년 여름 미술교실 참여자 모집 안내",
      source_org_name: "마포문화센터",
      field_verification: { attachmentAnalysis: { sources: [{ contentHash: hash }] } },
    },
  );
  assert.equal(result.decision, "merge");
  assert.ok(result.matched.includes("attachment-hash"));
});

test("matching official application URLs participate in duplicate detection", () => {
  const applyUrl = "https://apply.example.test/program/2026-summer";
  const result = scorePosterDuplicate(
    {
      title: "2026 여름 청년 창업학교 참가자 모집",
      source_org_name: "마포창업센터",
      poster_links: [{ link_type: "official_apply", url: applyUrl }],
    },
    {
      title: "여름 청년 창업학교 참여자 모집 안내",
      source_org_name: "마포창업센터",
      poster_links: [{ link_type: "official_apply", url: applyUrl }],
    },
  );
  assert.equal(result.decision, "merge");
  assert.ok(result.matched.includes("application-url"));
});

test("a shared application form does not merge generic program records", () => {
  const applyUrl = "https://forms.gle/shared-program-form";
  const result = scorePosterDuplicate(
    {
      title: "을지유니크팩토리 모집",
      source_org_name: "청년몽땅정보통",
      poster_links: [{ link_type: "official_apply", url: applyUrl }],
    },
    {
      title: "을지유니크팩토리 모집",
      source_org_name: "청년몽땅정보통",
      poster_links: [{ link_type: "official_apply", url: applyUrl }],
    },
  );

  assert.notEqual(result.decision, "merge");
  assert.ok(result.matched.includes("application-url"));
});

test("identical image phash across different URLs (board vs. blog CDN) triggers a merge", () => {
  const phash = "a1b2c3d4e5f6a1b2";
  const result = scorePosterDuplicate(
    {
      title: "2026년 소상공인 지원사업 모집 공고",
      source_org_name: "마포구청",
      images: ["https://blog-cdn.example.com/photo123.jpg"],
      imagePhash: phash,
    },
    {
      title: "2026년 소상공인 지원사업 모집",
      source_org_name: "마포구청",
      images: ["https://board.mapo.go.kr/upload/photo999.jpg"],
      imagePhash: phash,
    },
  );
  assert.equal(result.decision, "merge");
  assert.ok(result.matched.includes("image-phash"));
});

test("matching image phash without org or deadline corroboration stays review, not merge", () => {
  const phash = "a1b2c3d4e5f6a1b2";
  const result = scorePosterDuplicate(
    {
      title: "2026 청년 창업 지원사업 참여자 모집",
      imagePhash: phash,
    },
    {
      title: "2026 청년 주거 지원사업 참여자 모집",
      imagePhash: phash,
    },
  );
  assert.equal(result.decision, "review");
  assert.ok(result.matched.includes("image-phash"));
});

test("an exact image URL match is not double-counted as a separate phash match", () => {
  const phash = "a1b2c3d4e5f6a1b2";
  const sharedUrl = "https://board.mapo.go.kr/upload/photo999.jpg";
  const result = scorePosterDuplicate(
    { title: "2026년 소상공인 지원사업 모집 공고", images: [sharedUrl], imagePhash: phash },
    { title: "2026년 소상공인 지원사업 모집 공고", images: [sharedUrl], imagePhash: phash },
  );
  assert.ok(result.matched.includes("image"));
  assert.ok(!result.matched.includes("image-phash"));
});

test("different image phash values do not falsely merge on their own", () => {
  const result = scorePosterDuplicate(
    { title: "청년 창업 특강 참가자 모집", imagePhash: "0000000000000000" },
    { title: "청소년 여름 축제 안내", imagePhash: "ffffffffffffffff" },
  );
  assert.ok(!result.matched.includes("image-phash"));
});

test("OCR text is converted into structured notice facts", () => {
  const result = buildReadableNoticeInfo({
    title: "청년 창업 특강",
    content: "프로그램 소개",
    posterContentVerification: {
      posterTextSummary: [
        "대상: 마포구 거주 청년 30명",
        "기간: 2026. 8. 10. ~ 2026. 8. 20.",
        "장소: 마포청년나루 2층",
        "신청방법: 온라인 신청",
        "문의처: 02-1234-5678",
      ].join("\n"),
    },
  });

  assert.equal(result.facts.target, "마포구 거주 청년 30명");
  assert.equal(result.facts.location, "마포청년나루 2층");
  assert.equal(result.facts.application, "온라인 신청");
  assert.equal(result.facts.contact, "02-1234-5678");
  assert.ok(result.facts.period);
});

test("collapsed form content is restored to readable sections without form UI noise", () => {
  const result = buildReadableNoticeInfo({
    title: "을지유니크팩토리 모집",
    content: [
      "[신청] 중성프 2026년 7-8월 전체 프로그램",
      "📌 대상☑️ 서울 중구 청년(만 18세~만 39세)",
      "※재학생과 사업자등록증 보유자는 제외됩니다.",
      "📌 장소☑️ 을지유니크팩토리 B2층",
      "❤️ 문의https://pf.kakao.com/_ytIPn/",
      "🚨신청 후 노쇼하는 경우 참여가 제한될 수 있습니다.",
      "* 표시는 필수 질문임이메일 *응답과 함께 이메일 주소 기록",
      "Google Forms를 통해 비밀번호를 제출하지 마세요.",
    ].join(""),
  });

  assert.equal(result.facts.target, "서울 중구 청년(만 18세~만 39세)");
  assert.equal(result.facts.location, "을지유니크팩토리 B2층");
  assert.match(result.summaryLong, /\n대상: /);
  assert.match(result.summaryLong, /\n장소: /);
  assert.match(result.summaryLong, /\n주의: /);
  assert.ok(!result.summaryLong.includes("필수 질문"));
  assert.ok(!result.summaryLong.includes("Google Forms"));
});

test("program names in angle brackets are preserved as text, not removed as HTML", () => {
  const result = buildReadableNoticeInfo({
    title: "강북구 직장인 커뮤니티 <우리동네 직장인> 모임원 모집",
    content: "대상: 강북구 직장인\n내용: 직장인 커뮤니티 모임",
  });

  assert.equal(result.title, "강북구 직장인 커뮤니티 <우리동네 직장인> 모임원 모집");
});

test("generic youth title is made specific from a poster attachment name", () => {
  assert.equal(
    inferSpecificTitle(
      "을지유니크팩토리 모집",
      "프로그램 신청 안내",
      [{ name: "[모집] 중구 청성프_유니크_지구를 위한 생활 실험실 2.png" }],
    ),
    "중구 청성프 유니크 지구를 위한 생활 실험실 2 모집",
  );
});

test("known short URLs drop text and emoji accidentally glued to the path", () => {
  assert.equal(
    sanitizeKnownShortUrl("https://forms.gle/KLM3hcpWf3uuSxTc6%F0%9F%94%97"),
    "https://forms.gle/KLM3hcpWf3uuSxTc6",
  );
  assert.equal(
    sanitizeKnownShortUrl("https://pf.kakao.com/_ytIPn/%F0%9F%9A%A8%EC%8B%A0%EC%B2%AD"),
    "https://pf.kakao.com/_ytIPn/",
  );
});

test("Kakao contact channels are not promoted to application links by nearby text", () => {
  assert.equal(
    isLikelyApplicationLink(
      "https://pf.kakao.com/_ytIPn/",
      "문의 후 신청 관련 안내",
    ),
    false,
  );
});

test("quality gate flags collapsed form summaries and application URLs used as source keys", () => {
  const quality = evaluatePosterQuality({
    title: "을지유니크팩토리 모집",
    source_org_name: "청년몽땅정보통",
    source_key: "https://forms.gle/shared-program-form",
    summary_long: "📌 대상☑️ 서울 청년📌 장소☑️ 을지로* 표시는 필수 질문임",
    images: ["https://example.com/poster.png"],
  });
  const codes = quality.issues.map((issue) => issue.code);

  assert.ok(codes.includes("collapsed-structured-summary"));
  assert.ok(codes.includes("form-ui-noise"));
  assert.ok(codes.includes("application-url-as-source"));
  assert.equal(quality.decision, "review");
});

test("leading '상세정보' tab label is stripped from the summary", () => {
  const result = buildReadableNoticeInfo({
    title: "청년 프로그램 안내",
    content: "상세정보 안녕하세요 서울청년센터 양천입니다. 다시 꿈꾸는 시간을 함께합니다.",
  });
  assert.ok(!(result.summaryLong ?? "").startsWith("상세정보"));
  assert.ok(!(result.summaryShort ?? "").startsWith("상세정보"));
});

test("content that is only the '상세정보' tab label produces no junk summary", () => {
  const result = buildReadableNoticeInfo({ title: "행사 안내", content: "상세정보" });
  assert.ok(!(result.summaryShort ?? "").includes("상세정보"));
  assert.ok(!(result.summaryLong ?? "").includes("상세정보"));
});

test("'대상으로' mid-sentence is not mis-captured as a 대상 field", () => {
  const result = buildReadableNoticeInfo({
    title: "AI 실무 교육",
    content: "본 과정은 만 19~39세 청년을 대상으로 AI 직무 교육을 운영합니다.",
  });
  assert.equal(result.facts.target, undefined);
  assert.ok(!(result.summaryShort ?? "").includes("대상: 으로"));
});

test("'내용은' mid-sentence is not mis-captured as a 내용 field", () => {
  const result = buildReadableNoticeInfo({
    title: "블로그 안내",
    content: "자세한 내용은 아래 블로그를 참조해 주시기 바랍니다.",
  });
  assert.equal(result.facts.content, undefined);
  assert.ok(!(result.summaryShort ?? "").includes("내용: 은"));
});

test("genuine colon-delimited 대상/문의 labels are still captured", () => {
  const result = buildReadableNoticeInfo({
    title: "모집 공고",
    content: "대상: 만 19~39세 청년\n문의: 02-111-2222",
  });
  assert.equal(result.facts.target, "만 19~39세 청년");
  assert.equal(result.facts.contact, "02-111-2222");
});

test("space-delimited label at line start is still captured", () => {
  const result = buildReadableNoticeInfo({
    title: "모집 공고",
    content: "대상  마포구 거주 청년 30명",
  });
  assert.equal(result.facts.target, "마포구 거주 청년 30명");
});

test("Korean weekday date ranges are kept intact and square-bullet sections become lines", () => {
  const result = buildReadableNoticeInfo({
    title: "2026 서울핀테크아카데미 14기 교육생 모집",
    content: [
      "과정소개 안내",
      "■ 수강신청 : 2026.6.15.(월) ~ 2026.7.16.(목)",
      "■ 비용 : 무료",
      "■ 교육기간 : 2026.8.21.(금) ~ 2026.11.7.(토)",
    ].join(" "),
  });

  assert.equal(result.facts.period, "2026.6.15.(월) ~ 2026.7.16.(목)");
  assert.match(result.summaryLong, /\n■ 수강신청/);
  assert.match(result.summaryLong, /\n■ 비용/);
});

test("application period outranks an earlier education period", () => {
  const result = buildReadableNoticeInfo({
    title: "핀테크 교육생 모집",
    content: [
      "교육기간: 2026.8.21.(금) ~ 2026.11.7.(토)",
      "신청기간: 2026.6.15.(월) ~ 2026.7.16.(목)",
    ].join("\n"),
  });

  assert.equal(result.facts.period, "2026.6.15.(월) ~ 2026.7.16.(목)");
});

test("collapsed numbered facts stop before the next labeled section", () => {
  const result = buildReadableNoticeInfo({
    title: "여성 재취업 교육생 모집",
    content: [
      "1. 목적: 출판에 필요한 디자인 실무 교육",
      "2. 신청대상: 취업 및 창업을 희망하는 여성 누구나",
      "3. 신청기간: 2026.7.1~2026.8.21",
      "4. 진행일정: 2026.9.1~2026.11.27",
      "5. 진행내용: 디자인 툴 완벽 마스터",
      "6. 문의처: 02-2186-5823",
    ].join(" "),
  });

  assert.equal(result.facts.target, "취업 및 창업을 희망하는 여성 누구나");
  assert.equal(result.facts.period, "2026.7.1~2026.8.21");
  assert.equal(result.facts.content, "디자인 툴 완벽 마스터");
  assert.equal(result.facts.contact, "02-2186-5823");
  assert.ok(!result.summaryShort.includes("4. 진행일정"));
});

test("circle bullet facts remain separate and readable", () => {
  const result = buildReadableNoticeInfo({
    title: "강남구민의 상 후보자 모집",
    content: [
      "● 모집대상 : 5년 이상 강남구 거주 주민",
      "● 모집인원 : 12개 부문",
      "● 모집기간 : 2026. 6. 8.(월) ~ 2026. 8. 7.(금)",
      "● 접수방법 : 전자우편, 우편, 방문 제출",
      "● 문의방법 : 담당자 02-3423-5198",
    ].join(" "),
  });

  assert.equal(result.facts.target, "5년 이상 강남구 거주 주민");
  assert.equal(result.facts.period, "2026. 6. 8.(월) ~ 2026. 8. 7.(금)");
  assert.equal(result.facts.application, "전자우편, 우편, 방문 제출");
  assert.equal(result.facts.contact, "담당자 02-3423-5198");
  assert.ok(!result.facts.target.includes("모집인원"));
});

test("attachment failure reasons are standardized", () => {
  assert.equal(
    getAttachmentFailureCode({ kind: "hwp", status: "unsupported", reason: "legacy hwp requires converter" }),
    "legacy_hwp_converter_missing",
  );
  assert.equal(
    getAttachmentFailureCode({ kind: "pdf", status: "failed", reason: "no readable text extracted" }),
    "no_readable_text",
  );
  assert.equal(
    getAttachmentFailureCode({ kind: "hwpx", status: "failed", reason: "timeout of 15000ms exceeded" }),
    "download_timeout",
  );
  assert.equal(getAttachmentFailureCode({ kind: "docx", status: "extracted" }), null);
});

test("reject a provider-only title captured from a youth notice", () => {
  const result = evaluatePosterQuality({
    title: "\uD37C\uC2A4\uD2B8\uC778\uC7A1(\uC8FC)",
    source_org_name: "\uCCAD\uB144\uBABD\uB545\uC815\uBCF4\uD1B5",
    summary_short: "\uCCAD\uB144 \uC9C0\uC6D0 \uD504\uB85C\uADF8\uB7A8\uC758 \uADFC\uBB34\uC870\uAC74\uACFC \uC2E0\uCCAD \uBC29\uBC95\uC744 \uC548\uB0B4\uD569\uB2C8\uB2E4.",
    source_key: "https://youth.seoul.go.kr/example",
    images: ["https://example.test/poster.jpg"],
  });

  assert.equal(result.decision, "reject");
  assert.ok(result.issues.some((issue) => issue.code === "generic-title"));
});

test("reject retrospective news items even when they have an image", () => {
  const result = evaluatePosterQuality({
    title: "4\uC6D4 \uAC77\uAE30\uBAA8\uC784 \uC18C\uC2DD",
    source_org_name: "\uB9C8\uD3EC\uAD6C\uB178\uB3D9\uC790\uC885\uD569\uC9C0\uC6D0\uC13C\uD130",
    summary_short: "4\uC6D4 \uAC77\uAE30\uBAA8\uC784 \uC18C\uC2DD",
    source_key: "https://mapolabor.org/community/news/post?seq=368",
    images: ["https://mapolabor.org/files/news-walk.jpg"],
  });

  assert.equal(result.decision, "reject");
  assert.ok(result.issues.some((issue) => issue.code === "retrospective-news"));
});

test("reject news-board posts without recruitment or application action", () => {
  const result = evaluatePosterQuality({
    title: "\uACBD\uBE44\uB178\uB3D9\uC790 \uAD50\uC721 \uBC0F \uD55C\uB9C8\uB2F9",
    source_org_name: "\uB9C8\uD3EC\uAD6C\uB178\uB3D9\uC790\uC885\uD569\uC9C0\uC6D0\uC13C\uD130",
    summary_short: "\uACBD\uBE44\uB178\uB3D9\uC790 \uAD50\uC721 \uBC0F \uD55C\uB9C8\uB2F9 \uD589\uC0AC \uC548\uB0B4",
    source_key: "https://mapolabor.org/community/news/post?seq=369",
    images: ["https://mapolabor.org/files/event.jpg"],
  });

  assert.equal(result.decision, "reject");
  assert.ok(result.issues.some((issue) => issue.code === "news-board-without-action"));
});

test("keep active recruitment notices from a news board", () => {
  const result = evaluatePosterQuality({
    title: "\uACBD\uBE44\uB178\uB3D9\uC790 \uAD50\uC721 \uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    source_org_name: "\uB9C8\uD3EC\uAD6C\uB178\uB3D9\uC790\uC885\uD569\uC9C0\uC6D0\uC13C\uD130",
    summary_short: "\uB300\uC0C1\uC790\uB97C \uBAA8\uC9D1\uD558\uBA70 2026\uB144 8\uC6D4 10\uC77C\uAE4C\uC9C0 \uC2E0\uCCAD \uC811\uC218\uD569\uB2C8\uB2E4.",
    source_key: "https://mapolabor.org/community/news/post?seq=999",
    images: ["https://mapolabor.org/files/recruit.jpg"],
  });

  assert.notEqual(result.decision, "reject");
});

test("reject unreadable encoded document text in review candidates", () => {
  const result = evaluatePosterQuality({
    title: "[\uACF5\uACE0 \uC81C2026-1\uD638] \uC9C1\uC6D0 \uCC44\uC6A9\uACF5\uACE0",
    source_org_name: "\uB9C8\uD3EC\uBCF5\uC9C0\uC7AC\uB2E8",
    summary_short: "V20xYVJWWnNjRmxWZWtGNFQxaEJORlF5TlRSYWJHZDRUMVZHVUdKdWFFSmFhMUozVVZaU1dFOVhkR0ZYU0doQ1dtdG9ZV05HY0ZsYVJHaFFZbTVvY0ZscVNrZGxWbkJHWWtWV2JWSlZTVFJhUkU1clRUQXhObEpxYUZCaWJtZ3hXa1pqZUU5R1JrbGtNMmhQVmtkME5GcHJVbmRQUjA1SVVtMDFZVmRJYUVKYWExSkxUMFU1ZFdWSVNtRlhSM2gwV1Zaa1YyTXhjRWxsUlVadFUwaGpNbHByWkRCaVIxW",
    source_key: "https://www.mapowf.or.kr/main/sub.html?boardID=www31&Mode=view&num=1591",
    images: ["https://example.test/recruitment.jpg"],
  });

  assert.equal(result.decision, "reject");
  assert.ok(result.issues.some((issue) => issue.code === "encoded-or-binary-text"));
  assert.ok(result.issues.some((issue) => issue.code === "employment-recruitment-notice"));
});

test("pre-upload filter rejects retrospective news titles without action", () => {
  const result = getPostExclusionReason({
    title: "4\uC6D4 \uAC77\uAE30\uBAA8\uC784 \uC18C\uC2DD",
    content: "\uB9C8\uD3EC\uAD6C \uB178\uB3D9\uC790 \uAC77\uAE30\uBAA8\uC784 \uD65C\uB3D9 \uC0AC\uC9C4\uACFC \uD6C4\uAE30",
  });

  assert.equal(result?.rule, "retrospective-news-no-action");
});

test("pre-upload filter rejects news-board posts without action", () => {
  const result = getPostExclusionReason({
    title: "\uACBD\uBE44\uB178\uB3D9\uC790 \uAD50\uC721 \uBC0F \uD55C\uB9C8\uB2F9",
    content: "\uACBD\uBE44\uB178\uB3D9\uC790 \uAD50\uC721 \uBC0F \uD55C\uB9C8\uB2F9 \uD589\uC0AC \uC548\uB0B4",
    sourceUrl: "https://mapolabor.org/community/news/post?seq=369",
  });

  assert.equal(result?.rule, "news-board-without-action");
});

test("pre-upload filter keeps active recruitment despite news-like wording", () => {
  const result = getPostExclusionReason({
    title: "\uACBD\uBE44\uB178\uB3D9\uC790 \uAD50\uC721 \uCC38\uC5EC\uC790 \uBAA8\uC9D1 \uC18C\uC2DD",
    content: "2026\uB144 8\uC6D4 10\uC77C\uAE4C\uC9C0 \uC2E0\uCCAD \uC811\uC218\uD558\uBA70 \uCC38\uC5EC\uC790\uB97C \uBAA8\uC9D1\uD569\uB2C8\uB2E4.",
    sourceUrl: "https://mapolabor.org/community/news/post?seq=999",
  });

  assert.equal(result, null);
});

test("reject public safety guide images without recruitment action", () => {
  const result = evaluatePosterQuality({
    title: "\uC7A5\uB9C8\uCCA0 \uAC00\uC2A4\uC548\uC804\uAD00\uB9AC \uC694\uB839",
    source_org_name: "\uB9C8\uD3EC\uAD6C\uCCAD",
    summary_short: "\uC7A5\uB9C8\uCCA0 \uAC00\uC2A4\uC548\uC804\uAD00\uB9AC \uC694\uB839",
    source_key: "https://www.mapo.go.kr/site/main/board/notice/276453?bcId=notice",
    images: ["https://example.test/safety.png"],
  });

  assert.equal(result.decision, "reject");
  assert.ok(result.issues.some((issue) => issue.code === "public-safety-guide"));
});

test("pre-upload filter rejects public safety guide titles without action", () => {
  const result = getPostExclusionReason({
    title: "\uD589\uB77D\uCCA0 \uC774\uB3D9\uC2DD \uBD80\uD0C4\uC5F0\uC18C\uAE30 \uC548\uC804\uC0AC\uC6A9\uC694\uB839",
    content: "\uC548\uC804\uC0AC\uC6A9\uC694\uB839 \uC548\uB0B4",
    sourceUrl: "https://www.mapo.go.kr/site/main/board/notice/276454?bcId=notice",
  });

  assert.equal(result?.rule, "public-safety-guide");
});

test("keep public safety education recruitment", () => {
  const result = getPostExclusionReason({
    title: "\uC5EC\uB984\uCCA0 \uAC00\uC2A4\uC548\uC804 \uAD50\uC721 \uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    content: "2026\uB144 8\uC6D4 10\uC77C\uAE4C\uC9C0 \uC2E0\uCCAD \uC811\uC218\uD569\uB2C8\uB2E4.",
    sourceUrl: "https://www.mapo.go.kr/site/main/board/notice/999999?bcId=notice",
  });

  assert.equal(result, null);
});

test("keep the specific Youth Seoul title over a generic external page title", () => {
  assert.equal(
    choosePreferredDetailTitle(
      "\uC11C\uC6B8\uCCAD\uB144\uC13C\uD130 \uC591\uCC9C <\uC601\uD14C\uD06C \uD074\uB798\uC2A4> \uBAA8\uC9D1",
      "\uC11C\uC6B8\uCCAD\uB144\uC13C\uD130 \uC591\uCC9C \uBAA8\uC9D1",
    ),
    "\uC11C\uC6B8\uCCAD\uB144\uC13C\uD130 \uC591\uCC9C <\uC601\uD14C\uD06C \uD074\uB798\uC2A4> \uBAA8\uC9D1",
  );
});

for (const title of [
  "[마포구가족센터] 공고 제 2026-5호 마포구가족센터 직원 채용공고",
  "마포구가족센터 - 건강관리 교육 및 근력운동 프로그램 강사 모집(안내)",
  "[채용공고] 마포구고용복지지원센터 신규사업 실시에 따른 계약직 직원 채용 재공고",
  "2026년 제4회 마포문화재단 직원 채용 공고( ~ 7.10.(금) 18:00 한)",
  "통장 모집 공고(제7통)",
  "공중화장실 관리인 모집 공고",
]) {
  test(`reject non-poster recruitment notice: ${title}`, () => {
    const result = evaluatePosterQuality({
      title,
      source_org_name: "마포구",
      summary_short: "공식 홈페이지에 게시된 모집 및 채용 관련 행정 공고입니다.",
      source_key: `https://example.test/${encodeURIComponent(title)}`,
      images: ["https://example.test/poster.jpg"],
    });
    assert.equal(result.decision, "reject");
    assert.ok(result.issues.some((issue) => issue.code === "employment-recruitment-notice"));
  });
}

test("reject Taegeukgi administrative campaign attachment", () => {
  const result = evaluatePosterQuality({
    title: "제107주년 삼일절 나라사랑 태극기 달기운동",
    source_org_name: "마포구",
    summary_short: "국경일을 맞아 각 가정에서 태극기를 게양해 주시기 바랍니다.",
    source_key: "https://example.test/taegeukgi",
    images: ["https://example.test/attachment.jpg"],
  });
  assert.equal(result.decision, "reject");
  assert.ok(result.issues.some((issue) => issue.code === "administrative-campaign-attachment"));
});

test("do not reject a recruitment title because shared detail text contains an event schedule", () => {
  const result = getPostExclusionReason({
    title: "2026 마포구민 노래자랑 참가신청 공고",
    content: "문화원 공통 메뉴 상상마당 밴드존 행사 일정 8.1 ~ 8.31",
    collectionSourceSlug: "mapo-culture",
  });
  assert.equal(result, null);
});

test("reject a street event schedule when the schedule is the title itself", () => {
  const result = getPostExclusionReason({
    title: "상상마당 밴드존 행사 일정 8.1 ~ 8.31",
    collectionSourceSlug: "mapo-culture",
  });
  assert.equal(result?.rule, "street-event-schedule");
});

test("reject recruitment screening schedule follow-up notices", () => {
  const result = getPostExclusionReason({
    title: "2026년 마포구립예술단 단원 추가모집 심사 일정 공고",
    collectionSourceSlug: "mfac",
  });
  assert.equal(result?.rule, "recruitment-screening-schedule");
});

test("do not reject a participant recruitment because shared detail text contains a timetable", () => {
  const result = getPostExclusionReason({
    title: "2026 전통성년식 개최 및 참가 학생 모집",
    content: "문화원 공통 메뉴 2026년 3분기 문화학교 시간표",
    collectionSourceSlug: "mapo-culture",
  });
  assert.equal(result, null);
});

test("do not reject a participant recruitment because shared detail text contains a monthly calendar", () => {
  const result = getPostExclusionReason({
    title: "2026 전통성년식 개최 및 참가 학생 모집",
    content: "문화원 공통 메뉴 7월 프로그램 안내 캘린더",
    collectionSourceSlug: "mapo-culture",
  });
  assert.equal(result, null);
});

test("do not reject a recruitment title because shared detail text contains a web accessibility mark", () => {
  const result = getPostExclusionReason({
    title: "과학기술정보통신부 2026년 AI 글래스 개발자 아카데미 교육생 모집",
    content: "하단 공통 영역 웹 접근성 품질 인증 마크",
    collectionSourceSlug: "youth-seoul",
  });
  assert.equal(result, null);
});

test("do not reject active recruitment because shared detail text mentions homepage parking", () => {
  const result = evaluatePosterQuality({
    title: "\uCC38\uC5EC\uC790 \uBAA8\uC9D1 \uBBF8\uB514\uC5B4 \uAD50\uC721",
    source_org_name: "\uAC15\uC11C\uB274\uBBF8\uB514\uC5B4\uC9C0\uC6D0\uC13C\uD130",
    summary_short: "\uC120\uCC29\uC21C \uC2E0\uCCAD\uC73C\uB85C \uCC38\uC5EC\uC790\uB97C \uBAA8\uC9D1\uD558\uB294 \uBBF8\uB514\uC5B4 \uAD50\uC721 \uD504\uB85C\uADF8\uB7A8",
    content: "\uD648\uD398\uC774\uC9C0 \uC8FC\uCC28\uC7A5 \uC774\uC6A9 \uC548\uB0B4",
    source_key: "https://example.test/program",
    images: ["https://example.test/poster.jpg"],
  });

  assert.notEqual(result.decision, "reject");
  assert.equal(result.issues.some((issue) => issue.code === "parking-or-homepage"), false);
});

test("reject parking notices even when they are readable", () => {
  const result = evaluatePosterQuality({
    title: "\uC8FC\uCC28\uC7A5 \uC774\uC6A9 \uC81C\uD55C \uC548\uB0B4",
    source_org_name: "\uB9C8\uD3EC\uAD6C\uCCB4\uC721\uC13C\uD130",
    summary_short: "\uC2DC\uC124 \uC8FC\uCC28\uC7A5 \uC774\uC6A9 \uC81C\uD55C \uC548\uB0B4\uC785\uB2C8\uB2E4",
    content: "\uD648\uD398\uC774\uC9C0 \uC8FC\uCC28\uC7A5 \uC774\uC6A9 \uC548\uB0B4",
    source_key: "https://example.test/notice",
    images: ["https://example.test/notice.jpg"],
  });

  assert.equal(result.decision, "reject");
  assert.equal(result.issues.some((issue) => issue.code === "parking-or-homepage"), true);
});

test("do not reject job-linked education as an employment notice", () => {
  const result = evaluatePosterQuality({
    title: "\uD55C\uAD6D\uC18C\uD504\uD2B8\uC6E8\uC5B4\uAE30\uC220\uC9C4\uD765\uD611\uD68C <\uCC44\uC6A9\uC5F0\uACC4\uD615 2026\uB144\uB3C4 \uD558\uBC18\uAE30 SW\uD480\uC2A4\uD0DD \uAC1C\uBC1C\uC790 \uAD50\uC721\uC0DD> \uBAA8\uC9D1",
    source_org_name: "\uD55C\uAD6D\uC18C\uD504\uD2B8\uC6E8\uC5B4\uAE30\uC220\uC9C4\uD765\uD611\uD68C",
    summary_short: "\uAD6C\uC9C1\uC790 \uB300\uC0C1 SW \uAC1C\uBC1C\uC790 \uAD50\uC721\uC0DD \uBAA8\uC9D1 \uD504\uB85C\uADF8\uB7A8",
    source_key: "https://example.test/sw-course",
    images: ["https://example.test/sw-course.jpg"],
  });

  assert.notEqual(result.decision, "reject");
  assert.equal(result.issues.some((issue) => issue.code === "employment-recruitment-notice"), false);
});

test("do not reject job coaching programs because details mention hiring staff", () => {
  const result = evaluatePosterQuality({
    title: "\uB3D9\uB300\uBB38\uAD6C\uCCAD <2026 \uB3D9\uB300\uBB38\uAD6C \uCDE8\uCC3D\uC5C5\uC544\uCE74\uB370\uBBF8 - \uCDE8\uC5C5\uD2B9\uAC15 & \uBA58\uD1A0\uB9C1>",
    source_org_name: "\uB3D9\uB300\uBB38\uAD6C\uCCAD",
    summary_short: "\uCDE8\uC5C5\uD2B9\uAC15\uACFC \uC11C\uB958 \uBA74\uC811 \uBA58\uD1A0\uB9C1 \uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    content: "\uCC44\uC6A9\uB2F4\uB2F9\uC790\uC640 \uD568\uAED8\uD558\uB294 \uC774\uB825\uC11C \uD2B9\uAC15",
    source_key: "https://example.test/job-coaching",
    images: ["https://example.test/job-coaching.jpg"],
  });

  assert.notEqual(result.decision, "reject");
  assert.equal(result.issues.some((issue) => issue.code === "employment-recruitment-notice"), false);
});

test("do not reject education support projects because shared detail text mentions parking", () => {
  const result = evaluatePosterQuality({
    title: "\uC11C\uC6B8\uBB38\uD654\uC608\uC220\uAD50\uC721 \uC9C0\uC6D0\uC0AC\uC5C5 <\uC6B0\uB9AC\uB4E4\uC758 \uB0AF\uC120 \uC11C\uC6B8>",
    source_org_name: "\uCCAD\uB144\uBABD\uB545\uC815\uBCF4\uD1B5",
    summary_short: "\uBB38\uD654\uC608\uC220\uAD50\uC721 \uC9C0\uC6D0\uC0AC\uC5C5 \uC0C1\uC138 \uC548\uB0B4",
    content: "\uD648\uD398\uC774\uC9C0 \uC8FC\uCC28\uC7A5 \uC774\uC6A9 \uC548\uB0B4",
    source_key: "https://example.test/art-education",
    images: ["https://example.test/art-education.jpg"],
  });

  assert.notEqual(result.decision, "reject");
  assert.equal(result.issues.some((issue) => issue.code === "parking-or-homepage"), false);
});

for (const title of [
  "[2026 마포구민노래자랑] 본선 진출자 공지",
  "2025 삼개시낭송경연대회 본선 진출 대상자 안내",
  "2026 정월대보름 민속놀이 행사 취소 알림",
  "[2026 마포구민노래자랑] 시상부문 내용 변경 안내",
]) {
  test(`reject result or cancellation follow-up: ${title}`, () => {
    assert.ok(getPostExclusionReason({ title, collectionSourceSlug: "mapo-culture" }));
  });
}

test("reject a past-year event title without active recruitment wording", () => {
  const result = getPostExclusionReason({ title: "2025 삼개시낭송경연대회" });
  assert.equal(result?.rule, "stale-year-event-title");
});

for (const title of [
  "[소식] 마포청소년문화의집, 사회정서프로그램 '마음CONNECT'운영(2026. 06. 13.)",
  "[소식] 서울 마포청소년문화의집, AI부터 UAM까지… 미래기술 직업체험 운영(2026. 07. 06.)",
  "제8대 마포문화원장 모집 공고",
  "통장 모집 공고(제11통, 제13통)",
  "18통장 모집 공고",
  "제1193호 주간구인정보",
  "국민투표 국외부재자신고 접수 전자우편 주소 공고",
  "전입신고에 따른 선거일투표소 안내",
  "구립마포청소년문화의집, 보훈문화 확산 공로로 감사패 수상(2026.06.14.)",
]) {
  test(`reject administrative news or head recruitment: ${title}`, () => {
    assert.ok(getPostExclusionReason({ title }));
  });
}
