# 2026-10-22 SEO·GEO 및 공개 검색 개선

## 범위

- 사용자 요청에 따라 실제 SEO·SSR·RLS·검색·캐시·수집 분류를 분석하고 로컬 코드 수정.
- 시작 fetch 완료, clean branch, origin 대비 기존 5커밋 ahead 확인. 기존 커밋은 변경하지 않음.
- 버전 업그레이드, 배포, 운영 공고 데이터 교정·삭제, DB 마이그레이션 없음.
- 상세 분석, 배포 확인, 미완료 데이터 검수: [SEO 운영 문서](docs/seo_geo_search_visibility.md).

## 변경 파일

| 경로                                               | 목적                                                  |
| -------------------------------------------------- | ----------------------------------------------------- |
| `apps/web/app/robots.ts`                           | 검색 봇 명시, GPTBot 분리, index URL                  |
| `apps/web/app/sitemap.ts`                          | 정적·분류·기관 URL, 허위 lastmod/추측 조합 제거       |
| `apps/web/app/sitemap-index.xml/route.ts`          | 공개 공고 건수에 따른 index                           |
| `apps/web/app/sitemaps/posters/[page]/route.ts`    | 공개 공고 1,000개 단위 sitemap                        |
| `apps/web/lib/sitemapXml.ts`                       | XML 이스케이프 및 응답 캐시                           |
| `apps/web/app/page.tsx`                            | 홈 canonical·통계 SSR                                 |
| `apps/web/app/HomeClient.tsx`                      | 서버 통계 초기값·조회 불가 표시                       |
| `apps/web/app/api/home/summary/route.ts`           | 공유 공개 통계 함수 사용                              |
| `apps/web/lib/homeSummary.ts`                      | 서비스 역할 의존 제거, 오류를 null로 구분             |
| `apps/web/app/posters/[id]/page.tsx`               | 요청 내 조회 공유, Twitter, 공식 원문, JSON-LD escape |
| `apps/web/app/posters/[id]/PosterDetailClient.tsx` | 원문/신청·주관 구분, 반복 행 제거, 관련 목록 링크     |
| `apps/web/lib/posterStructuredSeo.ts`              | 출처·발행자·주관 분리, 보수적인 Event 생성            |
| `apps/web/app/posters/page.tsx`                    | 검색 변형 URL noindex                                 |
| `apps/web/app/components/DiscoveryLanding.tsx`     | 정확한 전체 건수 표시                                 |
| `apps/web/lib/publicDiscovery.ts`                  | 공통 지역 범위, no-store, 검수 JSON 최소 투영         |
| `apps/web/lib/regionHelpers.ts`                    | 계층 순환 방지                                        |
| `apps/web/lib/posterApplication.ts`                | 당일 실제 시작/종료 시각 판정                         |
| `scripts/crawler/src/region-rules.js`              | 명시적 구 자격 우선                                   |
| `apps/web/lib/discoveryRoutes.test.ts`             | 지역 범위·XML 회귀                                    |
| `apps/web/lib/posterApplication.test.ts`           | 서울 시각 경계 회귀                                   |
| `apps/web/lib/posterStructuredSeo.test.ts`         | 출처/주관·Event 회귀                                  |
| `scripts/crawler/src/poster-rules.test.js`         | 자격과 장소 충돌 회귀                                 |
| `apps/web/e2e/seo.spec.ts`                         | 통계 SSR, sitemap 전체 조각, 상세 SEO, mutation 차단  |
| `docs/seo_geo_search_visibility.md`                | 분석·검증·배포 후 운영 절차                           |
| `WORK_LOG_20261022_seo_geo.md`                     | 이번 작업 기록                                        |

## 검증 상태

- 웹 단위 테스트 65/65, 크롤러 321/321, 웹 lint·tsc, 모바일 typecheck 통과.
- Node 20.20.2 production build 통과. 기존 caniuse-lite 갱신 안내·edge runtime 정적 생성 안내만 있음.
- 개발 서버 SEO E2E 14/14 통과. Node 20 production 서버 SEO E2E도 14/14 통과(12초).
- 모바일/데스크톱 홈·상세 시각 확인, 수평 overflow 없음.
- anon/service count와 검색은 모두 275. sitemap은 4개 조각·3,088 URL, 중복 없음.
- 240건 목록 payload 1,694,862 → 283,038 bytes, 검수 원본은 보존.
- AI healthcheck exit 0, **품질 게이트는 fail**: 낮은 이미지 신뢰도 1, 필드 교정 후보 20. 운영 데이터는 자동 수정하지 않음.
- 초기 브라우저 회귀에서 방문 통계 POST가 생성됨. 이후 테스트에 mutation 차단을 넣었으며 최종 검증은 공고·사용자 데이터 쓰기 없이 수행.
- 실계정 OAuth·찜·댓글 쓰기는 수행하지 않음. 공개 읽기 회귀와 기존 단위 테스트로 검증했으며 별도 테스트 DB/계정 검증 필요.

## 배포·복구

- 로컬 변경만 커밋하며 push·배포하지 않는다. 운영 코드에는 아직 미반영.
- 코드 롤백이 필요하면 이번 커밋만 일반 revert한 뒤 사용자 판단으로 재배포한다. DB 복구·마이그레이션 롤백은 필요 없음.
- 추가 승인 없이 교정 후보·검수 공고를 자동 반영하지 않는다.
