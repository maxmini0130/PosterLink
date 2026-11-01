import assert from "node:assert/strict";
import { sitemapXml } from "./sitemapXml";
import { isPosterEligibleForPromotion } from "./promotionEligibility";
import test from "node:test";
import {
  categoryPageCopy,
  isInformationalPoster,
  isClosedCategoryPoster,
} from "./categoryContent";
import { assertPublicDiscoveryQuery } from "./publicDiscoveryErrors";

test("information needs an information primary category, not just a missing deadline", () => {
  const base = {
    poster_status: "published",
    primary_category_code: "CAT_PRESS_RELEASE",
    deadline_type: "unknown",
  };
  assert.equal(isInformationalPoster(base), true);
  for (const primary_category_code of ["CAT_POLICY_INFO", "CAT_LIFE_INFO"]) {
    assert.equal(
      isInformationalPoster({ ...base, primary_category_code }),
      true,
    );
  }
  for (const patch of [
    { primary_category_code: "CAT_COURSE" },
    { primary_category_code: undefined },
    { application_start_at: "2026-10-01T00:00:00Z" },
    { application_end_at: "2026-10-31T00:00:00Z" },
    { deadline_type: "ongoing" },
    { deadline_type: "until_exhausted" },
    { poster_status: "review" },
    { poster_status: "closed" },
  ])
    assert.equal(isInformationalPoster({ ...base, ...patch }), false);
  assert.equal(base.deadline_type, "unknown");
});

