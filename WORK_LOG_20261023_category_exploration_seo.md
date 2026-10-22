# 카테고리 탐색·SEO 개선 — 2026-10-23

## 범위와 기준

- 기준 HEAD `11780f0`, 작업 전 fetch 완료, clean, 기존 origin 대비 ahead 9. 기준 진단: `data/results/category-diagnosis-20261022/WORK_LOG_20261022_category_diagnosis.md`.
- 기존 17개 카테고리의 모집 중 조회, SSR, 검색 필터는 정상임을 보존했다. DB 쓰기·스키마/RLS·인증·회원/공고 데이터 변경 없음. 운영 배포·Git push는 하지 않는다.

## 변경

- 카테고리 랜딩은 기존 `search_public_posters`/`count_public_posters`를 그대로 사용하고 집계 라벨을 '현재 모집 중 공고'로 명확히 한다. 같은 공유 랜딩 컴포넌트의 모집 중 집계에도 이 문구를 사용한다.
- 마감 구역은 공개 published/closed와 null/A/B 노출 조건을 유지하며 `poster_status=closed` 또는 실제 종료 시각 경과를 확인한다. 최대 6건과 정확한 건수를 한 번에 읽고 마감 표시·SSR 상세 링크·기존 '마감 포함 전체 검색' 링크를 제공한다. 기본 모집 중 집계에 합산하지 않는다.
- 정보 구역은 세 정보형 카테고리에서만 조회한다. **주분류**가 CAT_PRESS_RELEASE/CAT_POLICY_INFO/CAT_LIFE_INFO, published, 신청 시작·종료일 모두 null, deadline_type unknown/null인 정보 안내만 별도로 노출한다. 관계 카테고리만 정보형이거나 종료일만 미확인인 신청 공고를 자동 정보/상시모집으로 승격하지 않는다. 불명확한 주분류는 보수적으로 제외한다.
- 정보 안내는 텍스트 카드로 구분하고 '정보 안내'라고 표시한다. 사진을 포스터로 새로 노출하지 않으며 정보 구역의 이미지 DB 조회도 생략한다. 신청·마감 날짜 및 모집 유형은 원본 그대로 유지한다.
- 분야별 title/description을 실제 분야에 맞게 구분했다. 입찰 설명에서 무관한 교육·지원사업 공통 문구를 제거했다. JSON-LD에는 화면에 실제 렌더링한 정보·마감 상세 링크도 포함한다.
- 기존 canonical·robots·sitemap URL 구조는 변경하지 않았다. 17개 분야 모두 보관 자료가 있으므로 모집 중 0건만으로 noindex하지 않는다. 실제 빈 분야의 색인 제외는 조회 성공과 유용한 공개 자료/공백 이력 확인을 전제로 향후 검토하며 이번에 임의 임계값을 도입하지 않았다.
- RPC·taxonomy·표시용 관계 조회 실패는 예외 처리한다. DB 장애를 빈 결과/정상 0건으로 처리하지 않는다. 진짜 0건은 그대로 표시한다. 사용자 경로는 계속 익명 공개 클라이언트/RLS를 사용하며 서비스 역할 키를 도입하지 않았다.
- metadata/본문은 React request cache로 taxonomy와 클라이언트를 재사용한다. 추가 자료는 병렬 조회하며 최대 6건씩, 관계/이미지 보강도 합쳐서 처리한다. 정보형 외 14개 분야에는 정보 조회를 실행하지 않는다. 기존 일반 검색·지역 목록에는 추가 보관 조회를 실행하지 않는다.

## 수정 전후 동일 시점 비교

진단 당시 10/22 23:47에서 10/23 자정 이후로 날짜가 바뀌어 자연 마감 건수가 달라졌다. 이를 코드 회귀로 해석하지 않고 같은 시점의 운영 구버전 HTML, 로컬 수정 버전 HTML, 익명 RPC를 대조했다. 17개 모두 일치했다. 여러 분야에 연결된 공고가 있어 각 건수 합계는 고유 공고 총계가 아니다.

