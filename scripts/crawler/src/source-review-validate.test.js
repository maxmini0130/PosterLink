import test from "node:test";
import assert from "node:assert/strict";
import { quoteFoundIn, validateProposal } from "./source-review-validate.js";
import { normalizeProposal } from "./source-review-proposal.js";
import { buildSnapshot } from "./source-review-apply.js";
import {
  applyLinkCandidates,
  googleFormText,
  pageTextFromHtml,
  readableUrl,
} from "./source-review-fetch.js";

const CATEGORY = "deadd486-c24a-4831-b5b0-59308e600d29";
const YOUTH = "93cac6ad-69df-414a-9eba-983d03292e30";
const CHILD = "bde3d1fe-3190-4e85-8c5e-4136fa2fb8a0";
const NOW = Date.parse("2026-11-27T12:00:00+09:00");
const CORPUS = [
  "중랑구립정보도서관 특별 고전인문 강연",
  "신청기간 : 2026. 11. 25.(수) 10:00 ~ 12. 8.(화) 23:00",
  "대상 : 지역주민 (전 연령)",
].join("\n");

function row(overrides = {}) {
  return {
    id: "p1",
    poster_status: "review",
    organizer_name: "중랑구립정보도서관",
    thumbnail_url: "https://img/poster.jpg",
    field_verification: {},
    poster_links: [
      {
        id: "l1",
        url: "https://youth.seoul.go.kr/view?id=1",
        link_type: "official_notice",
        is_primary: true,
        title: "원문",
      },
      {
        id: "l2",
        url: "https://other.example/apply",
        link_type: "official_apply",
        is_primary: false,
        title: "신청",
      },
    ],
    poster_images: [
      { id: "i1", storage_path: "https://img/poster.jpg" },
      { id: "i2", storage_path: "https://img/logo.png" },
    ],
    poster_audiences: [{ audience_id: YOUTH }],
    ...overrides,
  };
}

function proposal(overrides = {}) {
  const base = {
    id: "p1",
    decision: "published",
    confidence: 0.95,
    reason: "도서관 신청 페이지에서 기간을 확인했습니다",
    resolution: "제목 정리",
    evidence: [
      {
        field: "application_end_at",
        quote: "12. 8.(화) 23:00",
        source_url: "u",
        from: "text",
      },
      {
        field: "eligibility_summary",
        quote: "대상 : 지역주민 (전 연령)",
        source_url: "u",
        from: "text",
      },
    ],
    imageReview: { isPoster: true, note: "강연 포스터" },
    patch: {
      title: "중랑구립정보도서관<특별 고전인문 강연>",
      organizer_name: "중랑구립정보도서관",
      application_organization_name: null,
      application_start_at: "2026-11-25T10:00:00+09:00",
      application_end_at: "2026-12-08T23:00:00+09:00",
      event_start_at: "2026-12-09T10:30:00+09:00",
      event_end_at: "2026-12-09T12:00:00+09:00",
      deadline_type: "until_exhausted",
      eligibility_summary: "지역주민 (전 연령)",
      target_age_min: null,
      target_age_max: null,
      application_method: "도서관 홈페이지 신청",
      event_location: null,
      contact_info: null,
      participation_fee: null,
      required_documents: null,
      recruitment_count: "200명",
      benefits_summary: null,
      summary_short: "중랑구립정보도서관이 고전 강연을 엽니다.",
      summary_long:
        "중랑구립정보도서관이 고전 강연을 엽니다.\n\n대상: 지역주민",
      category_id: CATEGORY,
    },
    deadline: {
      deadline_status: "verified",
      deadline_source: "apply_page",
      deadline_time_verified: true,
      deadline_note: null,
    },
    removeLinks: [],
    linkPatches: [],
    addLinks: [],
    removeImages: [],
    removeAudiences: [],
    addAudiences: [],
    closedReason: null,
    rejection_reason: null,
    heldReason: null,
    duplicateJudgement: null,
    uncertainties: [],
  };
  return {
    ...base,
    ...overrides,
    patch: { ...base.patch, ...(overrides.patch ?? {}) },
    deadline: { ...base.deadline, ...(overrides.deadline ?? {}) },
  };
}

function run(p, r = row(), extra = {}) {
  return validateProposal({
    row: r,
    proposal: p,
    corpus: CORPUS,
    readableSources: 1,
    nowMs: NOW,
    categoryIds: new Set([CATEGORY]),
    audienceIds: new Set([YOUTH, CHILD]),
    ...extra,
  });
}

const codes = (result) => result.violations.map((v) => v.code);
const riskCodes = (result) => result.risks.map((r) => r.code);