test("closed category results respect status and exact deadline without treating unknown as closed", () => {
  const now = Date.parse("2026-10-22T14:00:00Z");
  assert.equal(isClosedCategoryPoster({ poster_status: "closed" }, now), true);
  assert.equal(
    isClosedCategoryPoster(
      { poster_status: "closed", application_end_at: "2027-01-01T00:00:00Z" },
      now,
    ),
    true,
  );
  assert.equal(
    isClosedCategoryPoster(
      {
        poster_status: "published",
        application_end_at: "2026-10-22T13:59:59Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    isClosedCategoryPoster(
      {
        poster_status: "published",
        application_end_at: "2026-10-22T14:00:00Z",
      },
      now,
    ),
    false,
  );
  assert.equal(
    isClosedCategoryPoster({ poster_status: "published" }, now),
    false,
  );
});

test("category copy describes bids and information without generic education claims", () => {
  const bid = categoryPageCopy({ id: "bid", code: "CAT_BID", name: "입찰" });
  const press = categoryPageCopy({
    id: "press",
    code: "CAT_PRESS_RELEASE",
    name: "보도자료",
  });
  assert.match(bid.description, /입찰·위탁기관/);
  assert.doesNotMatch(bid.description, /교육|상시/);
  assert.match(press.description, /보도자료|소식/);
  assert.notEqual(bid.title, press.title);
});

test("query failures throw instead of turning unavailable data into a zero count", (t) => {
  const log = t.mock.method(console, "error", () => {});
  assert.doesNotThrow(() =>
    assertPublicDiscoveryQuery({ error: null }, "count"),
  );
  assert.throws(
    () => assertPublicDiscoveryQuery({ error: { code: "XX001" } }, "count"),
    /불러오지 못했습니다/,
  );
  assert.equal(log.mock.callCount(), 1);
});

test("promotional landings exclude unresolved dates without hiding public archives", () => {
  const poster = { deadline_type: "ongoing", application_end_at: null };
  assert.equal(isPosterEligibleForPromotion(poster), true);
  assert.equal(
    isPosterEligibleForPromotion({
      ...poster,
      date_quality_decision: "review",
    }),
    false,
  );
  assert.equal(
    isPosterEligibleForPromotion({
      ...poster,
      deadline_review: { promotionEligible: false },
    }),
    false,
  );
  const end = "2099-10-22T14:59:59Z";
  assert.equal(
    isPosterEligibleForPromotion({
      deadline_type: "fixed",
      application_end_at: end,
      date_quality_decision: "review",
      deadline_review: { decision: "confirmed", endAt: end },
    }),
    true,
  );
  assert.equal(
    isPosterEligibleForPromotion({
      deadline_type: "fixed",
      application_end_at: "2020-10-22T14:59:59Z",
      deadline_review: { decision: "confirmed", endAt: "2020-10-22T14:59:59Z" },
    }),
    false,
  );
});

test("sitemap XML escapes source strings and omits invalid modification dates", () => {
  const xml = sitemapXml([
    { url: 'https://example.com/?q=<test>&a="value"', updatedAt: "invalid" },
  ]);
  assert.match(xml, /&lt;test&gt;&amp;a=&quot;value&quot;/);
  assert.doesNotMatch(xml, /<lastmod>/);
  assert.match(
    sitemapXml([{ url: "https://example.com/sitemap.xml" }], true),
    /<sitemapindex/,
  );
});
import {
  buildPosterSearchPath,
  institutionTypeLabel,
  readDiscoverySort,
  resolveTaxonomyByRouteValue,
  taxonomySlug,
} from "./discoveryRoutes";

const category = {
  id: "category-id",
  name: "교육/취업",
  code: "CAT_EDUCATION",
};
const region = {
  id: "region-id",
  name: "마포구",
  full_name: "서울특별시 마포구",
  code: "REG_SEOUL_MAPO",
};

test("taxonomySlug creates stable category and region paths", () => {
  assert.equal(taxonomySlug(category, "CAT"), "education");
  assert.equal(taxonomySlug(region, "REG"), "seoul-mapo");
});

test("resolveTaxonomyByRouteValue accepts slug, code, name, and full name", () => {
  assert.equal(
    resolveTaxonomyByRouteValue([category], "education")?.id,
    category.id,
  );
  assert.equal(
    resolveTaxonomyByRouteValue([category], "CAT_EDUCATION")?.id,
    category.id,
  );
  assert.equal(
    resolveTaxonomyByRouteValue(
      [region],
      encodeURIComponent("서울특별시 마포구"),
    )?.id,
    region.id,
  );
});

test("buildPosterSearchPath keeps only meaningful public filters", () => {
  assert.equal(
    buildPosterSearchPath({
      query: " 청년 ",
      category,
      region,
      sort: "deadline",
      includeClosed: true,
    }),
    "/posters?q=%EC%B2%AD%EB%85%84&category=education&region=seoul-mapo&sort=deadline&closed=include",
  );
  assert.equal(buildPosterSearchPath({}), "/posters");
});

test("readDiscoverySort rejects unsupported values", () => {
  assert.equal(readDiscoverySort("deadline"), "deadline");
  assert.equal(readDiscoverySort("random"), "latest");
});

test("institutionTypeLabel presents crawler types as user-facing Korean labels", () => {
  assert.equal(institutionTypeLabel("local_government"), "지방자치단체");
  assert.equal(institutionTypeLabel(null), null);
});

test("region scope includes nationwide eligibility without sibling districts", async () => {
  const { getRegionScopeIds } = await import("./regionHelpers");
  const regions = [
    { id: "nation", level: "nation" },
    { id: "seoul", level: "sido", parent_id: "nation" },
    { id: "mapo", level: "sigungu", parent_id: "seoul" },
    { id: "gangnam", level: "sigungu", parent_id: "seoul" },
  ];
  assert.deepEqual(
    [...getRegionScopeIds("mapo", regions)!],
    ["mapo", "seoul", "nation"],
  );
  assert.equal(getRegionScopeIds("nation", regions), null);
  // Production 시·도 rows have no parent link to 전국; it is still in scope.
  const unlinked = [
    { id: "nation", level: "nation" },
    { id: "seoul", level: "sido", parent_id: null },
    { id: "mapo", level: "sigungu", parent_id: "seoul" },
  ];
  assert.deepEqual(
    [...getRegionScopeIds("seoul", unlinked)!],
    ["seoul", "mapo", "nation"],
  );
});
