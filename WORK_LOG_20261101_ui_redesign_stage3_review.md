# UI 개편 3단계 내 공고·합치기 Codex 검토

상태: 수정 필요 (구현 Claude, 검토 Codex) — `72a05ab`·`b665833`, P2 3건. 검토 문서만 같은 브랜치에 커밋

## 범위

브랜치 `feat/ui-redesign-s3-my-posters-20261101`, 구현 `72a05ab93ea353381446cdf85d8fe578a2afb755`와 허용 목록·작업 기록 `b665833eb89548a22de2eec8c79b0cb33ed124be`를 검토했다. 시작 전 fetch와 깨끗한 status를 확인했다. 기준은 [작업 기록](WORK_LOG_20261101_ui_redesign_stage3_my_posters.md), UI 지시서 ⑨⑩·PC 내 공고·계정 메뉴와 재방문 지시서 2-4·3-1이다.

**미통과**: 일반 합치기·마이그레이션·메뉴의 확인 결과는 아래와 같지만, 삭제된 공고로 인한 합치기 정체와 목록 상태 경합·미확인 상태 분류를 수정해야 한다.

## P2-1 — 삭제된 공고 하나가 정상 찜까지 계속 합치지 못하게 한다

위치: `apps/web/lib/guestStore.ts:274-279`, `apps/web/app/components/PendingActionRunner.tsx`의 mergeIntoAccount 일괄 upsert.

브라우저 찜은 공고 삭제 뒤에도 남을 수 있다. 계정에 없는 ID 전체를 한 번에 upsert하므로, 그중 이미 삭제된 공고가 하나라도 있으면 favorites.poster_id 외래키로 전체 문장이 실패한다. 나머지 정상 공고도 저장되지 않는다. 다음 화면에서 같은 목록을 다시 시도하므로 영구 오류가 반복된다. 로컬 기록은 남지만 회원 화면은 계정 기록만 보여 이 실패 자료를 화면에서 정리할 수도 없다.

실제 mergeGuestFavorites와 PGlite에서 운영과 같은 favorites→posters FK·고유 조건을 사용했다. 삭제된 ID 1개와 유효 ID 1개를 넣고 두 번 실행한 결과 모두 failed, SQL 오류는 두 번 모두 23503, 계정 favorites는 0건이고 로컬에는 2건이 남았다. 유효 공고를 합칠 수 있어야 한다는 독립 회귀 기대값은 실패했다. 운영 DB나 계정에 쓰지 않았다.

수정 방향: 삭제·접근 불가 등 영구 실패 자료를 구분하고 유효한 공고의 이전까지 막지 않는 처리·복구 경로를 둔다. 실패 자료는 무조건 지우지 말고 보존·안내하되, 사용자가 회원 화면에서도 해결할 수 있어야 한다. 영구 오류와 일시 오류를 같은 무조건 재시도로만 처리하지 않는다.

## P2-2 — 재조회 결과가 성공한 신청 표시·찜 취소를 되돌린다

위치: `apps/web/app/my-posters/MyPostersClient.tsx:159-168`, removeMember·setApplied.

loadSeq는 조회와 조회 사이 순서만 보호한다. 사용자 쓰기는 이 버전을 갱신하거나 진행 중 조회를 무효화하지 않는다. 합치기/완료 이벤트로 재조회가 진행되는 동안 사용자가 변경하면, 이전 상태를 읽은 조회가 나중에 setState(next)로 성공한 변경을 덮어쓴다.

실제 컴포넌트를 렌더하고 GUEST_MERGED_EVENT로 시작한 조회를 보류한 뒤 쓰기를 성공시켰다. 신청 표시 후에는 화면에 표시가 있었지만 과거 interested 응답을 해제하면 표시가 사라졌다. 찜 취소 후 카드가 0개인 상태에서 같은 과거 응답을 해제하면 카드 1개가 되살아났다. 두 경우 모두 모의 서버 쓰기는 성공했다. 화면만 과거 상태가 되며 새로고침 전 사용자 판단과 다음 행동을 잘못 유도한다.

수정 방향: 성공한 쓰기 이후 과거 조회를 적용하지 않도록 변경 버전·요청 세대를 함께 보호하거나, 진행 중 조회를 취소하고 쓰기 후 최신 자료를 조회한다. 다른 카드의 동시 변경도 고려한다. 두 순서를 회귀 검사로 고정한다.

## P2-3 — 접수 일정이 전혀 미확인인 공고도 접수 중으로 묶는다

위치: `apps/web/lib/myPosters.ts:21-26`.

receptionGroup은 scheduled·closed 이외를 모두 open으로 반환한다. 접수 시작·마감이 없고 deadline_type=unknown인 공고는 공용 표시 함수에서 unconfirmed인데도 목록 제목은 "접수 중"이 된다. 카드의 원문 확인 문구만으로 섹션의 잘못된 접수 상태 주장이 없어지지 않는다.

정확한 입력으로 getDeadlineDisplay가 unconfirmed인 것을 확인한 뒤 분류했으며 실제 그룹은 open이었다. 독립 부정 검사가 실패했다. 현재 기존 테스트에는 미래 종료일이 있는 unknown 사례만 있고, 날짜가 전혀 없는 미확인 사례가 없다.

