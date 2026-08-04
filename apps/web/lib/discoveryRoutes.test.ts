import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPosterSearchPath,
  institutionTypeLabel,
  readDiscoverySort,
  resolveTaxonomyByRouteValue,
  taxonomySlug,
} from "./discoveryRoutes";

const category = { id: "category-id", name: "교육/취업", code: "CAT_EDUCATION" };
const region = { id: "region-id", name: "마포구", full_name: "서울특별시 마포구", code: "REG_SEOUL_MAPO" };

test("taxonomySlug creates stable category and region paths", () => {
  assert.equal(taxonomySlug(category, "CAT"), "education");
  assert.equal(taxonomySlug(region, "REG"), "seoul-mapo");
});

test("resolveTaxonomyByRouteValue accepts slug, code, name, and full name", () => {
  assert.equal(resolveTaxonomyByRouteValue([category], "education")?.id, category.id);
  assert.equal(resolveTaxonomyByRouteValue([category], "CAT_EDUCATION")?.id, category.id);
  assert.equal(resolveTaxonomyByRouteValue([region], encodeURIComponent("서울특별시 마포구"))?.id, region.id);
});

test("buildPosterSearchPath keeps only meaningful public filters", () => {
  assert.equal(
    buildPosterSearchPath({ query: " 청년 ", category, region, sort: "deadline", includeClosed: true }),
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
