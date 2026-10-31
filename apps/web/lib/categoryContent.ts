import type { DiscoveryTaxonomy } from "./discoveryRoutes";

export const INFORMATION_CATEGORY_CODES = [
  "CAT_PRESS_RELEASE",
  "CAT_POLICY_INFO",
  "CAT_LIFE_INFO",
] as const;

export function isInformationCategory(code?: string | null) {
  return INFORMATION_CATEGORY_CODES.some((value) => value === code);
}

export function isInformationalPoster(poster: {
  primary_category_code?: string | null;
  application_start_at?: string | null;
  application_end_at?: string | null;
  deadline_type?: string | null;
  poster_status?: string | null;
}) {
  return (
    poster.poster_status === "published" &&
    isInformationCategory(poster.primary_category_code) &&
    !poster.application_start_at &&
    !poster.application_end_at &&
    (!poster.deadline_type || poster.deadline_type === "unknown")
  );
}

export function isClosedCategoryPoster(
  poster: {
    poster_status?: string | null;
    application_end_at?: string | null;
  },
  now = Date.now(),
) {
  return (
    poster.poster_status === "closed" ||
    Boolean(
      poster.application_end_at && Date.parse(poster.application_end_at) < now,
    )
  );
}

const TOPICS: Record<string, string> = {
  CAT_WELFARE: "지원금·복지 서비스의 지원 대상과 신청기간",
  CAT_EDUCATION: "취업 지원·직무 교육의 모집기간과 참여 자격",
  CAT_CULTURE: "문화·예술 행사의 참여 일정과 신청 방법",
  CAT_HOUSING: "주거·금융 지원의 신청 조건과 접수 일정",
  CAT_BUSINESS: "소상공인·창업 지원의 대상과 모집 일정",
  CAT_FAMILY: "육아·가족 프로그램의 참여 대상과 신청기간",
  CAT_HEALTH: "건강·의료 프로그램의 지원 대상과 이용 안내",
  CAT_OTHER: "그 밖의 공공기관 공고와 공식 안내",
  CAT_SUPPORT_PROGRAM: "공공 지원사업의 지원 내용과 신청 자격",
  CAT_RECRUITMENT: "채용 공고의 접수기간과 지원 자격",
  CAT_CONTEST: "공모전의 응모 자격과 접수기간",
  CAT_COURSE: "교육강좌의 수강 대상과 모집 일정",
  CAT_EVENT_RECRUIT: "행사·프로그램의 참여 대상과 모집 일정",
  CAT_BID: "입찰·위탁기관 모집의 접수 일정과 참가 자격",
  CAT_POLICY_INFO: "공공 정책의 주요 내용과 공식 안내",
  CAT_PRESS_RELEASE: "공공기관의 보도자료와 새로운 소식",
  CAT_LIFE_INFO: "생활에 필요한 공공서비스와 이용 안내",
};

export function categoryPageCopy(category: DiscoveryTaxonomy) {
  const information = isInformationCategory(category.code);
  return {
    title: `${category.name} ${information ? "공공 정보·안내" : "모집 공고·마감 공고"}`,
    description: `${TOPICS[category.code ?? ""] ?? `${category.name} 분야의 공공 공고`}를 확인하세요. ${information ? "일반 정보 안내와 모집 중·마감 공고를 구분하고" : "현재 모집 중인 공고와 마감된 공개 공고를 구분하고"} 공식 원문으로 연결합니다.`,
  };
}
