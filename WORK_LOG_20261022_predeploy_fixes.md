# 2026-10-22 배포 차단 수정·마감일 원문 검수

## 범위

- 기준 `7796b80`, `e66bb6b`, [이전 검증](WORK_LOG_20261022_seo_predeploy_validation.md). 시작 fetch 완료, clean, origin보다 기존 7커밋 ahead.
- 지역·모바일·교정 후보 18건·홍보 랜딩을 수정한다. 스키마/RLS·회원가입·OAuth·댓글 저장 코드는 유지한다.
- 사용자가 이번 요청에서 승인한 원문 확인 후 수정 범위로 운영 공고 7건의 마감일과 18건의 검수 기록을 반영했다. 앱 운영 배포·Git push는 하지 않는다.

## 원인·수정

- 지역: 기관·장소·우대 문장을 필수 자격으로 혼동하고 동명 구를 서울로 확정했다. 새 `region-context.js`는 자격/우대/기관/행사를 분리하고 실제 활성 taxonomy의 부모/full_name으로 해석한다. 17개 시도 별칭을 지원하지만 미등록 시군구는 임의 코드나 상위 시도로 대체하지 않는다. 모호·부정·복수 조건은 검수로 보내며 `regionCodes`에서 제외한다. 기존 `field_verification.classification.regionContext`에 근거를 보존하여 스키마 추가가 없다. 기존 공고 지역 관계를 일괄 수정하지 않았다.
- 모바일: 액션 바와 BottomNav가 모두 bottom 0이라 버튼을 가렸다. 공통 `--mobile-nav-height`와 `env(safe-area-inset-bottom)`로 바 높이·상세 액션 위치·본문 여백을 맞췄다. 좌우 Safe Area, viewport-fit=cover, 찜/공유 접근성 이름을 추가했다. 데스크톱 상대 배치는 유지한다.
- 교정: 높은 AI 신뢰도만으로 시작일/행사일을 종료일로 제안했다. open-ended 또는 미해결 dateQuality는 자동 적용을 차단한다. 명확한 deadline-mismatch 연장 동작은 기존 테스트로 보존한다.
- 홍보: 강서구 행사모집 랜딩에 `promotionOnly`를 적용해 미검수 날짜·홍보 제외·지난 공고를 걸러낸다. 일반 검색·공개 과거 공고·sitemap의 공개 조건과 분리한다. 필요한 JSON 필드만 투영하고 불필요한 count RPC는 생략한다. 기존 최대 48개 조회 내 통과 건수를 표시한다.

## 후보 18건 대조 결과

기존 종료일은 모두 null. 아래는 Asia/Seoul이며, 날짜만 있는 종료는 해당 일 23:59:59, 명시 시각은 원문 그대로 기록했다. 항목별 실제 출처 URL·판정 근거는 `scripts/crawler/src/review-deadlines-20261022.js`에도 보존한다.