test("a sourced proposal passes without violations or risks", () => {
  const result = run(proposal());
  assert.deepEqual(codes(result), []);
  assert.deepEqual(riskCodes(result), []);
});

test("quotes match the source ignoring spaces", () => {
  assert.equal(quoteFoundIn("신청기간:2026.11.25.(수)10:00", CORPUS), true);
  assert.equal(quoteFoundIn("12월 31일까지", CORPUS), false);
  assert.equal(
    quoteFoundIn("대상", CORPUS),
    false,
    "too short to prove anything",
  );
});

test("evidence the sources do not contain blocks applying", () => {
  const p = proposal({
    evidence: [
      {
        field: "application_end_at",
        quote: "12월 20일 18:00 마감",
        source_url: "u",
        from: "text",
      },
    ],
  });
  assert.ok(codes(run(p)).includes("evidence-not-in-source"));
});

test("image evidence applies but is listed for a person", () => {
  const p = proposal({
    evidence: [
      ...proposal().evidence,
      {
        field: "contact_info",
        quote: "02-1234-5678",
        source_url: "img",
        from: "image",
      },
    ],
  });
  const result = run(p);
  assert.deepEqual(codes(result), []);
  assert.ok(riskCodes(result).includes("image-evidence"));
});

test("the youth portal 00:00 is never a verified deadline time", () => {
  const p = proposal({
    patch: { application_end_at: "2026-12-08T00:00:00+09:00" },
  });
  assert.ok(codes(run(p)).includes("portal-midnight"));
});

test("a date-only verified deadline must be stored at 23:59:59", () => {
  const p = proposal({
    patch: { application_end_at: "2026-12-08T00:00:00+09:00" },
    deadline: { deadline_time_verified: false },
  });
  assert.ok(codes(run(p)).includes("date-only-not-end-of-day"));
  const ok = proposal({
    patch: { application_end_at: "2026-12-08T23:59:59+09:00" },
    deadline: { deadline_time_verified: false },
  });
  assert.deepEqual(codes(run(ok)), []);
});

test("timestamps must carry the Seoul offset", () => {
  const p = proposal({ patch: { application_end_at: "2026-12-08T14:00:00Z" } });
  assert.ok(codes(run(p)).includes("bad-date-format"));
});

test("a passed deadline cannot be published", () => {
  const past = {
    application_start_at: "2026-11-09T00:00:00+09:00",
    application_end_at: "2026-11-19T23:59:59+09:00",
  };
  const p = proposal({
    patch: past,
    deadline: { deadline_time_verified: false },
  });
  assert.ok(codes(run(p)).includes("published-but-expired"));
  const closed = proposal({
    decision: "closed",
    patch: past,
    deadline: { deadline_time_verified: false },
  });
  assert.deepEqual(codes(run(closed)), []);
});

test("closing before the deadline needs a reason from the source", () => {
  const p = proposal({ decision: "closed" });
  assert.ok(codes(run(p)).includes("closed-without-reason"));
  assert.deepEqual(
    codes(
      run(
        proposal({
          decision: "closed",
          closedReason: "신청 페이지 '선착순 마감'",
        }),
      ),
    ),
    [],
  );
});

test("unknown and ongoing deadlines have no end date; fixed needs one", () => {
  assert.ok(
    codes(run(proposal({ patch: { deadline_type: "unknown" } }))).includes(
      "open-type-with-end",
    ),
  );
  const fixed = proposal({
    patch: { deadline_type: "fixed", application_end_at: null },
    deadline: {
      deadline_status: "unverified",
      deadline_source: null,
      deadline_time_verified: false,
    },
  });
  assert.ok(codes(run(fixed)).includes("fixed-without-end"));
});

test("portal names and 기타 placeholders are not organizers", () => {
  for (const name of ["기타 (성북구청 일자리정책과)", "청년몽땅정보통"]) {
    assert.ok(
      codes(run(proposal({ patch: { organizer_name: name } }))).includes(
        "placeholder-organizer",
      ),
      name,
    );
  }
});

test("exactly one primary link must remain", () => {
  const two = proposal({
    linkPatches: [{ id: "l2", patch: { is_primary: true } }],
  });
  assert.ok(codes(run(two)).includes("primary-link-count"));
  const none = proposal({ removeLinks: ["l1"] });
  assert.ok(codes(run(none)).includes("primary-link-count"));
  const swapped = proposal({
    linkPatches: [
      { id: "l1", patch: { is_primary: false } },
      { id: "l2", patch: { is_primary: true } },
    ],
  });
  assert.deepEqual(codes(run(swapped)), []);
});

