import assert from "node:assert/strict";
import test from "node:test";

import {
  bestEvidenceByField,
  evaluateGoldenSet,
  valuesMatch,
} from "./extraction-eval.js";

test("valuesMatch compares dates, numbers, URLs, and grounded text", () => {
  assert.equal(valuesMatch("deadline_date", "2026년 8월 31일", "2026-08-31"), true);
  assert.equal(valuesMatch("age_min", "만 18세", 18), true);
  assert.equal(valuesMatch("official_url", "https://posterlink.kr/", "https://posterlink.kr"), true);
  assert.equal(valuesMatch("benefit", "이수 시 참여수당 50만원 지급", "참여수당 50만원"), true);
  assert.equal(valuesMatch("benefit", "교육비 무료", "참여수당 50만원"), false);
});

test("valuesMatch compares deadline ranges by their end date", () => {
  assert.equal(valuesMatch("deadline_date", "2026-08-18 ~ 2026-08-27", "2026-08-27"), true);
  assert.equal(
    valuesMatch("deadline_date", "2026. 8. 19.(wed) ~ 8. 23.(sun)", "2026-08-23"),
    true,
  );
});

test("valuesMatch treats missing deadline type as unknown when labeled unknown", () => {
  assert.equal(valuesMatch("deadline_type", null, "unknown"), true);
  assert.equal(valuesMatch("deadline_type", "", "unknown"), true);
  assert.equal(valuesMatch("deadline_type", "fixed", "unknown"), false);
});

test("valuesMatch ignores non-identifying URL query params", () => {
  assert.equal(
    valuesMatch(
      "official_url",
      "https://culture.mapo.go.kr/site/yonggang/board/townnews/4882?cp=1&sortOrder=BA_REGDATE&sortDirection=DESC&listType=list&bcId=townnews&baNotice=false&baCommSelec=false&baOpenDay=false&baUse=true",
      "https://culture.mapo.go.kr/site/yonggang/board/townnews/4882?bcId=townnews",
    ),
    true,
  );
  assert.equal(
    valuesMatch(
      "official_url",
      "https://1in.seoul.go.kr/front/partcptn/partcptnView.do?CSRF_TOKEN=abc&miv_pageNo=1&miv_pageSize=10&total_cnt=&LISTOP=list&mode=W&partcptn_id=d7cc&p_ty=&p_atdrc=1150000000&p_atdrc_nm=&p_se=SC01&p_agrde=AG01&p_sexdstn=F%2CM&p_face=Y%",
      "https://1in.seoul.go.kr/front/partcptn/partcptnView.do?CSRF_TOKEN=xyz&LISTOP=list&miv_pageNo=2&miv_pageSize=15&mode=W&p_agrde=AG01&p_atdrc=1150000000&p_face=Y%25&p_se=SC01&p_sexdstn=F%2CM&partcptn_id=d7cc",
    ),
    true,
  );
});

test("valuesMatch keeps different source identifiers distinct", () => {
  assert.equal(
    valuesMatch(
      "official_url",
      "https://www.yongsan.go.kr/portal/bbs/B0000042/view.do?nttId=766959&menuNo=200229&pageUnit=10&pageIndex=1",
      "https://www.yongsan.go.kr/portal/bbs/B0000042/view.do?menuNo=200229&nttId=766960&pageUnit=10",
    ),
    false,
  );
});

test("bestEvidenceByField keeps the highest confidence evidence per field", () => {
  const best = bestEvidenceByField([
    { field_key: "deadline_date", confidence: 0.4, value_text: "2026-08-30" },
    { field_key: "deadline_date", confidence: 0.8, value_text: "2026-08-31" },
  ]);

  assert.equal(best.get("deadline_date").value_text, "2026-08-31");
});

test("bestEvidenceByField prioritizes golden corrections over automated deadline evidence", () => {
  const best = bestEvidenceByField([
    {
      field_key: "deadline_type",
      value_json: { type: "fixed" },
      confidence: 0.95,
      evidence_text: "선착순 마감",
      extractor: "deadline-type-rule-v2",
    },
    {
      field_key: "deadline_type",
      value_json: { type: "until_exhausted" },
      confidence: 0.6,
      evidence_text: "검수 확정: 예산 소진 시까지 신청 가능",
      extractor: "golden-correction-v1",
    },
  ]);

  assert.equal(best.get("deadline_type").value_json.type, "until_exhausted");
  assert.equal(best.get("deadline_type").confidence, 1);
});

test("bestEvidenceByField ignores suppressed zero-confidence evidence", () => {
  const best = bestEvidenceByField([
    { field_key: "deadline_date", confidence: 0, value_text: "2026-08-30" },
  ]);

  assert.equal(best.has("deadline_date"), false);
});

test("evaluateGoldenSet reports field accuracy, precision, coverage, and thresholds", () => {
  const report = evaluateGoldenSet(
    [
      {
        poster_id: "poster-1",
        truth: {
          deadline_date: "2026-08-31",
          host_org: "서울청년센터",
          benefit: "참여수당 50만원",
        },
      },
      {
        poster_id: "poster-2",
        truth: {
          deadline_date: "2026-09-01",
          benefit: null,
        },
      },
    ],
    [
      {
        poster_id: "poster-1",
        field_key: "deadline_date",
        value_json: { date: "2026-08-31" },
        confidence: 0.95,
        evidence_text: "신청기간 8월 31일까지",
        extractor: "regex-date-v1",
      },
      {
        poster_id: "poster-1",
        field_key: "host_org",
        value_text: "서울청년센터 동대문",
        confidence: 0.9,
        evidence_text: "서울청년센터 동대문",
        extractor: "field-verifier-v1",
      },
      {
        poster_id: "poster-1",
        field_key: "benefit",
        value_text: "참여수당 50만원",
        confidence: 0.7,
        evidence_text: "참여수당 50만원",
        extractor: "readable-notice-v1",
      },
      {
        poster_id: "poster-2",
        field_key: "deadline_date",
        value_json: { date: "2026-09-02" },
        confidence: 0.8,
        evidence_text: "9월 2일까지",
        extractor: "regex-date-v1",
      },
      {
        poster_id: "poster-2",
        field_key: "benefit",
        value_text: "무료 교육",
        confidence: 0.6,
        evidence_text: "무료 교육",
        extractor: "readable-notice-v1",
      },
    ],
  );

  assert.equal(report.labeled_posters, 2);
  assert.equal(report.labeled_field_count, 5);
  assert.equal(report.field_metrics.deadline_date.labeled, 2);
  assert.equal(report.field_metrics.deadline_date.correct, 1);
  assert.equal(report.field_metrics.deadline_date.thresholds["0.90"].precision, 1);
  assert.equal(report.field_metrics.deadline_date.thresholds["0.90"].coverage, 0.5);
  assert.equal(report.field_metrics.benefit.false_positive, 1);
  assert.equal(report.field_metrics.benefit.hallucination_rate, 0.5);
});