| ID                                   | 대조 근거·판정                                                                                                 | 최종 종료일    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------- |
| b18ae132-f434-4f8c-af33-c87da3f319a5 | 청년새롬 공식 포털 74210 신청 9/22~10/9. 포스터 10/13은 첫 행사일                                              | 10/09 23:59:59 |
| 6c53d8d2-ee69-4e29-9e93-6b900dc3f7be | 신혼부부 공식 포털 74098 신청 9/17~10/22. 포스터 10/24는 수업일                                                | 10/22 23:59:59 |
| cee9981d-4a27-44d8-b105-d69d0da1b352 | [창업센터 원문](https://dobongstartup.com/bbs/board.php?bo_table=donotic&wr_id=155) 마감 및 실제 포스터        | 09/03 14:00:00 |
| 1f428c77-05f7-467d-a0b9-436a174ac64a | Instagram 직접 본문 불가. 공식 포털 72598 상세 신청 시각과 2026년 실제 포스터 확인, 조기 마감 유지             | 08/12 23:59:00 |
| aa2d4df0-2521-441d-9c54-50d907aeb6af | Instagram 직접 본문 불가. 공식 포털 73093 및 2026년 추가모집 포스터 일치                                       | 08/27 23:59:00 |
| 9acd1add-a209-4c52-8023-f97879883b98 | 기관 정상 본문 불가. 공식 포털 72777 신청 시각과 2026년 STEP-UP 포스터 일치                                    | 08/23 23:59:00 |
| e28be63d-fab1-4558-b32a-a8ee96c85fc4 | 기존 기관 본문 불가. 공식 포털 72913의 모집기간과 2026년 하반기 피지컬100 포스터 확인                          | 08/23 23:59:00 |
| 0347d306-c3fe-492f-9f90-9d39079d38af | [영암농장](https://news.seoul.go.kr/gov/archives/580360) 8/31 10:00~는 시작일                                  | null 유지      |
| e4a0a436-df97-49af-8b97-179acfbf8a94 | [남해 가을](https://news.seoul.go.kr/gov/archives/580364) 8/31은 시작일                                        | null 유지      |
| 3c30b029-f7b8-4fd4-b481-64f35a7b8440 | [괴산](https://news.seoul.go.kr/gov/archives/580306) 8/24는 시작일                                             | null 유지      |
| 595a95ea-2a05-4f0a-a0e6-8caa014569a2 | [부여](https://news.seoul.go.kr/gov/archives/580310) 8/24는 시작일. 여행 날짜/요일 충돌도 임의 보정하지 않음   | null 유지      |
| 59d21bff-d9b5-48d2-b0c6-1fa649cec347 | [영월 땅콩](https://news.seoul.go.kr/gov/archives/580314) 8/24는 시작일                                        | null 유지      |
| 986c1030-11e3-4b51-8d91-0360b8c97ac7 | [남해 여름](https://news.seoul.go.kr/gov/archives/580186) 8/17은 시작일                                        | null 유지      |
| 7fbd0b27-eaf7-4a02-afd2-8c66a356a9e1 | [영월 다슬기](https://news.seoul.go.kr/gov/archives/579930) 8/10 시작, 8/13 입금 안내일                        | null 유지      |
| 8e95ef7f-f256-4743-bab8-9a472d9a39f2 | [상주](https://news.seoul.go.kr/gov/archives/579936) 8/10 시작. 제목/본문 여행일 차이는 원문 불확실성으로 유지 | null 유지      |
| 29ae4735-b0dc-44e7-ae5f-3528173791b8 | 기관 본문 제한. 공식 포털 73556은 9/4~ 선착순                                                                  | null 유지      |
| ae79a191-1a39-45d5-a5ba-b51795a8235d | 공식 포털 73277은 8/22~ 선착순                                                                                 | null 유지      |
| be46a746-c141-4ae6-ae55-fa3c0416be54 | 기관 본문 제한. 공식 포털 73281은 8/25~ 선착순                                                                 | null 유지      |

- 포털 번호는 `https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=번호`이다. 직접 확인하지 못한 기관 원문과 공식 공공 재게시 근거를 구분했다. 추측한 마감일은 없다.
- 7건의 누락 종료일/모집 유형을 반영하고 11건은 날짜 및 모집 유형을 유지했다. 18건 모두 `deadlineReview`에 확인 시각·출처·근거·기존 AI 제안을 보존했다. 기존 dateQuality/dateIssues·전역 검수 상태·골든셋은 유지했다.
- 11건 및 이미 종료된 항목은 promotionEligible=false로 보존하고, 검수 당시 접수 가능한 성북구 1건은 추가 기간 검사를 거친다. published 상태는 18건 모두 유지했다.
- dry-run 후 `node scripts/crawler/src/review-deadlines-20261022.js --apply --confirm=DEADLINE_REVIEW_20261022` 실행. 대상 집합·상태·날짜 순서·updated_at 확인, 조건부 갱신·재조회 18/18 통과. 일회용 스냅샷 기준이며 재실행은 동시 변경 검사에서 차단된다.

## 변경 파일

- `scripts/crawler/src/region-context.js`, `region-context.test.js`, `region-rules.js`, `poster-classifier.js`, `upload-to-supabase.js`.
- `scripts/crawler/src/apply-field-verification-corrections.js`, 대응 테스트, `review-deadlines-20261022.js`.
- `apps/web/app/components/BottomNav.tsx`, `app/globals.css`, `app/layout.tsx`, `app/posters/[id]/PosterDetailClient.tsx`.
- `apps/web/lib/promotionEligibility.ts`, `publicDiscovery.ts`, `discoveryRoutes.test.ts`, `app/regions/[region]/[category]/page.tsx`.
- `apps/web/e2e/mobile-detail-actions.spec.ts`, `poster.spec.ts`, `playwright.mobile.config.ts`, `playwright.readonly.config.ts`.
- 이 로그와 `docs/seo_geo_search_visibility.md`.

## 검증

- 신규 지역 테스트 59개: 17개 시도, 동명 중/서/동/남/북/강서구·고성군, 광주시/광주광역시, 우대/부정/미등록/복수 범위·기관/장소 분리. 시작일 자동 마감 승격 방지 1개, 홍보 게이트 1개, 모바일 동작 6개 추가.
- 웹 단위 66개, 크롤러 381개, 웹 lint·별도 tsc, 모바일 typecheck 통과.
- 모바일 WebKit iPhone 13/SE 및 Chromium Pixel 7, Safe Area 0/34px에서 찜·공유 mock·신청 popup·하단 홈 이동 6개 통과. 실제 기기 OS/Safari toolbar·키보드는 미검증이다.
- 초기 개발 서버 공개 회귀 92개 중 90개 통과. 파일 갱신 중 HMR useContext 오류 1건과 기존 찜 테스트의 비동기 대기 누락 1건을 확인했다. 찜 테스트는 버튼을 조용히 건너뛰던 로직도 제거하고 접근성 이름·실제 로그인 안내 대기로 강화했다. 이후 고정된 production 빌드에서 전체 재검증을 통과했다.
- 운영 API mutation은 차단한다. OCR check-deadlines는 운영 데이터를 변경할 수 있어 readonly 설정에서 제외했다. 인증 사용자/관리자/운영자의 쓰기 테스트도 운영 DB에 실행하지 않는다.
- 읽기 전용 AI healthcheck exit 0, 품질 게이트 fail. 교정 후보 20→2, 남은 2건은 review 비공개. 저신뢰 이미지 판정 1건은 범위 밖 잔여다. 전체 품질 게이트 통과로 표현하지 않는다.
- Node 20 `pnpm --filter web build` 통과. 고정된 production 서버에서 공개 회귀 92/92개, 모바일 6/6개 통과. iPhone/Android 화면 캡처에서도 겹침이 없음을 확인했다.
- 공개 회귀에는 홈·목록·검색/지역 필터·상세·회원가입/로그인 화면·SSR·robots/sitemap·canonical/Twitter·JSON-LD HTTP 검증이 포함된다. 인증 후 저장 및 실제 OAuth 왕복 성공을 의미하지 않는다.
- sitemap의 고유 공고 3,088건 전부를 익명 Supabase 읽기로 다시 대조했다. 모두 published/closed 및 공개 exposure(null/A/B) 조건을 충족했고 비공개/누락/중복 위반은 0건이다. 마감된 공개 공고의 보관·색인은 신청 가능 홍보와 구분한다.
- 새 [Vercel Preview](https://poster-link-8vut9chai-maxmini0130s-projects.vercel.app) READY. 실제 배포 환경 SEO/HTTP 14개와 WebKit/Chromium 모바일 6개, 총 20/20개 통과. 홈·목록·상세 SSR, robots.txt, sitemap/index/shards, canonical·Twitter·JSON-LD를 실제 응답으로 확인했다. Preview 접근 보호용 쿠키는 Git 제외 디렉터리에만 저장했다.
- 운영 최신 배포 SHA는 `35603652fa989a4febcd92d7e2bb5c30bb0ccaab` 그대로다. Preview만 생성했으며 운영 배포·promote·push는 하지 않았다.

## 남은 위험·복구·배포

- 미등록 시군구와 애매한 지역은 자동 확정 대신 검수한다. 전국 별칭 지원은 전국 시군구 DB 구축을 뜻하지 않으며 검수량이 증가할 수 있다.
- 11건의 종료일은 여전히 미정이다. 광고 제외와 공개 과거 공고 보존은 구분한다.
- 실계정 카카오/네이버 왕복·로그인 후 찜/댓글 저장은 별도 테스트 계정/DB에서 확인해야 한다. 해당 구현과 RLS는 유지했다.
- Git 제외 `data/results/predeploy-fixes-20261022/`에 원본 HTML/포스터·plan·적용 결과·`before-apply.json`·`snapshot.json`을 보존했다. 이후 변경 여부를 대조하고 7건의 날짜/유형 및 18건 검수 JSON만 승인 범위에서 복구할 수 있다. 개인 연락처와 원문 전체를 커밋하지 않았다.
- 코드 복구는 이번 커밋의 일반 revert로 가능하다. 스키마 변경이 없어 migration 롤백은 없다. 이미지·링크·회원·댓글은 수정하지 않았다.
- 판정: **현시점 운영 배포 보류**. 요청된 지역 판정·모바일 가림·18건 교정 후보 문제의 코드 수정과 자동 회귀는 통과했다. 다만 전체 AI 품질 게이트가 FAIL이며 실계정 인증 왕복/저장 동작과 물리 기기 검증은 미완료다. 잔여 2개 비공개 교정 후보·이미지 경고를 해소하거나 배포 범위 밖으로 판단한 근거를 남기고, 테스트 계정에서 회원가입·카카오/네이버 로그인·찜·댓글 저장을 확인한 뒤 운영 배포를 재판정한다. 운영 배포는 하지 않았다.
