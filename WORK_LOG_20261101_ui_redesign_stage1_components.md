# UI 개편 1단계: 공통 컴포넌트와 접수 상태 공용 함수 연결

상태: 재검토 대기 (구현 Claude, 검토 Codex) — `e1fdecb` 포커스 P2 수정. 로컬 커밋만, push·배포·운영 DB 없음

기준: [UI 개편 지시서](docs/UI_REDESIGN_PLAN_2026-10-31.md) 1·2장, [재방문 지시서](docs/RETENTION_PLAN_2026-10-31.md) 3-1. 브랜치는 PR #16(`feat/retention-stage0-measurement-20261031`) 위에 있다(상세 화면을 두 작업이 함께 고치기 때문).

## 0단계 보고 후 결정 (2026-11-01 사용자 승인)

- 진행 순서: 1 공통 컴포넌트 → 2 상세 → 3 내 공고 → 4 홈·찾기 → 5 관심 조건·E2E. 단계마다 별도 브랜치.
- A/C 웹 변경(`fix/public-ac-web-20261025` `608fbc8`): 상태 함수 보강만 가져오고, 화면 변경은 이번 개편으로 대체한다.
- 지시서의 "기존 브랜드(잉크 네이비·종이 베이지·주홍·D-day 도장)"는 코드에 없었다. 새 토큰을 추가하고 개편하는 화면부터 적용한다. 개편 전 화면은 기존 색을 유지한다.
- 지역 섹션은 B(스테이징 검증) 전까지 숨긴다. 스키마 변경은 SQL만 제출한다.

## 변경

- 접수 상태: `lib/posterApplication.ts`에 `608fbc8`의 보강을 그대로 가져왔다(날짜만 있는 값은 KST 하루 끝, `posterStatus="closed"`면 종료). 기존 호출부는 `posterStatus`를 넘기지 않고 DB 값은 날짜+시각이라 현재 화면 동작은 바뀌지 않는다. `lib/usePosterClock.ts`도 가져왔다(아직 사용처 없음).
- 표시 문구: `lib/deadlineDisplay.ts`의 `getDeadlineDisplay`가 공용 상태 함수 결과를 지시서 문구로 바꾼다. 접수 예정 · 접수 중(D-n) · 오늘 마감 · 상시 모집 · 소진 시 마감 · 접수 종료 · 마감일 확인 필요("마감일은 원문에서 확인"). **날짜 신뢰 = 마감 유형 `fixed` + 해석 가능한 마감일**. DB 기본값이 `unknown`이라 유형 미확인 공고는 지금도 D-day가 없었고, 그 기준을 그대로 쓴다. `isClosingWithinDays`는 "7일 안에 마감"(오늘 포함 7일, 신뢰 날짜만).
- 디자인 토큰: `tailwind.config.ts`에 `pl-*` 색(지시서 1-1)과 `kakao`, 글꼴 `font-pl-serif`(Noto Serif KR 700)·`font-pl-sans`(Noto Sans KR). `layout.tsx`에서 `next/font/google`로 불러오되 미리 불러오지 않는다(개편 전 화면이 한글 글꼴 파일을 받지 않게).
- 화면 확대: `viewport`의 `maximumScale: 1` 제거(지시서 5장).
- 공통 컴포넌트 `app/components/pl/`:

