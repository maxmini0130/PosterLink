export type AdminPosterDeadlineFilter =
  | ""
  | "fixed"
  | "ongoing"
  | "until_exhausted"
  | "scheduled"
  | "unknown";

export type AdminPosterVerificationFilter =
  | ""
  | "unverified"
  | "needs_review"
  | "verified"
  | "rejected";

export type AdminPosterSort =
  | "default"
  | "created_desc"
  | "created_asc"
  | "deadline_asc"
  | "deadline_desc"
  | "deadline_type"
  | "verification_status";

export type AdminPosterOrder = {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
};

export const ADMIN_POSTER_DEADLINE_LABELS: Record<string, string> = {
  fixed: "마감일 고정",
  ongoing: "상시 모집",
  until_exhausted: "소진 시 마감",
  scheduled: "모집 예정",
  unknown: "일정 확인 필요",
};

export const ADMIN_POSTER_VERIFICATION_LABELS: Record<string, string> = {
  unverified: "미검증",
  needs_review: "추가 검토 필요",
  verified: "사람 검증 완료",
  rejected: "데이터 사용 불가",
};

const DEADLINE_FILTER_VALUES = new Set([
  "fixed",
  "ongoing",
  "until_exhausted",
  "scheduled",
  "unknown",
]);
const VERIFICATION_FILTER_VALUES = new Set([
  "unverified",
  "needs_review",
  "verified",
  "rejected",
]);
const SORT_VALUES = new Set<AdminPosterSort>([
  "default",
  "created_desc",
  "created_asc",
  "deadline_asc",
  "deadline_desc",
  "deadline_type",
  "verification_status",
]);

export function isAdminPosterDeadlineFilter(
  value: string | null,
): value is Exclude<AdminPosterDeadlineFilter, ""> {
  return Boolean(value && DEADLINE_FILTER_VALUES.has(value));
}

export function isAdminPosterVerificationFilter(
  value: string | null,
): value is Exclude<AdminPosterVerificationFilter, ""> {
  return Boolean(value && VERIFICATION_FILTER_VALUES.has(value));
}

export function isAdminPosterSort(
  value: string | null,
): value is AdminPosterSort {
  return Boolean(value && SORT_VALUES.has(value as AdminPosterSort));
}

export function getAdminPosterSortOrders(
  sort: AdminPosterSort,
  posterStatus: string,
): AdminPosterOrder[] {
  switch (sort) {
    case "created_desc":
      return [{ column: "created_at", ascending: false }];
    case "created_asc":
      return [{ column: "created_at", ascending: true }];
    case "deadline_asc":
      return [
        { column: "application_end_at", ascending: true, nullsFirst: false },
        { column: "created_at", ascending: false },
      ];
    case "deadline_desc":
      return [
        { column: "application_end_at", ascending: false, nullsFirst: false },
        { column: "created_at", ascending: false },
      ];
    case "deadline_type":
      return [
        { column: "deadline_type", ascending: true, nullsFirst: false },
        { column: "application_end_at", ascending: true, nullsFirst: false },
        { column: "created_at", ascending: false },
      ];
    case "verification_status":
      return [
        { column: "verification_status", ascending: true, nullsFirst: false },
        { column: "created_at", ascending: posterStatus === "review" },
      ];
    default:
      return [
        { column: "created_at", ascending: posterStatus === "review" },
      ];
  }
}

export function countAdminPosterConditions(filters: {
  text: string;
  org: string;
  categoryIds?: string[];
  categoryId?: string;
  regionId: string;
  media: string;
  deadlineType: string;
  verificationStatus: string;
  sort: AdminPosterSort;
}) {
  const filterCount = [
    filters.text,
    filters.org,
    filters.categoryIds && filters.categoryIds.length > 0 ? "category" : filters.categoryId,
    filters.regionId,
    filters.media,
    filters.deadlineType,
    filters.verificationStatus,
  ].filter((value) => String(value ?? "").trim()).length;

  return filterCount + (filters.sort === "default" ? 0 : 1);
}