수정 방향: 공용 함수의 미확인 상태를 보존한다. 공고를 숨기거나 현재 접수 가능하다고 추론하지 말고, 중립적인 미확인 묶음/안내로 계속 접근할 수 있게 한다. 날짜 없음·해석 실패 등 확인 필요 상태를 함께 검사한다.

## 요청한 네 항목의 확인 결과

1. **합치기 기본 조건:** guestStore 기존 12건에서 서버 성공 뒤 정리, 조회/쓰기 실패 시 유지, 이미 있는 공고를 제외한 upsert, 쓰기 대기 중 추가된 다른 공고 유지가 통과했다. 초기 ID 목록에 대해서만 정리하고 새 ID는 다음 합치기로 남긴다. 단, 위 삭제된 ID의 영구 실패 처리에는 결함이 있다. 실제 여러 탭의 모든 저장 순서·계정 통합은 검증한 것이 아니다.
2. **마이그레이션:** 20261101010000은 기본 interested·NOT NULL·두 값 CHECK를 추가하고 RLS를 넓히지 않는다. PGlite 기본값·허용 값·재실행·본인만 수정·공고 종료 뒤 상태 유지 2건이 통과했다. 내 공고는 컬럼 오류 후 기존 조회로 대체하며 신청 표시 탭/버튼 0개와 찜 카드 유지가 브라우저에서 확인됐다. 상세도 42703/PGRST204 각각 신청 표시가 숨겨지고 찜은 유지됐다. 허용 목록의 SQL은 72a05ab 내용과 일치하며 고정 검사 12/12 PASS. **운영 적용하지 않았다.**
3. **AccountMenu:** 실제 컴포넌트에서 Enter 열기·첫 항목 포커스, ArrowDown, Home, ArrowUp 순환, End, ESC 닫기와 호출 버튼 복귀, Tab으로 다음 외부 버튼 이동, Shift+Tab으로 호출 버튼 이동, 바깥 클릭 닫기가 통과했다. aria-expanded/menu/menuitem·44px 항목과 알림 설정 hash 대상도 확인했다. 실제 스크린리더 조작은 하지 않았다.
4. **경로 이동 영향:** 새 내비게이션·마이페이지 링크는 /my-posters로 바뀌었고 이벤트 출처 분류도 favorites를 유지한다. /favorites 페이지는 redirect하지만 **비회원에게는 직접 별칭이 아니다**. 실제 middleware를 Auth 모의로 실행하면 /favorites는 먼저 /login?redirectTo=%2Ffavorites로, /my-posters는 guest 진입으로 간다. 기존 로그인 화면은 redirectTo를 읽지 않아 로그인 후 홈으로 가므로 구주소의 비회원 방문은 새 목록으로 바로 이어지지 않는다. 이 차이는 작업 기록에도 밝힌 기존 보호 규칙 유지에 따른 제한이며 새 미들웨어 완화는 하지 않았다. 로그인 회원의 페이지 redirect와 비회원의 미들웨어 선행을 구분해 안내해야 한다.

## 검증·제한

- 대상 guestStore·myPosters·migration 기존 검사 **16/16 PASS**. 날짜 미확인 독립 검사 포함 **16/17 PASS**이며 위 분류 사례 1건 실패. 삭제된 공고를 포함한 별도 PGlite 검사도 실패했다. 목록 경합은 실제 React 컴포넌트·모의 조회/쓰기로 재현했다.
- 전체 `pnpm test` **242/244 PASS**, 실패 2건은 기존 profile-role-release 검사다. web lint·production build PASS. 주요 신규 파일 Prettier PASS. 빌드에는 Supabase 공개 설정의 로컬 대체값을 사용했다.
- 브라우저 fixture는 실제 MyPostersClient·AccountMenu·상세/공통 컴포넌트와 빌드 CSS를 쓰되 Auth·API·카드 조회 및 일부 레이아웃을 대체했다. 모든 브라우저 네트워크를 차단했다. 마이그레이션 전 화면 스크린샷도 확인했다. 전체 서비스 화면 E2E나 실제 로그인 결과로 표현하지 않는다.
- 전용 E2E 12건은 **수집만 확인**했다. 이전 로컬 Next 서버 시작의 자동 승인 정책 차단을 우회하지 않았다. 실제 로그인·합치기·신청 표시 저장과 웹·WebView는 스테이징 검증이 남는다.
- 자료: Git 제외 data/results/ui-s3-review/의 browser.cjs·browser-results.json, detail-browser.cjs·detail-results.json, group-review.test.ts, deleted-merge.test.ts·실패 로그, routing.cjs·routing-results.json, 테스트·lint·build·고정 검사 로그와 스크린샷.
- 구현 코드·기존 테스트 수정, 운영 DB 조회/쓰기·마이그레이션 적용·push·배포 없음. 검토 문서와 상태만 같은 브랜치에 로컬 커밋한다. 문서는 Prettier와 git diff --check로 확인한다.
