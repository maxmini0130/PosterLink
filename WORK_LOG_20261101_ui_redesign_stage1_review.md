# UI 개편 공통 컴포넌트 Codex 검토

상태: 수정 필요 (구현 Claude, 검토 Codex) — `2b7e63e` 재검토: D-day·스크롤 해결. P2-2의 disabled fieldset 포커스 예외 1건 남음

## 범위

브랜치 `feat/ui-redesign-s1-components-20261101`, 검토 시 HEAD `8e88a11`. 구현 `a446ff4a4a1ea2e5cf5a6d540c3c39d993c815b5`와 병합된 CRLF 변경 `591b0a4d4f7200e54acbf41b385f03099f4581ae`를 검토했다. `a446ff4` 이후 웹 코드가 바뀌지 않은 것을 확인했다. 시작 전 fetch와 status를 확인했고 사용자 변경은 없었다.

기준: [계획서](docs/UI_REDESIGN_PLAN_2026-10-31.md) 1·2·5장, 재방문 계획 3-1, [구현 기록](WORK_LOG_20261101_ui_redesign_stage1_components.md). 실제 상세 화면 연결은 다음 단계이며 이번 검토는 공통 컴포넌트와 전역 변경 범위다.

## P2-1 — fixed가 아닌 마감도 D-day 신뢰 날짜가 된다

위치: `apps/web/lib/deadlineDisplay.ts:105-117`.

`getDeadlineDisplay`는 `getPosterApplicationState`의 daysLeft 유무만으로 `dateTrusted=true`를 만든다. 기존 상태 함수는 마감 유형이 누락되면 날짜로 상태를 추론하며, `scheduled`와 날짜가 함께 있어도 미래 시작일이 없으면 daysLeft를 반환한다. 따라서 새 함수의 계약인 "fixed + 해석 가능한 날짜"가 강제되지 않는다.

고정 시각 `2026-11-03 12:00 KST`, 마감 `2026-11-05 23:59:59 KST`에 유형을 각각 undefined·null·빈 문자열·scheduled로 주면 네 경우 모두 `D-2`, `dateTrusted=true`, `daysLeft=2`가 나온다. D-day 도장과 "7일 안에 마감" 분류도 이를 그대로 사용한다. 기존 테스트는 날짜가 있으면서 유형이 빠진 사례를 다루지 않는다.

수정 방향: 새 표시 계층에서 정규화된 마감 유형이 fixed인지 명시적으로 확인해 날짜 신뢰 여부를 결정한다. 신뢰하지 않는 날짜는 도장·D-n·날짜 기반 섹션에서 제외하고 원문 확인 문구로 처리한다. 공용 상태 함수의 기존 호출부에 대한 호환성은 별도로 보존한다. 네 누락/비고정 유형과 오늘 마감 경계를 회귀 테스트로 추가한다.

## P2-2 — 숨겨진 첫 컨트롤이 있으면 시트의 포커스 가두기가 실패한다

위치: `apps/web/app/components/pl/BottomSheet.tsx:5-6`, `40-42`, `54-65`.

포커스 후보는 CSS selector로만 구하고 hidden/display:none 등 실제 표시 여부를 확인하지 않는다. 첫 후보가 숨겨져 있으면 focus()가 아무 일도 하지 않지만 다음 후보로 재시도하거나 패널로 이동하지 않는다. 이후 Tab 처리도 현재 포커스가 후보의 첫/끝인 경우만 처리한다.

실제 BottomSheet를 가져온 격리 React fixture에서 children의 첫 요소로 `<button hidden>`을 넣었다. 열기 직후 활성 요소는 시트의 버튼이 아닌 호출 버튼(`opener`)에 남았다. Tab을 누르자 배경 링크(`background`)로 이동했고 `closest('[role=dialog]')`는 없었다. 사용자 입력이 배경으로 전달되는 모달 접근성 결함이다. 이 fixture는 실제로 제공 가능한 children이며 컴포넌트 소스나 DOM을 사후 변경하지 않았다.

수정 방향: 표시되고 실제로 탭 이동 가능한 요소를 수집하고, 최초 포커스 실패·후보 변경·패널 밖 포커스도 처리한다. 적절한 모달 primitive 재사용도 검토한다. 숨겨진 첫 요소, 음수 tabindex, 동적 disabled 상태를 포함한 회귀 검사가 필요하다.

