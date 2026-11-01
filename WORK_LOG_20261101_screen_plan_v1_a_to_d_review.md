# 화면 기획 v1.0 A~D 검토 (2026-11-01)

상태: 검토 대기 — 구현자 수정 후 재검토 필요. 검토 Codex, 구현 Claude. 기준 b143a76~1c84d43 (feat/screen-plan-v1-20261101). P2 3건으로 검토 미통과. 검토자는 코드·SQL·데이터를 수정하지 않고 이 기록만 같은 브랜치에 커밋한다.

## 검토 범위

- 작업 전 origin fetch, status, worktree 목록 확인. 대상은 C:/Maxmini_Project/PosterLink-plan-v1, 원격과 동일한 1c84d43이며 시작 시 작업 트리는 깨끗했다. AGENTS·CLAUDE·README와 구현 작업 기록을 읽었다.
- 기준은 메인 폴더의 미커밋 docs/design/PosterLink_Screen_Plan_v1.pdf 중 03·04(홈), 05(분류와 검색), 09(공고 품질·상태) 및 관련 구현이다. PDF 스킬을 읽고 pypdf로 원문 텍스트를 확인했다. 원본 PDF나 다른 작업 폴더의 미커밋 파일은 수정하지 않았다.
- A의 상태·크롤러·백필 계획·새 검색 SQL, B의 분류 선택/확장, C·D의 홈 데이터·그룹·카드 및 회귀 검사를 대조했다. 백필과 마이그레이션을 적용하지 않았다.

## P2-1. 내 공고는 운영 종료일을 읽지도 전달하지도 않아 같은 공고의 상태가 달라짐

위치: apps/web/app/lib/posterCards.ts:7–16, 55 및 apps/web/app/my-posters/MyPostersClient.tsx:77–82.

이번 변경은 eventEndAt을 공통 상태 함수에 추가했지만 내 공고의 loadPosterCards는 event_end_at을 SELECT하지 않고 카드로 옮기지도 않는다. 내 공고의 applyInput도 이 값을 전달하지 않는다. 따라서 홈·찾기·상세에서 접수 종료인 공고를 내 공고는 계속 접수 중/소진 시 마감으로 묶고 표시한다. 함수가 같더라도 입력이 달라져 화면 간 일관성이 깨진다.

재현: published, deadlineType=until_exhausted, eventEndAt=2026-10-25, now=2026-11-01 12:00 KST. 실제 getDeadlineDisplay는 closed를 반환한다. 실제 MyPostersClient의 applyInput 코드를 추출해 같은 카드를 통과시키면 until_exhausted다. 저장소 조회 단계에서는 종료일 자체가 이미 빠진다. 괴산 사례와 같은 상태를 찜해 둔 사용자가 영향을 받는다.

수정 방향: 카드 조회·변환·그룹 입력 모두 event_end_at/eventEndAt을 전달하고, 비회원/회원 내 공고의 카드와 묶음이 종료로 일치하는 회귀 검사를 추가한다. 기존 PosterCard 역시 종료일을 받지 않으므로 그 컴포넌트를 사용하는 화면도 함께 조사한다.

## P2-2. 대분류 확장이 서버 최초 조회에 적용되지 않아 찾기 진입 경로별 결과가 다름

위치: apps/web/lib/publicDiscovery.ts:136–157, apps/web/app/posters/PosterListClient.tsx:155, 423–428.

홈 및 클라이언트 재검색은 categoryScopeIds로 교육/취업을 교육강좌·채용까지 확장한다. 그러나 /posters의 최초 서버 렌더링과 분류/지역 랜딩이 공유하는 fetchPublicDiscovery는 선택한 대분류 ID 하나로 search/count RPC를 호출한다. PosterListClient는 최초 fetch를 건너뛰므로 URL로 직접 들어온 사람은 필터를 다시 조작하기 전까지 누락된 결과를 그대로 본다. 서버 랜딩·건수·구조화 데이터도 좁은 기준을 사용한다.

재현: 실제 fetchPublicDiscovery를 education 대분류와 course 하위 유형이 있는 가짜 분류표·가짜 Supabase 응답으로 실행했다. search_public_posters와 count_public_posters 모두 p_category_id=education만 받았고 course 조회는 없었다. 교육강좌에만 연결된 공고는 /posters?category=education 직접 진입에서 누락되지만 클라이언트 필터 재조작 후에는 포함될 수 있다. 구현자 보고의 운영 7건 대 245건 격차가 이 경로에서 다시 나타날 수 있으며, 이 검토에서는 운영 수치를 새로 조회하지 않았다.

수정 방향: 최초 SSR·분류/지역 랜딩과 클라이언트가 같은 분류 범위 및 중복 제거·건수 계산을 공유하게 한다. URL 직접 진입과 클라이언트 필터 선택 결과가 같고 교육강좌/채용만 태깅된 공고도 나오는 회귀 검사를 추가한다.

## P2-3. 홈이 지역 묶음을 나누기 전에 60건으로 잘라 실제 내 지역 공고를 숨김

위치: apps/web/app/lib/homeData.ts:173–187, 210, 217 및 apps/web/lib/homeSections.ts의 지역 묶음 처리.