| 분야        | 수정 전 = 후 모집 중 | 마감 구역 건수 | 정보 안내 건수 |
| ----------- | -------------------: | -------------: | -------------: |
| 지원금/복지 |                   42 |            157 |              0 |
| 교육/취업   |                    6 |             16 |              0 |
| 문화/행사   |                   16 |             36 |              0 |
| 주거/금융   |                    8 |             31 |              0 |
| 소상공인    |                   20 |            103 |              0 |
| 육아/가족   |                    9 |             44 |              0 |
| 건강/의료   |                   28 |            146 |              0 |
| 기타        |                    4 |             10 |              0 |
| 지원사업    |                   34 |            227 |              0 |
| 채용        |                    9 |             74 |              0 |
| 공모전      |                   17 |             63 |              0 |
| 교육강좌    |                  123 |          1,321 |              0 |
| 행사모집    |                  100 |            819 |              0 |
| 입찰        |                    0 |              1 |              0 |
| 정책안내    |                    3 |             15 |              8 |
| 보도자료    |                    0 |              0 |              2 |
| 생활정보    |                   10 |             37 |             12 |

## 테스트와 검증

- 신규 정책 테스트 4개: 정보 주분류/기간/상태/유형 조건, 미확인 신청 공고 배제, 마감 시각·closed 상태 우선, 분야 설명, 조회 오류와 정상 0건 구분. 기존 웹 단위 테스트 포함 70개 통과.
- 신규 공개 E2E 20개: 17개 카테고리 모집 중 RPC·SSR·화면·canonical·JSON-LD 링크 비교, 입찰 마감 링크/상태, 정보 안내와 상시모집 구분, sitemap 및 비공개 2건 404.
- 첫 E2E에서 로컬 canonical을 운영 주소로 고정한 테스트 오류를 발견했다. 환경별 canonical origin을 검증하도록 테스트를 교정했고 앱 URL 설정은 바꾸지 않았다.
- 공개 기존 92개+신규 20개=112개 통과. WebKit iPhone 13/SE 및 Chromium Pixel 7의 상세 버튼·safe area 6개 통과. 마지막 정보 카드 표시/이미지 조회 생략 변경 후 최종 Node 20 빌드 및 공개 회귀 112개도 재통과했다. Desktop/iPhone 캡처로 마감·정보 구역을 확인했다. 17개 title/description도 각각 고유하다.
- Node 20 웹 build·별도 tsc·lint 통과. 크롤러 381개 통과. Windows Node 20에서 기존 `pnpm --filter posterlink-crawler test`의 literal glob가 실패하여 동일 파일 목록을 명시적으로 확장해 실행했다. unrelated package script는 바꾸지 않았다.
- 테스트는 운영 API mutation을 차단한다. 인증 세션 쓰기·OCR check-deadlines는 운영 DB에서 실행하지 않는다. 실제 계정 OAuth·찜/댓글 저장·물리 기기 검증은 미완료이며 해당 기능 코드는 바꾸지 않았다.
- Preview 및 최종 검증 결과는 완료 후 추가 기록한다.

## 변경 파일

- `apps/web/app/categories/[category]/page.tsx`
- `apps/web/app/components/DiscoveryLanding.tsx`, `CategorySupplementalSections.tsx`, `PosterCard.tsx`
- `apps/web/lib/publicDiscovery.ts`, `categoryContent.ts`, `publicDiscoveryErrors.ts`, `discoveryRoutes.test.ts`
- `apps/web/e2e/category-content.spec.ts`, `helpers/posterFixtures.ts`
- `docs/seo_geo_search_visibility.md`, 이 작업 로그

## 남은 범위

- 보수적인 정보형 판정 때문에 주분류가 없거나 정보형으로 확인되지 않은 자료는 기존처럼 추가 검수 필요하다. 원문·검수 이력 없는 데이터를 임의 교정하지 않는다.
- 구역별 목록은 6건 미리보기와 기존 마감 포함 검색 연결이다. 새 DB pagination/RPC·순수 마감 전용 검색 필터는 추가하지 않았다.
- 실제 GSC 색인/Google 수집 여부·순위 개선은 Preview로 확인할 수 없다. 현재 17개 분야의 무조건 색인 제외나 기존 공고 삭제를 하지 않는다.
- 검증 원본·HTML·스크린샷은 Git 제외 `data/results/category-improvements-20261022/`에 보관한다.