## P2-3 — 낮은 화면이나 확대 글자에서 시트 상단을 읽을 수 없다

위치: `apps/web/app/components/pl/BottomSheet.tsx:91` 및 body overflow 잠금 부분.

패널에 화면 높이에 맞춘 max-height와 내부 overflow-y 스크롤이 없다. 모바일 하단 정렬에서 내용이 높아지면 패널 상단이 화면 밖으로 나가고, body는 overflow:hidden으로 잠겨 있어 잘린 부분을 읽기 위한 스크롤 경로가 없다.

계획서의 가입 안내 2문장·주 버튼·나중에 버튼·각주를 담은 fixture에서 재현했다. 390×240의 패널 top은 -40.75px이며 제목 윗부분이 잘렸다. 390×600에서 루트 글자 크기를 200%로 키우면 패널은 약 682px, top -81.5px이고 제목이 잘린다. 패널은 overflow-y:visible이고 scrollHeight와 clientHeight가 같아 내부 스크롤도 없다. 스크린샷으로 확인했다. 이는 글자 크기 확대 검사이며 브라우저 자체 확대율을 조작한 검사는 아니다.

수정 방향: 화면의 사용 가능한 높이에 맞춰 패널 최대 높이를 제한하고 내용을 스크롤할 수 있게 한다. 짧은 화면·확대 글자에서 제목, 본문, 주 버튼과 닫기 버튼 모두 접근 가능한지 확인한다.

## 통과 항목과 검증

- 390·768·1280px 일반 높이 fixture에서 dialog 제목 연결, 초기 포커스, Shift+Tab/Tab 순환, ESC 닫기, 호출 버튼 포커스 복귀가 통과했다. 위 예외 상태의 실패와 구분한다.
- 토큰 값과 기본 공통 컴포넌트 구조, 링크 밖 카드 행동, 아이콘 라벨, 찜 aria-pressed, 확대 제한 제거를 확인했다. 탭 이름 변경과 실제 화면 연결이 후속 단계라는 구현 기록을 따랐다.
- `591b0a4`는 문서의 CRLF를 LF로 바꾸는 처리만 추가한다. LF와 CRLF 문서를 따로 구성해 추출 SQL이 같고 첫 4개 블록이 비어 있지 않은 것을 확인했다. 실제 SQL 테스트 4건도 통과했다. SQL 본문이나 단언을 완화하지 않았다.
- 기존 관련 검사 **17/17 PASS**(마감 표시 5, 접수 상태 8, 지표 SQL 4). 별도 유형 신뢰 재현은 **1/5 PASS**: CRLF 동일성 1건 통과, 잘못된 D-day 신뢰 4건 실패다.
- 전체 `pnpm test` **224/226 PASS**, 실패 2건은 기존 `profile-role-release` 검사다. web lint·production build PASS. 검토 문서 Prettier와 `git diff --check` PASS.
- 브라우저는 실제 BottomSheet TSX를 esbuild로 번들링하고 빌드된 웹 CSS를 사용한 격리 fixture다. 모든 브라우저 네트워크 요청을 차단했으며 앱 provider나 운영 API를 실행하지 않았다. 전체 앱 E2E·실제 로그인·실제 스크린리더 조작은 수행하지 않았다.
- 자료는 Git 제외 `data/results/ui-s1-review/`: fixture·브라우저 재현 코드, 결과 JSON, 390·768·1280 스크린샷, 짧은 화면과 확대 글자 스크린샷, 날짜/CRLF 재현과 테스트·lint·build 로그. 실제 웹·테스트 구현은 수정하지 않았다.
- push·배포·운영 DB 쓰기 없음. 검토 문서만 같은 브랜치에 로컬 커밋한다. 세 지적 수정 후 재검토가 필요하다.

## 2b7e63e 재검토

대상: `2b7e63e36b62d4c717e8c06fc7c27bd2a5c7498a`. 판정: **미통과, 포커스 P2 1건 남음**. 기존 유형 신뢰(P2-1)와 시트 잘림(P2-3)은 해결됐다. P2-2의 숨겨진 첫 요소 사례도 해결됐으나, 실제 탭 이동 가능 여부를 거르는 조건이 아직 불완전하다.

### P2 — disabled fieldset 안의 입력을 포커스 후보로 취급한다