| 지시서           | 구현                                                                                                                                                 | 기존 코드                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| DeadlineLabel    | `DeadlineLabel`(+ 상태 칩 `ReceptionChip`)                                                                                                           | `PosterCard` 내부 `deadlineLabel()`은 개편 화면 전환 때 교체                                       |
| DdayStamp        | `DdayStamp`(신뢰 날짜만, 84px 이중 원, -8°, `role="img"` 설명)                                                                                       | 신규                                                                                               |
| 공고 카드        | `PosterListCard`(56×72 썸네일·분야·기관·2줄 제목·마감, 카드 전체 링크, 행동은 링크 밖 `footer`)                                                      | 기존 `PosterCard` 데이터 형태(`PosterCardData`)를 그대로 받는다. 기존 카드는 화면 교체 시까지 유지 |
| 작은 가로 카드   | `PosterMiniCard` + `PosterMiniRail`(168px, `role=list`)                                                                                              | 신규                                                                                               |
| RegionLabel      | `RegionLabel`(주변 지역·서울 전체·전국)                                                                                                              | 신규                                                                                               |
| SectionHeader    | `SectionHeader`(제목 + 조건 줄 + 위 작은 줄 + 더 보기)                                                                                               | `HomeClient`의 `SectionTitle` 대체 예정                                                            |
| 하단 행동 바     | `ActionBar` + `FavoriteButton`(`찜하기`/`찜함`, `aria-pressed`) + `PrimaryActionLink`                                                                | 상세 `.poster-detail-actions` 대체 예정. md 이상 숨김                                              |
| 하단 탭          | 기존 `BottomNav` 확장: 현재 탭 감지 + `aria-current="page"`, 비활성 글자 대비 개선(gray-400→500)                                                     | 탭 이름(찾기·내 공고)은 3단계에서 내 공고 화면과 함께 바꾼다                                       |
| 포스터 제보 버튼 | `ReportFab`(`/posters/request` 링크, md 이상 숨김)                                                                                                   | 신규                                                                                               |
| 토스트           | `ToastProvider`를 화면 아래(탭 위)·PC 왼쪽 아래로 이동, `showActionToast`(한 줄 + 행동 1개, `role=status`)                                           | 기존 `toast.*` 호출은 그대로 동작(위치만 바뀜)                                                     |
| 바텀시트         | `BottomSheet`(모바일 하단 시트, md 이상 가운데 창, `role=dialog`·`aria-modal`·제목 연결, 포커스 가두기·ESC·바깥 클릭 닫기·여는 버튼으로 포커스 복귀) | `ClosedPosterAlertCta`의 자체 시트는 2단계 종료 공고 화면에서 교체                                 |
| ApplyMark        | `ApplyMark`(신청했어요 → 신청 표시됨 + 표시 취소, 알림 켜짐이면 "알림을 끌까요?")                                                                    | 신규. 저장은 3단계 `favorites.user_status`                                                         |
| GuideCard        | `GuideCard`                                                                                                                                          | 신규                                                                                               |

- 확인용 페이지 `/dev/ui`: 서버 환경변수 `UI_SHOWCASE=1`일 때만 열린다. 그 밖(운영·Preview 포함)은 404, `noindex`. 샘플 카드는 제목에 `[샘플]`을 붙였다.

## 숨김·미적용

- 실제 화면에는 아직 아무 컴포넌트도 넣지 않았다(2단계부터 화면별 적용). 데이터가 없어 숨긴 섹션도 아직 없다.
- 토스트가 상세 화면 하단 행동 바와 겹치지 않도록 `--pl-bottom-extra` 변수를 두었다. 상세 화면(2단계)에서 행동 바 높이를 넣는다.

## 검증

- 단위 테스트: `deadlineDisplay.test.ts` 5건(신뢰 날짜 D-n·오늘·KST 날짜, 미신뢰 날짜 D-day 없음, 무기한·종료 문구, 운영자 종료, 7일 안 마감 경계) + 기존 `posterApplication.test.ts` 8건 통과. 루트 `pnpm test`에 등록.
- 브라우저 점검 37/37(로컬 production 빌드 + `/dev/ui`, Supabase·`/api/*`·Sentry 요청은 브라우저에서 차단): 390·768·1280px 가로 넘침 없음, 768px 이상에서 하단 탭·행동 바·제보 버튼 숨김, 바텀시트 대화상자 라벨·`aria-modal`·포커스 진입·Tab/Shift+Tab 가두기·ESC 닫기·포커스 복귀(390·1280), 토스트 `role=status`·행동 1개·모바일 하단/PC 왼쪽 아래, 찜 `aria-pressed` 전환, 신청 표시 전/후/취소와 알림 질문, 홈 탭 `aria-current` 1개, 확대 허용 viewport, 미신뢰 날짜에 도장 없음.
- 스크린샷(시안 `Main.dc.html`과 나란히 포함): 스크래치패드 `ui-s1/`.
- 회귀: web lint PASS, build PASS, `pnpm test` 224/226(기존 실패 2건 `profile-role-release`), `scripts/security/*` 104/107(기존 실패 3건, `origin/main`과 동일), `scripts/retention/*` 28/28, `git diff --check` PASS.
- 별건 수정: PR #16 브랜치의 지표 SQL 테스트가 Windows CRLF 체크아웃에서 SQL 블록을 못 읽어 4건 실패하던 문제를 그 브랜치에서 고쳤다(`591b0a4`) 후 이 브랜치에 병합했다.

## 다음

- Codex 검토 후 2단계(공고 상세 ①~④ + PC 상세, 재방문 2단계 비회원 찜·가입 연결)를 별도 브랜치에서 시작한다.

## Codex 검토 반영 (`a279e87`의 P2 3건)

