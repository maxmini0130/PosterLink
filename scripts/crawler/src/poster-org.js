// ---------------------------------------------------------------------------
// 기관명(source_org_name) 정확화
//
// 청년몽땅정보통 같은 수집 포털은 실제 주최 기관이 아니라 수집 사이트다.
// 이런 포털명이 기관으로 저장되는 경우, 제목의 "실제기관 <프로그램명>" 형태에서
// 실제 기관을 추출해 대체한다. 크롤러(신규 수집)와 백필이 이 로직을 공유한다.
// ---------------------------------------------------------------------------

// 실제 주최 기관이 아니라 수집 사이트/포털인 이름들
export const PORTAL_ORG_NAMES = new Set(["청년몽땅정보통", "온통청년"]);

// 제목 "실제기관 <프로그램명> …" 에서 첫 '<' 앞의 기관명을 추출한다.
// 추출값이 없거나 25자를 넘으면(프로그램 설명이 섞인 것) null 을 반환한다.
export function extractOrgFromTitle(title) {
  const text = String(title ?? "").trim();
  const bracketIndex = text.indexOf("<");
  if (bracketIndex <= 0) return null;

  let org = text.slice(0, bracketIndex).trim();
  // 끝에 붙은 괄호 표기 제거: "기관 (안내)" → "기관"
  org = org.replace(/[[(【][^\])】]*[\])】]\s*$/, "").trim();
  if (!org || org.length > 25) return null;
  return org;
}

// source_org_name 이 포털명이면 제목에서 추출한 실제 기관으로 대체한다.
// 포털명이 아니거나 추출 실패 시 원래 값을 그대로 유지한다.
export function resolveSourceOrgName(title, sourceOrgName) {
  const current = String(sourceOrgName ?? "").trim();
  if (!PORTAL_ORG_NAMES.has(current)) return sourceOrgName;
  return extractOrgFromTitle(title) ?? sourceOrgName;
}