test("links that do not exist or duplicate a URL are refused", () => {
  assert.ok(
    codes(run(proposal({ removeLinks: ["nope"] }))).includes("unknown-link"),
  );
  const dup = proposal({
    addLinks: [
      {
        title: "신청",
        link_type: "official_apply",
        url: "https://other.example/apply",
        is_primary: false,
      },
    ],
  });
  assert.ok(codes(run(dup)).includes("duplicate-link-url"));
});

test("the kept thumbnail stays attached and must be a poster", () => {
  assert.ok(
    codes(run(proposal({ removeImages: ["i1"] }))).includes(
      "thumbnail-removed",
    ),
  );
  assert.ok(
    codes(
      run(proposal({ patch: { thumbnail_url: "https://img/elsewhere.jpg" } })),
    ).includes("thumbnail-not-attached"),
  );
  assert.ok(
    codes(
      run(proposal({ imageReview: { isPoster: false, note: "로고" } })),
    ).includes("thumbnail-not-poster"),
  );
  const replaced = run(
    proposal({
      patch: { thumbnail_url: "https://img/logo.png" },
      removeImages: ["i1"],
    }),
  );
  assert.deepEqual(codes(replaced), []);
  assert.ok(riskCodes(replaced).includes("thumbnail-replaced"));
});

test("a ticket sale notice can be rejected and is listed for a person", () => {
  const p = proposal({
    decision: "rejected",
    rejection_reason: "유료 공연 티켓 판매 안내로 모집이 아님",
    patch: {},
  });
  const result = run(p);
  assert.deepEqual(codes(result), []);
  assert.ok(riskCodes(result).includes("rejected"));
});

test("confidence gates applying and marks borderline proposals", () => {
  assert.ok(
    codes(run(proposal({ confidence: 0.8 }))).includes("low-confidence"),
  );
  const borderline = run(proposal({ confidence: 0.88 }));
  assert.deepEqual(codes(borderline), []);
  assert.ok(riskCodes(borderline).includes("medium-confidence"));
});

test("a person's confirmed judgment and earlier automatic writes are never overwritten", () => {
  assert.ok(
    codes(
      run(
        proposal(),
        row({
          field_verification: { humanStructuredVerification: { at: "x" } },
        }),
      ),
    ).includes("human-verified"),
  );
  assert.ok(
    codes(
      run(
        proposal(),
        row({ field_verification: { sourceReviewWriteInProgress: "run" } }),
      ),
    ).includes("previous-write"),
  );
  assert.ok(
    codes(run(proposal(), row(), { qualityGateHold: true })).includes(
      "quality-gate-hold",
    ),
  );
});

test("without a readable source nothing is applied", () => {
  assert.ok(
    codes(run(proposal(), row(), { readableSources: 0 })).includes(
      "no-readable-source",
    ),
  );
});

test("a model hold stays in review", () => {
  assert.ok(
    codes(
      run(proposal({ decision: "held", heldReason: "마감일 충돌" })),
    ).includes("model-held"),
  );
});

test("audience changes use known ids and are listed for a person", () => {
  assert.ok(
    codes(run(proposal({ addAudiences: [YOUTH] }))).includes("bad-audience"),
  );
  const changed = run(
    proposal({ removeAudiences: [YOUTH], addAudiences: [CHILD] }),
  );
  assert.deepEqual(codes(changed), []);
  assert.ok(riskCodes(changed).includes("audiences-changed"));
});

test("unverified published deadlines and uncertainties are risks, not blockers", () => {
  const p = proposal({
    patch: { application_end_at: "2026-12-05T22:00:00+09:00" },
    deadline: {
      deadline_status: "unverified",
      deadline_source: null,
      deadline_time_verified: false,
    },
    uncertainties: ["네이버 폼 마감 설정을 확인하지 못함"],
  });
  const result = run(p);
  assert.deepEqual(codes(result), []);
  assert.ok(riskCodes(result).includes("deadline-unverified"));
  assert.ok(riskCodes(result).includes("uncertainties"));
});

test("normalizeProposal keeps only changed link attributes and drops an unchanged thumbnail", () => {
  const p = normalizeProposal({
    ...proposal(),
    patch: { ...proposal().patch, thumbnail_url: null },
    linkPatches: [
      {
        id: "l1",
        title: null,
        link_type: "other",
        url: null,
        is_primary: false,
      },
    ],
    closedReason: undefined,
  });
  assert.equal("thumbnail_url" in p.patch, false);
  assert.deepEqual(p.linkPatches, [
    { id: "l1", patch: { link_type: "other", is_primary: false } },
  ]);
  assert.equal(
    p.closedReason,
    null,
    "stored JSON keeps the key (the 11/27 replay failure)",
  );
});

