import assert from "node:assert/strict";
import test from "node:test";

import {
  planPoster,
  summarize,
  toPlanRow,
  withRecordedEligibility,
} from "./region-basis-backfill.js";

const SEOUL = "11111111-1111-4111-8111-111111111111";
const gu = (name, code, basis = null) => ({
  region_id: `id-${code}`,
  code,
  name,
  level: "sigungu",
  basis,
});

const row = (extra) =>
  toPlanRow({
    id: "p1",
    title: "t",
    organizer_name: "서울청년센터 강서",
    links: [gu("강서구", "REG_SEOUL_GANGSEO")],
    ...extra,
  });

test("서울-wide: adds the 서울 link and a place basis for the 구 link", () => {
  const plan = planPoster(
    row({
      eligibility_summary: "만 19 ~ 39세 서울특별시 권역 청년 10명",
      event_location: "서울청년센터 강서 (강서구 공항대로)",
    }),
    { seoulRegionId: SEOUL },
  );
  assert.equal(plan.kind, "seoul_wide");
  assert.equal(plan.group, "seoul_affiliate");
  assert.deepEqual(
    plan.actions.map((a) => [a.op, a.code, a.basis]),
    [
      ["insert", "REG_SEOUL", "eligibility"],
      ["set_basis", "REG_SEOUL_GANGSEO", "venue"],
      ["record", "field_verification.cardFacts.regionEligibility", undefined],
    ],
  );
  assert.equal(plan.actions[0].region_id, SEOUL);
});

test("구 residents only: marks that 구 link, adds nothing", () => {
  const plan = planPoster(
    row({
      organizer_name: "금천구청",
      eligibility_summary: "금천구 주민",
      links: [gu("금천구", "REG_SEOUL_GEUMCHEON")],
    }),
    { seoulRegionId: SEOUL },
  );
  assert.equal(plan.kind, "gu_restricted");
  assert.deepEqual(
    plan.actions.map((a) => [a.op, a.code, a.basis]),
    [
      ["set_basis", "REG_SEOUL_GEUMCHEON", "eligibility"],
      ["record", "field_verification.cardFacts.regionEligibility", undefined],
    ],
  );
});

test("a basis already set is never overwritten", () => {
  const plan = planPoster(
    row({
      eligibility_summary: "서울시 거주 청년",
      links: [gu("강서구", "REG_SEOUL_GANGSEO", "venue")],
    }),
    { seoulRegionId: SEOUL },
  );
  assert.deepEqual(
    plan.actions.map((a) => a.op),
    ["insert", "record"],
  );
});

test("undecided kinds, people-only cases and other posters are left alone", () => {
  const preferred = planPoster(
    row({ eligibility_summary: "39세 이하 청년 누구나, 송파구민 우대" }),
    { seoulRegionId: SEOUL },
  );
  assert.equal(preferred.kind, "gu_preferred");
  assert.equal(preferred.skipped, "kind_not_chosen");
  assert.deepEqual(preferred.actions, []);
  const chosen = planPoster(
    row({ eligibility_summary: "39세 이하 청년 누구나, 송파구민 우대" }),
    {
      seoulRegionId: SEOUL,
      kinds: ["seoul_wide", "gu_restricted", "gu_preferred"],
    },
  );
  assert.equal(chosen.actions[0].op, "insert");
  const review = planPoster(
    row({ eligibility_summary: "성북구민 및 방문객 누구나" }),
    { seoulRegionId: SEOUL },
  );
  assert.equal(review.skipped, "needs_person");
  const scoped = planPoster(
    row({
      organizer_name: "동작구가족센터",
      eligibility_summary: "서울시 생활권 1인가구",
    }),
    {
      seoulRegionId: SEOUL,
      scope: "seoul-affiliates",
    },
  );
  assert.equal(scoped.kind, "seoul_wide");
  assert.equal(scoped.skipped, "out_of_scope");
  // Already linked to 서울 (or no 구 link at all): not a target.
  assert.equal(
    planPoster(
      row({
        links: [
          gu("강서구", "REG_SEOUL_GANGSEO"),
          {
            region_id: SEOUL,
            code: "REG_SEOUL",
            name: "서울특별시",
            level: "sido",
          },
        ],
      }),
      { seoulRegionId: SEOUL },
    ),
    null,
  );
  assert.equal(planPoster(row({ links: [] }), { seoulRegionId: SEOUL }), null);
});

test("summary counts", () => {
  const plans = [
    planPoster(row({ eligibility_summary: "서울시 거주 청년" }), {
      seoulRegionId: SEOUL,
    }),
    planPoster(row({ eligibility_summary: "청년" }), { seoulRegionId: SEOUL }),
  ];
  const summary = summarize(plans);
  assert.equal(summary.posters, 2);
  assert.equal(summary.seoulLinksAdded, 1);
  assert.deepEqual(summary.byKind, { seoul_wide: 1, unknown: 1 });
  assert.deepEqual(summary.skipped, { needs_person: 1 });
});

test("the decision is recorded once, and can be removed again", () => {
  const recorded = planPoster(
    row({ eligibility_summary: "39세 이하 청년 누구나, 송파구민 우대" }),
    { seoulRegionId: SEOUL, kinds: ["gu_preferred"] },
  );
  const record = recorded.actions.find((a) => a.op === "record");
  assert.deepEqual(
    { kind: record.value.kind, gus: record.value.gus },
    { kind: "gu_preferred", gus: ["송파구"] },
  );
  // Already recorded (by the crawler or an earlier run): not again.
  const again = planPoster(
    row({
      eligibility_summary: "39세 이하 청년 누구나, 송파구민 우대",
      field_verification: { cardFacts: { regionEligibility: record.value } },
    }),
    { seoulRegionId: SEOUL, kinds: ["gu_preferred"] },
  );
  assert.ok(!again.actions.some((a) => a.op === "record"));
  const fv = { readableNotice: { x: 1 }, cardFacts: { version: 2 } };
  const written = withRecordedEligibility(fv, record.value);
  assert.deepEqual(written.readableNotice, { x: 1 });
  assert.equal(written.cardFacts.version, 2);
  assert.equal(written.cardFacts.regionEligibility.kind, "gu_preferred");
  assert.deepEqual(withRecordedEligibility(written, null).cardFacts, {
    version: 2,
  });
  assert.equal(fv.cardFacts.regionEligibility, undefined);
});