- [검토 기록](WORK_LOG_20261101_ui_redesign_stage1_review.md).
- P2-1 D-day 신뢰 조건: 공용 상태 함수는 마감 유형이 없거나 `scheduled`여도 날짜로 남은 일수를 계산한다. 표시 계층(`getDeadlineDisplay`)에서 정규화한 유형이 `fixed`(별칭 `고정`)일 때만 D-n·오늘 마감·도장·"7일 안에 마감"을 허용하고, 나머지는 "마감일은 원문에서 확인"으로 둔다. 공용 함수와 기존 호출부는 그대로 둔다. 회귀 테스트: 유형 undefined·null·빈 값·`scheduled`·`예정` × 2일 뒤·오늘 마감 10가지와 `고정` 별칭. 수정 전 코드에서 실패 확인.
- P2-2 바텀시트 포커스 이탈: 포커스 후보를 실제로 탭 이동 가능한 요소(`tabIndex >= 0`, 숨김·`inert` 조상 없음, 렌더 박스 있음, `visibility` 보임)로 좁혔다. 첫 후보가 없거나 포커스가 실패하면 패널에 포커스한다. Tab 처리 시 현재 포커스가 후보 밖(패널 자체 포함)이면 처음/끝으로 보낸다. 스크립트 등으로 포커스가 시트 밖으로 나가면 `focusin`에서 되돌린다.
- P2-3 바텀시트 잘림: 패널 최대 높이를 화면 높이(모바일 `100dvh - 12px`, PC `100dvh - 48px`, `vh` 대체값 포함)로 제한하고 내용은 패널 안에서 스크롤한다.
- 회귀 검사 `apps/web/e2e/ui-components.spec.ts` + 전용 설정 `apps/web/playwright.ui-components.config.ts`(global setup 없음, 계정 로그인 없음, Supabase·`/api/*`·Sentry 요청 차단). `UI_SHOWCASE=1`로 띄운 서버에서 `E2E_UI_SHOWCASE=1 npx playwright test -c playwright.ui-components.config.ts`로 실행하며, 기본 E2E 실행에서는 건너뛴다. 5건: 일반 시트 포커스(390·1280), 숨겨진 첫 버튼·`tabindex=-1`·열린 뒤 비활성화된 버튼·스크립트 포커스 이탈, 390×240 짧은 화면, 390×600 글자 200%. 수정 후 5/5, 수정 전 시트 코드에서는 숨김 컨트롤·짧은 화면 검사가 실패함을 확인했다. 이를 위해 `/dev/ui`에 예외 상태 시트를 추가했다.
- 검증: 마감 표시·상태 함수 14/14, 컴포넌트 검사 5/5, web lint·build PASS, `pnpm test` 225/227(기존 실패 2건), `scripts/security/*` 104/107(기존 실패 3건), `git diff --check` PASS. 짧은 화면·200% 글자 스크린샷은 스크래치패드 `ui-s1/sheet-short-390x240.png`, `sheet-text200-390x600.png`.

## Codex 재검토 반영 (`e1fdecb`: 비활성 fieldset 안 입력)

- 원인: 포커스 후보를 `disabled` 속성으로만 걸러, 비활성 `<fieldset>` 안의 입력(속성은 없지만 실제로 비활성)이 후보에 남았다. 그 요소에 `focus()`가 실패하면 브라우저 기본 Shift+Tab이 배경으로 이동했다.
- 수정: 후보에서 `:disabled` 상태를 제외하고, Tab·Shift+Tab을 항상 시트가 직접 처리한다(브라우저 기본 이동 차단). 다음 후보부터 순서대로 포커스를 시도해 실제로 포커스가 옮겨졌는지 확인하고, 모두 실패하면 패널에 둔다. 초기 포커스와 밖으로 나간 포커스 복귀도 같은 함수를 쓴다.
- 회귀 검사: `/dev/ui` 예외 시트에 비활성 fieldset과 입력을 추가하고, 열자마자 Shift+Tab을 6번 눌러도 시트 안에 머물고 그 입력에 가지 않는지 확인한다. 수정 전 시트(`2b7e63e`)에서는 이 검사가 실패하고, 수정 후 컴포넌트 검사 5/5 통과.
- `deadlineDisplay.ts` Prettier 경고를 고쳤다(형식만).
- 참고: Codex 환경에서는 로컬 Next 서버 시작이 정책으로 막혀 E2E 5건을 실행하지 못하고 별도 fixture로 검증했다. 이 검사는 사용자 PC에서 `UI_SHOWCASE=1` 서버로 실행한다.
