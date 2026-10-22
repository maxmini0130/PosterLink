import assert from "node:assert/strict";
import test from "node:test";
import { PROVINCES } from "./region-context.js";
import { inferRegionContext, inferRegionMatches } from "./region-rules.js";
import { inferPosterClassification } from "./poster-classifier.js";

const provinces = PROVINCES.map(([code, name]) => ({
  id: code,
  code,
  name,
  full_name: name,
  level: "sido",
}));
const shared = [
  ["중구", ["SEOUL", "BUSAN", "DAEGU", "INCHEON", "DAEJEON", "ULSAN"]],
  ["서구", ["BUSAN", "DAEGU", "INCHEON", "GWANGJU", "DAEJEON"]],
  ["동구", ["BUSAN", "DAEGU", "INCHEON", "GWANGJU", "DAEJEON", "ULSAN"]],
  ["남구", ["BUSAN", "DAEGU", "GWANGJU", "ULSAN"]],
  ["북구", ["BUSAN", "DAEGU", "GWANGJU", "ULSAN"]],
  ["강서구", ["SEOUL", "BUSAN"]],
  ["고성군", ["GANGWON", "GYEONGNAM"]],
];
// Fixture codes represent a supplied taxonomy, not proposed production DB codes.
const districts = shared.flatMap(([name, parents]) =>
  parents.map((parent) => {
    const province = provinces.find((row) => row.code === `REG_${parent}`);
    return {
      code: `TEST_${parent}_${name}`,
      name,
      full_name: `${province.name} ${name}`,
      parent_id: province.id,
      level: "sigungu",
    };
  }),
);
const catalog = [...provinces, ...districts];

test("eligibility, preference, institution and event context remain separate", () => {
  const post = {
    content:
      "신청 대상: 서울시 거주 청년·마포구 주민 우대\n교육장소: 강남구 교육장",
    source_org_name: "강서구청",
  };
  const result = inferRegionContext(post);
  assert.deepEqual(
    result.eligibility.map((row) => row.code),
    ["REG_SEOUL"],
  );
  assert.deepEqual(
    result.preference.map((row) => row.code),
    ["REG_SEOUL_MAPO"],
  );
  assert.ok(result.event.some((row) => row.code === "REG_SEOUL_GANGNAM"));
  assert.equal(
    inferRegionMatches(post).some((row) => row.code === "REG_SEOUL_MAPO"),
    false,
  );
});

test("inline preference does not narrow citywide mandatory eligibility", () => {
  assert.deepEqual(
    inferRegionMatches({ content: "서울시 거주 청년 마포구 주민 우대" }).map(
      (row) => row.code,
    ),
    ["REG_SEOUL"],
  );
});

for (const [name, parents] of shared) {
  for (const parent of parents) {
    const province = provinces.find((row) => row.code === `REG_${parent}`);
    test(`qualified shared district: ${province.name} ${name}`, () => {
      const result = inferRegionMatches(
        { content: `대상: ${province.name} ${name} 거주 주민` },
        catalog,
      );
      assert.deepEqual(
        result.map((row) => row.code),
        [`TEST_${parent}_${name}`],
      );
    });
  }
  test(`unqualified shared name stays unresolved: ${name}`, () => {
    assert.deepEqual(
      inferRegionMatches({ content: `대상: ${name} 거주 주민` }, catalog),
      [],
    );
  });
}

for (const province of provinces) {
  test(`province eligibility: ${province.name}`, () => {
    assert.deepEqual(
      inferRegionMatches(
        { content: `대상: ${province.name} 거주 청년` },
        catalog,
      ).map((row) => row.code),
      [province.code],
    );
  });
}

test("an unregistered Busan district never becomes Seoul or all Busan", () => {
  assert.deepEqual(
    inferRegionMatches({
      content: "부산광역시 중구 거주 청년",
      source_org_name: "부산중구청",
    }),
    [],
  );
});

test("Gwangju city and metropolitan city require a qualified parent", () => {
  const rows = [
    ...catalog,
    {
      name: "광주시",
      code: "TEST_GYEONGGI_GWANGJU",
      parent_id: "REG_GYEONGGI",
      full_name: "경기도 광주시",
      level: "sigungu",
    },
  ];
  assert.deepEqual(
    inferRegionMatches({ content: "경기도 광주시 거주 청년" }, rows).map(
      (row) => row.code,
    ),
    ["TEST_GYEONGGI_GWANGJU"],
  );
  assert.deepEqual(
    inferRegionMatches({ content: "광주광역시 거주 청년" }, rows).map(
      (row) => row.code,
    ),
    ["REG_GWANGJU"],
  );
  assert.deepEqual(inferRegionMatches({ content: "광주 거주 청년" }, rows), []);
});

test("institution and online venue alone cannot establish application eligibility", () => {
  for (const post of [
    { source_org_name: "마포구청", content: "교육 장소: 강남구 소재 교육장" },
    { content: "온라인 비대면 교육" },
    { content: "마포구 주민 우대" },
  ]) {
    const result = inferPosterClassification(post);
    assert.deepEqual(result.regionCodes, []);
    assert.ok(result.issues.some((row) => /region/.test(row.code)));
  }
});

test("negative and partially unknown conditions go to review", () => {
  assert.deepEqual(
    inferPosterClassification({
      content: "서울시 거주 청년 또는 부산시 거주 청년",
    }).regionCodes,
    [],
  );
  assert.deepEqual(
    inferRegionMatches({ content: "참가자격: 전국 19~45세 청년" }).map(
      (row) => row.code,
    ),
    ["REG_NATION"],
  );
  assert.deepEqual(
    inferRegionMatches({ content: "서울 또는 부산 거주 청년" }),
    [],
  );
  assert.deepEqual(
    inferRegionMatches({
      content: "교육장소: 강남구 강의실 신청대상: 마포구 거주 청년",
    })
      .filter((row) => !row.ambiguous)
      .map((row) => row.code),
    ["REG_SEOUL_MAPO"],
  );
  assert.deepEqual(
    inferRegionMatches({ content: "대상: 서울시 거주자가 아닌 청년" }),
    [],
  );
  assert.deepEqual(
    inferRegionMatches({ content: "대상: 서울시 거주 및 중구 거주 청년" }),
    [],
  );
  assert.deepEqual(inferRegionMatches({ content: "지역 제한 있음" }), []);
});
