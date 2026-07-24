// ---------------------------------------------------------------------------
// config-schema 순수 로직 테스트 (Node 내장 테스트 러너 + tsx)
//
//   pnpm test            (루트에서)
//   tsx --test apps/web/app/admin/collection-sources/config-schema.test.ts
//
// 라운드트립(무손실), 알 수 없는 키 보존, snake_case 정규화, 검증 규칙을 고정한다.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseToForm,
  serializeForm,
  validateCollectionConfig,
} from "./config-schema";

// raw JSON -> 폼 -> 다시 raw JSON 을 거친 뒤의 정규화된 객체를 돌려준다.
function roundTrip(raw: string): Record<string, any> {
  return JSON.parse(serializeForm(parseToForm(raw)));
}

// --- 라운드트립: 무손실 -----------------------------------------------------

test("기본 템플릿 config 가 라운드트립에서 보존된다", () => {
  const input = {
    adapter: "generic-board",
    maxPages: 2,
    boards: [{ name: "공지사항", url: "https://example.go.kr/board", category: "공지" }],
    pagination: { param: "page" },
    selectors: { listItem: "table tbody tr", listLink: "a[href]" },
    urlFilters: { sameHostOnly: true, include: ["/board/view"], exclude: ["/download"] },
    excludeTitlePatterns: ["결과 발표"],
  };
  assert.deepEqual(roundTrip(JSON.stringify(input)), input);
});

test("라운드트립은 멱등이다 (두 번 돌려도 동일)", () => {
  const input = JSON.stringify({
    adapter: "seoul-city",
    maxPages: 3,
    boards: [{ name: "게시판", url: "https://seoul.go.kr/list" }],
    selectors: { detailTitle: "h1" },
  });
  const once = serializeForm(parseToForm(input));
  const twice = serializeForm(parseToForm(once));
  assert.equal(once, twice);
});

// --- 알 수 없는 키 보존 -----------------------------------------------------

test("폼이 모르는 최상위/중첩 키를 손실 없이 보존한다", () => {
  const input = {
    adapter: "generic-board",
    vendorOnlyKey: { deep: [1, 2, 3] }, // 최상위 extra
    selectors: { listItem: "tr", vendorSelector: ".x" }, // selectorsExtra
    pagination: { param: "page", startAt: 0 }, // paginationExtra
    urlFilters: { sameHostOnly: false, custom: true }, // urlFiltersExtra
  };
  const out = roundTrip(JSON.stringify(input));
  assert.deepEqual(out.vendorOnlyKey, { deep: [1, 2, 3] });
  assert.equal(out.selectors.vendorSelector, ".x");
  assert.equal(out.pagination.startAt, 0);
  assert.equal(out.urlFilters.custom, true);
});

// --- snake_case 정규화 ------------------------------------------------------

test("external_original(snake_case) 를 externalOriginal(camelCase) 로 정규화한다", () => {
  const input = {
    adapter: "generic-board",
    external_original: {
      follow: true,
      scope_selector: ".view_content",
      link_selector: "a[href^=http]",
      exclude_hosts: ["youth.seoul.go.kr"],
    },
  };
  const out = roundTrip(JSON.stringify(input));
  assert.equal(out.external_original, undefined);
  assert.deepEqual(out.externalOriginal, {
    enabled: true,
    scopeSelector: ".view_content",
    linkSelector: "a[href^=http]",
    excludeHosts: ["youth.seoul.go.kr"],
  });
});

test("게시판 id(클라이언트 전용)는 직렬화에 새어나가지 않는다", () => {
  const form = parseToForm(JSON.stringify({ boards: [{ name: "a", url: "https://a.kr" }] }));
  form.boards[0].id = "b0"; // 컴포넌트가 부여하는 필드
  const out = JSON.parse(serializeForm(form));
  assert.deepEqual(out.boards, [{ name: "a", url: "https://a.kr" }]);
});

// --- 검증: 정상 / 경고 / 오류 -----------------------------------------------

test("빈 문자열은 검증 통과(ok)", () => {
  assert.equal(validateCollectionConfig("").level, "ok");
});

test("JSON 문법 오류는 error", () => {
  const result = validateCollectionConfig("{ not json ");
  assert.equal(result.level, "error");
  assert.match(result.issues[0].message, /JSON 문법/);
});

test("객체가 아니면 error", () => {
  assert.equal(validateCollectionConfig("[1,2,3]").level, "error");
});

test("maxPages 0 은 error, 1 은 통과", () => {
  assert.equal(validateCollectionConfig(JSON.stringify({ maxPages: 0 })).level, "error");
  assert.notEqual(validateCollectionConfig(JSON.stringify({ maxPages: 1 })).level, "error");
});

test("게시판 URL 이 비었거나 형식이 틀리면 error", () => {
  assert.equal(validateCollectionConfig(JSON.stringify({ boards: [{ name: "a", url: "" }] })).level, "error");
  assert.equal(
    validateCollectionConfig(JSON.stringify({ boards: [{ name: "a", url: "ftp://x" }] })).level,
    "error",
  );
});

test("중첩 필드가 객체가 아니면 error", () => {
  assert.equal(validateCollectionConfig(JSON.stringify({ selectors: "not-an-object" })).level, "error");
});

test("adapter 누락은 warning (차단 아님)", () => {
  const result = validateCollectionConfig(JSON.stringify({ maxPages: 2 }));
  assert.equal(result.level, "warning");
});

test("원문추적 켰지만 셀렉터 없으면 warning", () => {
  const result = validateCollectionConfig(
    JSON.stringify({ adapter: "generic-board", externalOriginal: { enabled: true } }),
  );
  assert.equal(result.level, "warning");
  assert.ok(result.issues.some((issue) => /셀렉터/.test(issue.message)));
});
