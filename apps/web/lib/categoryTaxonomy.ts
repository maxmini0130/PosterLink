/**
 * Interest categories (screen plan v1.0, 05 찾기 "분류 체계 정리"): seven main
 * categories plus 기타 are what people pick and filter by. The crawler mostly
 * tags posters with a content type (교육강좌, 행사모집, …), which is a different
 * level, so each content type is folded into one main category for matching
 * and never listed beside the main categories.
 */

export const INTEREST_CATEGORY_CODES = [
  "CAT_WELFARE",
  "CAT_EDUCATION",
  "CAT_CULTURE",
  "CAT_HOUSING",
  "CAT_BUSINESS",
  "CAT_FAMILY",
  "CAT_HEALTH",
  "CAT_OTHER",
] as const;

/** Content type -> the main category it is searched under. */
export const CONTENT_TYPE_INTEREST: Readonly<Record<string, string>> = {
  CAT_COURSE: "CAT_EDUCATION",
  CAT_RECRUITMENT: "CAT_EDUCATION",
  CAT_EVENT_RECRUIT: "CAT_CULTURE",
  CAT_CONTEST: "CAT_CULTURE",
  CAT_SUPPORT_PROGRAM: "CAT_WELFARE",
  CAT_POLICY_INFO: "CAT_OTHER",
  CAT_LIFE_INFO: "CAT_OTHER",
  CAT_PRESS_RELEASE: "CAT_OTHER",
  CAT_BID: "CAT_OTHER",
};

export type TaxonomyCategory = {
  id: string;
  code?: string | null;
  parent_id?: string | null;
};

const INTEREST_SET = new Set<string>(INTEREST_CATEGORY_CODES);

export function isInterestCategory(category: TaxonomyCategory) {
  return INTEREST_SET.has(String(category.code ?? ""));
}

/**
 * The main categories to offer, in the given order. A list read without codes
 * is returned unchanged rather than emptied.
 */
export function interestCategories<T extends TaxonomyCategory>(list: T[]): T[] {
  if (!list.some((category) => category.code)) return list;
  return list.filter(isInterestCategory);
}

/**
 * Category ids a search for `categoryId` covers: the category itself and the
 * content types folded into it (or set below it with parent_id).
 */
export function categoryScopeIds(
  categoryId: string | null,
  list: TaxonomyCategory[],
): string[] {
  if (!categoryId) return [];
  const selected = list.find((category) => category.id === categoryId);
  if (!selected) return [categoryId];
  const ids = [categoryId];
  for (const category of list) {
    if (category.id === categoryId) continue;
    const folded =
      category.parent_id === categoryId ||
      (Boolean(selected.code) &&
        CONTENT_TYPE_INTEREST[String(category.code ?? "")] === selected.code);
    if (folded) ids.push(category.id);
  }
  return ids;
}