loadInterestRows는 선택 지역·상위 지역·전국을 합친 범위에서 분류별 최신 60건만 가져온 뒤 클라이언트에서 지역을 나눈다. 전국 대상의 최신 공고가 많으면 실제 내 지역 공고가 제한 밖으로 밀려 주 목록이 비거나 작게 보인다. 더 보기는 이미 받은 배열을 6개씩 늘리는 것뿐이어서 제한 밖 공고는 도달할 수 없다. 단순 표시 개수 제한이 아니라 관심 공고가 존재해도 없다고 안내할 수 있는 조회 순서 문제다.

재현: 실제 loadInterestRows를 실행하되 read RPC만 가짜 응답으로 대체했다. 같은 분야의 최신 전국 공고 61건과 그보다 오래된 유효한 서울 공고 1건을 제공했다. p_limit=60으로 전국 60건만 남았고 서울 공고는 반환되지 않았다. 이후 그룹핑으로 복구할 수 없다. 운영 데이터가 이 fixture와 같다고 주장하는 결과는 아니다.

같은 형태로 loadNearbyRows는 분야 조건 없이 60건을 받은 뒤 분야를 거르고, latest는 24건을 받은 뒤 운영 종료를 거른다. 따라서 해당 절차도 조건에 맞는 후보가 제한 밖에 있는 경우를 확인해야 한다. 운영 종료 검색 마이그레이션이 미적용된 동안 최신 종료 공고가 조회 한도를 차지할 수 있다는 점도 있다.

수정 방향: 상태·분야·지역 묶음별 조건을 먼저 적용한 뒤 표시 한도를 적용하거나 실제 커서/페이지네이션으로 충분한 유효 후보를 수집한다. 전체 보유 개수로 오인될 숫자를 제한된 후보 배열 길이로 표시하지 않는다. 전국 최신 공고가 내 지역 공고보다 많아도 내 지역 주 목록이 유지되는 회귀 검사를 추가한다.

## 확인된 사항·보류 사항

- 전국을 최상위 범위로 포함하는 지역 보완은 parent_id가 빠진 시·도 fixture의 검색·그룹 검사에서 확인됐다. 이 코드 보완의 존재만으로 운영 지역 parent_id 정정이 승인되는 것은 아니다.
- 제안된 분류 연결표는 구현에 반영돼 있다. 지원사업을 모두 지원금/복지로, 정보·보도·입찰을 모두 기타로 묶는 의미적 정책은 사용자 결정 사항이며 기술 검토 통과와 별도다. 대분류 7개+기타 노출은 기획과 맞는다.
- 20261102010000은 공개 검색과 count의 open 분기를 같은 조건으로 바꾸고 권한 우회 경로를 추가하지 않는다. 운영 종료일 KST 경계 및 미래 fixed 마감 예외의 기존 로컬 SQL 검사는 통과했다. 운영 적용 승인으로 해석하지 않는다.
- 백필 51건·운영 종료 46건·조건 결과 65+6건은 구현자가 보고한 운영 조회 결과다. 이 검토에서는 운영 데이터로 재확인하지 않았다. 백필 apply·원문 재검수·운영 데이터 정정은 실행하지 않았다.
- 제공된 390·768·1280·1440 첫 화면 캡처 네 장을 직접 열어 읽었다. 캡처에서 모바일 2열, 태블릿 3열, PC 주 목록+보조 영역과 큰 안내 상자 제거를 확인했다. 390 캡처에는 카드 4개가 충분히 보인다. 정적 캡처 확인을 실제 모든 폭의 DOM 가로 넘침 측정이나 최신 운영 데이터 검증으로 보고하지 않는다.

## 검증

- Git 제외 data/results/screen-plan-review/repro.cjs: 실제 homeData·publicDiscovery·내 공고 applyInput·deadlineDisplay 코드를 esbuild로 격리해 가짜 읽기 응답으로 위 세 문제를 assert 재현했다. 비밀값이나 운영 DB 연결을 사용하지 않았다.
- 관련 단위·SQL 테스트 38/38 PASS: posterApplication, categoryTaxonomy, homeSections, searchGroups, discoveryRoutes, open-search-migration.
- 크롤러 관련 테스트 14/14 PASS: poster-structured-fields, plan-deadline-fact-backfill. 실제 백필 main은 실행하지 않았다.
- 로컬 localhost:4000의 기존 home-search·interests Playwright fixture 테스트를 실행했다. 테스트의 Supabase 쓰기는 가짜 응답, 앱 API·외부 추적 요청은 차단된다. 서버 페이지의 공개 읽기 요청은 발생할 수 있다. 11/11 PASS(31.8초). 이 검사는 원본을 수정하지 않고 기존 fixture로 실행했으며 위 세 누락 사례를 검증하는 테스트는 아니다.
- 검토 문서 Prettier·git diff --check 확인. 원본 코드 수정이 없어 전체 build/lint·전체 테스트·크롤러 전체 326건은 반복하지 않았다. 제공 캡처 외 실제 데이터 화면을 조작하거나 찜·제보·로그인·계정 변경을 실행하지 않았다.
- 결론: A~D 전체 승인 전 위 P2 수정과 재검토가 필요하다. E 구현 승인, 분류 정책 승인, PR 생성·push·병합·Promote 및 운영 SQL/백필/지역 정정은 수행하지 않았다. 검토 기록만 같은 브랜치에 로컬 커밋한다.
