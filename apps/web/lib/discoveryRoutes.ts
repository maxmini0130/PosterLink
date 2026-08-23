export type DiscoverySort = "latest" | "deadline" | "popular" | "views" | "favorites";

export type DiscoveryTaxonomy = {
  id: string;
  name: string;
  code?: string | null;
  full_name?: string | null;
  level?: string | null;
  parent_id?: string | null;
};

export type DiscoveryPoster = {
  id: string;
  title: string;
  source_org_name: string | null;
  organizer_name?: string | null;
  organizer_id?: string | null;
  source_institution_id?: string | null;
  application_institution_id?: string | null;
  application_start_at?: string | null;
  application_end_at: string | null;
  deadline_type?: string | null;
  verification_status?: string | null;
  verified_at?: string | null;
  thumbnail_url: string | null;
  source_key: string | null;
  summary_short?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  categoryId: string | null;
  regionId: string | null;
  categoryIds: string[];
  regionIds: string[];
  categoryName: string | null;
  regionName: string | null;
  images: string[];
  viewCount?: number;
  linkClickCount?: number;
  favoriteCount?: number;
  semanticScore?: number | null;
};

const SORT_VALUES = new Set<DiscoverySort>(["latest", "deadline", "popular", "views", "favorites"]);
const INSTITUTION_TYPE_LABELS: Record<string, string> = {
  central_portal: "중앙 공공포털",
  local_government: "지방자치단체",
  foundation: "공공재단",
  youth_center: "청년·청소년기관",
  startup: "창업지원기관",
  welfare: "복지기관",
  culture: "문화기관",
  education: "교육기관",
  library: "도서관",
  sports: "체육기관",
  university: "대학",
  public_employment: "공공채용기관",
  open_data: "공공데이터",
  other: "공공·공익기관",
};

export function readDiscoverySort(value?: string | null): DiscoverySort {
  return value && SORT_VALUES.has(value as DiscoverySort) ? (value as DiscoverySort) : "latest";
}

export function institutionTypeLabel(value?: string | null) {
  if (!value) return null;
  return INSTITUTION_TYPE_LABELS[value] ?? value;
}

export function taxonomySlug(item: DiscoveryTaxonomy, prefix: "CAT" | "REG") {
  const code = String(item.code ?? "").trim().toUpperCase();
  const codePrefix = `${prefix}_`;
  if (code.startsWith(codePrefix)) {
    return code.slice(codePrefix.length).toLowerCase().replace(/_/g, "-");
  }

  return encodeURIComponent(item.name.trim());
}

export function resolveTaxonomyByRouteValue<T extends DiscoveryTaxonomy>(items: T[], value?: string | null) {
  const decoded = decodeRouteValue(value);
  if (!decoded) return null;

  return items.find((item) => {
    const candidates = [
      item.id,
      item.name,
      item.full_name,
      item.code,
      taxonomySlug(item, item.code?.toUpperCase().startsWith("REG_") ? "REG" : "CAT"),
    ];
    return candidates.some((candidate) => normalizeLookup(candidate) === decoded);
  }) ?? null;
}

export function buildPosterSearchPath(filters: {
  query?: string | null;
  category?: DiscoveryTaxonomy | null;
  region?: DiscoveryTaxonomy | null;
  sort?: DiscoverySort | null;
  includeClosed?: boolean;
}) {
  const params = new URLSearchParams();
  const query = filters.query?.trim();
  if (query) params.set("q", query);
  if (filters.category) params.set("category", taxonomySlug(filters.category, "CAT"));
  if (filters.region) params.set("region", taxonomySlug(filters.region, "REG"));
  if (filters.sort && filters.sort !== "latest") params.set("sort", filters.sort);
  if (filters.includeClosed) params.set("closed", "include");
  const queryString = params.toString();
  return queryString ? `/posters?${queryString}` : "/posters";
}

function decodeRouteValue(value?: string | null) {
  if (!value) return "";
  try {
    return normalizeLookup(decodeURIComponent(value));
  } catch {
    return normalizeLookup(value);
  }
}

function normalizeLookup(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, " ");
}