위치: `apps/web/app/components/pl/BottomSheet.tsx:9-18`, `91-92`.

`<fieldset disabled><input /></fieldset>` 안의 input은 자체 disabled 속성이 없어 selector의 `input:not([disabled])`에 걸리고 `tabIndex`도 0이다. 렌더 박스와 표시 상태 조건도 통과하지만 브라우저에서는 `:disabled` 상태라 실제로 포커스할 수 없다. 후보 첫 요소가 이 input이면 초기 포커스는 패널로 대체되지만, Tab 처리와 focusin 복귀에서는 같은 불가능한 요소에 계속 focus()를 호출한다.

실제 컴포넌트 TSX와 빌드 CSS를 쓴 fixture에 disabled fieldset을 첫 children으로 넣고, 뒤에 활성 주 버튼과 기본 닫기 버튼을 뒀다. 브라우저에서 input의 `tabIndex=0`, 자체 disabled 속성 없음, `matches(':disabled')=true`를 확인했다. 열기 직후 패널에 포커스했고 Tab을 누르면 패널에 그대로 갇혔다. Shift+Tab 세 번은 닫기 버튼 → 주 버튼 → **배경 링크**로 이동했으며 복귀하지 않았다. 배경 링크를 스크립트로 focus해도 시트로 돌아오지 않았다. 구현이나 DOM을 사후 변경하지 않고 정상적으로 제공 가능한 children으로 재현했다.

수정 방향: 자체 속성뿐 아니라 네이티브 `:disabled` 상태를 제외해 fieldset 상속 비활성화를 반영한다. focusin에서 후보 focus가 실패했을 때도 패널 등 유효한 위치로 복귀하도록 보강한다. 첫 비활성 fieldset, 열린 중 fieldset 상태 변경, Tab/Shift+Tab 순환과 외부 포커스 회수를 회귀 검사에 포함한다. 현재 E2E의 disabled 검사는 버튼 자체의 속성만 바꿔 이 사례를 놓친다.

### 검증

- 마감 표시·접수 상태 **14/14 PASS**. 이전 독립 재현(비고정 4건, CRLF 1건)을 함께 실행해 **19/19 PASS**. `fixed`/`고정`만 신뢰 날짜가 되며 비고정 유형의 오늘 마감도 차단된다.
- 격리 브라우저에서 일반 390·768·1280 시트의 포커스 진입·순환·ESC·호출 버튼 복귀와 숨겨진 첫 요소 사례가 통과했다. 390×240 패널 top=12px, clientHeight=228px/scrollHeight=281px, overflow=auto다. 390×600 글자 200%는 top=12px, clientHeight=588px/scrollHeight=682px다. 제목이 화면 안에 있고 잘린 부분을 내부에서 스크롤하는 구조를 확인했다.
- 제공된 Playwright 설정은 global setup 없이 대상 5건을 수집한다(`--list` 확인). **실제 5건은 실행하지 못했다.** 로컬 `UI_SHOWCASE=1` Next 서버 시작 명령이 자동 승인 검토에서 `blocked by policy`로 거부됐다. 같은 서버 시작을 다른 경로로 재시도하지 않고, 외부 요청을 전부 차단한 기존 격리 브라우저 fixture로 검증했다. 실제 앱 provider/E2E·스크린리더 조작은 미실행이다.
- web lint·production build PASS. 빌드의 Supabase 공개 주소·키는 로컬 대체값으로 설정해 운영 연결을 피했다. 전체 `pnpm test` **225/227 PASS**, 실패 2건은 기존 `profile-role-release` 검사다.
- 코드 Prettier는 `lib/deadlineDisplay.ts` 1파일에 형식 경고가 남았다. 다른 검사 대상 파일은 통과했고 코드는 수정하지 않았다. 검토 문서는 Prettier와 `git diff --check`로 확인한다.
- 자료: Git 제외 `data/results/ui-s1-rereview-2b7e63e/`의 fixture·브라우저 코드·결과 JSON·스크린샷, 마감 검사·전체 검사·lint·build 로그, E2E 수집 목록. 핵심 재현은 `browser-results.json`의 `disabled-fieldset` 항목이다.
- 코드 수정·push·배포·운영 DB 쓰기 없음. 같은 브랜치의 검토 문서와 작업 상태만 로컬 커밋한다. 포커스 예외 수정 후 재검토가 필요하다.