test("the snapshot keeps what a revert needs", () => {
  const r = row({
    title: "old",
    poster_categories: [{ category_id: CATEGORY }],
  });
  const p = proposal({
    removeLinks: ["l2"],
    linkPatches: [{ id: "l1", patch: { title: "공고 원문" } }],
    removeImages: ["i2"],
  });
  const snap = buildSnapshot(r, p);
  assert.equal(snap.poster.title, "old");
  assert.equal(snap.poster.poster_status, "review");
  assert.deepEqual(
    snap.removedLinks.map((l) => l.id),
    ["l2"],
  );
  assert.deepEqual(snap.patchedLinks, [
    { id: "l1", previous: { title: "원문" } },
  ]);
  assert.deepEqual(
    snap.removedImages.map((i) => i.id),
    ["i2"],
  );
  assert.deepEqual(snap.audiences, [YOUTH]);
  assert.deepEqual(snap.categories, [CATEGORY]);
});

test("page text drops navigation and finds application links", () => {
  const html = `<html><head><title>공고</title></head><body><nav>메뉴 홈 소개</nav>
    <div>신청기간 : 11/26 ~ 12/2</div><p>대상: 성인</p>
    <a href="/apply/1">신청하러 가기</a><a href="https://forms.gle/abc">폼</a><a href="#top">위로</a>
    <footer>저작권</footer></body></html>`;
  const { title, text, $ } = pageTextFromHtml(html);
  assert.equal(title, "공고");
  assert.match(text, /신청기간 : 11\/26 ~ 12\/2/);
  assert.doesNotMatch(text, /메뉴|저작권/);
  assert.deepEqual(
    applyLinkCandidates($, "https://site.example/notice/9").map((l) => l.url),
    ["https://site.example/apply/1", "https://forms.gle/abc"],
  );
});

test("only high-level risks put a poster on the post-check list", async () => {
  const { buildReviewRecord } = await import("./source-review-apply.js");
  const meta = {
    version: "v",
    model: "m",
    todayKst: "2026-11-27",
    sources: [],
  };
  const low = run(
    proposal({
      patch: { organizer_name: "중랑구 정보도서관" },
      uncertainties: ["참가비 미기재"],
    }),
  );
  assert.ok(low.risks.length > 0 && low.risks.every((r) => r.level === "low"));
  assert.equal(
    buildReviewRecord({
      row: row(),
      proposal: proposal(),
      validation: low,
      meta,
      reviewedAt: "t",
    }).needsPostCheck,
    false,
  );

  const dup = run(proposal({ duplicateJudgement: "다른 시간대 회차" }), row(), {
    hadDuplicateCandidates: true,
  });
  assert.ok(
    dup.risks.some((r) => r.code === "duplicate-judged" && r.level === "high"),
  );
  const record = buildReviewRecord({
    row: row(),
    proposal: proposal(),
    validation: dup,
    meta,
    reviewedAt: "t",
  });
  assert.equal(record.needsPostCheck, true);
  assert.deepEqual(record.postCheck, { status: "pending" });
});

test("a deadline read only from the poster image is a high risk", () => {
  const p = proposal({
    evidence: [
      {
        field: "eligibility_summary",
        quote: "대상 : 지역주민 (전 연령)",
        source_url: "u",
        from: "text",
      },
      {
        field: "application_end_at",
        quote: "12/8(화) 23시",
        source_url: "img",
        from: "image",
      },
    ],
  });
  const result = run(p);
  assert.deepEqual(codes(result), []);
  assert.ok(
    result.risks.some(
      (r) => r.code === "image-date-evidence" && r.level === "high",
    ),
  );
});

test("a Naver blog post is read from its PostView page, other URLs stay", () => {
  assert.equal(
    readableUrl("https://blog.naver.com/jnfac_official/224493585455"),
    "https://blog.naver.com/PostView.naver?blogId=jnfac_official&logNo=224493585455",
  );
  assert.equal(
    readableUrl("https://youth.seoul.go.kr/view.do?id=1"),
    "https://youth.seoul.go.kr/view.do?id=1",
  );
});

test("Google Form text comes from the form's load data", () => {
  const html = `<script>var FB_PUBLIC_LOAD_DATA_ = [null,["만 19~39세 청년 대상입니다",[[1,"성함",null,0]],null,null,"https://x.example/img"],"/forms"];</script>`;
  const text = googleFormText(html);
  assert.match(text, /만 19~39세 청년 대상입니다/);
  assert.match(text, /성함/);
  assert.doesNotMatch(text, /https:\/\//);
  assert.equal(googleFormText("<html>no form</html>"), "");
});
