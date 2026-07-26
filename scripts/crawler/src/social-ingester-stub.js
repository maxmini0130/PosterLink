// SNS_INGESTION.md Phase 3-2 — 페이스북/인스타그램 인제스터 stub.
//
// 스크래핑 절대 금지. 인터페이스만 두고 구현은 비워둔다.
//
// - 인스타그램: Basic Display API가 2024-12 폐지됐고, 공식 API(Instagram Graph API)로는
//   내가 인증·운영권을 가진 계정만 접근 가능하다. 남의 기관 계정을 수집할 방법이 없다.
// - 페이스북: 공개 페이지라도 앱 심사(App Review)와 페이지 운영자의 별도 권한 부여가
//   필요해 사실상 제3자 수집이 불가능하다.
//
// 활성화 조건: 해당 기관 계정의 운영권을 PosterLink가 직접 갖게 되거나,
// 플랫폼 정책이 바뀌어 공개 계정 접근이 허용될 때만 아래 함수를 실제로 구현한다.
// 그 전까지는 항상 에러를 던진다 — 조용히 빈 배열을 반환하면 "정상 동작 중"으로
// 오인될 수 있으므로 명시적으로 막아둔다.

export async function ingestFacebookPage() {
  throw new Error(
    "Facebook page ingestion is not implemented (requires page-operator OAuth permission + App Review; scraping is prohibited). See SNS_INGESTION.md Phase 3-2."
  );
}

export async function ingestInstagramAccount() {
  throw new Error(
    "Instagram account ingestion is not implemented (Basic Display API retired 2024-12; Graph API only covers accounts we operate; scraping is prohibited). See SNS_INGESTION.md Phase 3-2."
  );
}
