# UI 개편 5단계 검토

상태: ac2d355·f7bfd91 재검토 코드 검토 통과 — 기존 P2·P3 해결 확인 (검토 Codex, 구현 Claude). 대상 0ebec607d273daac4d0b832722e857c43b3c4c37·c3748da, 브랜치 feat/ui-redesign-s5-interests-20261101. 구현 코드는 수정하지 않는다.

## P2. 온보딩 저장 성공 후 더 새로 고른 비회원 조건까지 삭제함

위치: apps/web/app/onboarding/page.tsx:110.

페이지를 열 때 비회원 조건 A를 읽어 폼에 채우지만, 저장 성공 시에는 현재 저장소의 조건을 무조건 clearGuestInterest로 지운다. 온보딩 API가 처리 중인 동안 다른 탭/열려 있던 관심 선택 화면에서 B를 고르면, A 저장 성공 뒤 B까지 사라진다. A가 계정에 저장됐다는 결과는 새 B의 이전 완료를 뜻하지 않는다.

실제 OnboardingPage를 번들링해 React hooks·JSX·Auth와 API 응답을 격리했다. 최종 단계의 실제 버튼 핸들러를 실행하고 API를 보류한 뒤, 저장소에 savedAt이 다른 B를 기록했다. API 성공 후 B가 null로 삭제되는 것을 재현했다. 같은 실제 핸들러에서 API 실패 시에는 기존 기록이 유지됐다. 이 검사는 화면 전체 E2E가 아닌 실제 핸들러의 독립 경합 검사다.

수정 방향: 폼에 이어받은 조건의 식별값/버전/내용을 보존하고 계정 저장 성공 후 그 기록과 여전히 일치할 때만 정리한다. 페이지 진입 후 또는 요청 중 새로 고른 기록은 유지한다. 불필요한 전체 저장소 삭제로 해결하지 않는다.

회귀 검사: A를 미리 채움 → 저장 요청 보류 → B 저장 → A 성공에도 B 유지. 변경 없는 A 성공 때만 삭제, API 실패 시 A/B 보존, 페이지를 열어 둔 사이 B가 바뀐 경우도 포함한다.

## P3. 조건 삭제 실패를 성공으로 처리하고 홈으로 이동함

위치: apps/web/lib/guestInterest.ts:42-48,92-94; apps/web/app/interests/InterestsClient.tsx:138.

조건을 모두 해제하면 saveGuestInterest는 removeItem을 호출한다. remove가 예외를 삼키고 반환값을 주지 않는데 호출부는 항상 true를 반환한다. 이전 조건이 남았어도 finish는 오류 안내 없이 홈으로 이동하고 저장 이벤트까지 기록한다.

순수 함수와 실제 InterestsClient를 렌더링한 격리 Chromium 양쪽에서 재현했다. 기존 지역·분야를 모두 해제하고 removeItem만 실패하도록 하면, 오류 안내 0건·홈 이동·이전 조건 보존이었다. 데이터 손실은 아니지만 사용자가 고른 조건과 실제 홈 조건이 달라지는 비차단 보완 사항이다.

수정 방향: 삭제 성공 여부를 반환하고 실패하면 finish의 기존 저장 실패 안내로 처리한다. clearGuestInterest의 best-effort 정리와 사용자가 요청한 조건 저장의 성공 판정은 구분한다.

## 나머지 검토

- 첫 진입은 VisitClock의 탭별 entry 기록과 shouldOfferInterestPicker를 조합한다. 회원·기존 조건·이미 제안한 기록·공고/검색/공유/파라미터 진입은 자동 전환 대상에서 제외한다. 저장소 접근 예외는 함수에서 처리한다. 앱 WebView 실제 첫 실행은 별도 검증이 필요하다.
- 관심 선택은 비회원 저장소와 계정 설정을 분리한다. 정상 저장, 홈의 조건별 RPC 인수, 제거된 지역/분야를 읽는 경우의 이름 조회를 확인했다. 회원이 /interests를 열면 계정 수정으로 이동한다. 대표 지역 한 개·분야 18개는 구현 로그의 범위 결정과 일치한다.
- 회원 온보딩의 지역 조회에 parent_id가 추가되어 기존 지역 helper가 자치구를 찾을 수 있다. 비회원 지역·분야는 실제 목록에 있는 ID만 미리 채운다. API 실패 시 삭제하지 않지만 성공 시 기록 정리는 위 P2를 해결해야 한다.
- 온보딩 저장 API의 기존 서비스 역할 사용은 이번 커밋에서 변경되지 않았다. 네이버 설계의 서비스 역할 예외를 승인한 것으로 보지 않는다.
- c3748da는 온보딩 스냅샷만 기능 커밋으로 고정한다. 보안 허용 목록의 파일 범위나 보호 규칙을 넓히지 않았고 기존 검사도 통과했다. P2 수정으로 온보딩이 바뀌면 스냅샷도 새 검토 대상 내용으로 갱신해야 한다.
- 새 interests.spec.ts의 '전체 흐름'은 계정 로그인 왕복을 모의 세션 쿠키로 대체한다. 실제 OAuth 왕복·온보딩 이전 성공을 검증한 것으로 확대 해석하지 않는다.

## 검증

- pnpm test 276/278, scripts/security 전체 104/107. 실패는 기존 profile-role-release 2건과 withdrawal-only 바이트 비교 1건과 같은 항목이다.
- web lint·production build 통과. 공개 Supabase 설정은 로컬 비접속 값으로 대체했다.
- 독립 검사: 실제 온보딩 핸들러의 새 기록 삭제 재현·API 오류 보존, 순수 함수의 삭제 실패, 실제 InterestsClient의 390/1280px 정상 선택·저장과 삭제 실패 재현을 수행했다. 브라우저의 모든 외부 요청을 차단했고 Auth·라우팅·분류 조회·측정은 fixture로 대체했다. 두 폭에서 가로 넘침이 없었고 생성 화면도 확인했다. 사용자가 제공한 비교 스크린샷도 확인했다. 전체 서비스 E2E는 아니다.
- 전용 interests.spec.ts 5건 수집만 확인. 실제 서버 E2E 25건, 카카오 인증, 운영 Supabase 메일·온보딩·WebView는 미실행. 이전 로컬 Next 서버 시작의 자동 승인 정책 차단을 우회하지 않았다.
- Git 제외 자료: data/results/ui-s5-review/onboarding.cjs, storage.ts, interests-browser.cjs, interests-390.png·1280.png, 테스트·보안·lint·build 로그.

작업 전 fetch·worktree·상태·AGENTS·CLAUDE·README·지시서·구현 로그 확인. 검토 문서와 상태만 같은 기능 브랜치에 로컬 커밋한다. 구현·기존 테스트 수정, push·배포·운영 DB·설정 변경 없음. UTF-8·Prettier·git diff --check 확인.

## ac2d355·f7bfd91 재검토

대상 ac2d35526fffc016de48cd5f59e06a6010706f9d·f7bfd91. **코드 검토 통과: 기존 P2 1건·P3 1건 해결 확인. 이번 수정 범위에서 추가 차단 결함은 발견하지 못했다.** 이전 수정 필요 판정은 이력이며 실제 OAuth·운영 반영 승인은 별도다.

### 수정 확인

- 온보딩은 비회원 조건을 읽어 미리 채우는 같은 effect에서 carriedInterest.current에 기록을 보존한다. API 성공 후 현재 저장소의 지역·분야 순서/내용·savedAt이 모두 일치할 때만 clearGuestInterestIf로 지운다. 페이지를 열거나 저장한 뒤 새로 고른 조건은 비교가 달라 보존된다. 같은 선택을 더 늦은 시각에 다시 저장하는 경우도 단위 검사에서 보존됐다.
- 실제 OnboardingPage를 번들링하고 실제 미리 채우기 effect와 최종 버튼 핸들러를 실행했다. 분류·Auth·React hooks·API는 fixture로 대체했다. API 응답 보류 중 A를 B로 교체한 뒤 A 성공 → B 유지, 변경 없는 A 성공 → 삭제, API 실패 → 기록 유지가 모두 통과했다. effect가 실행되지 않아 정리 자체를 생략하는 거짓 통과가 아니도록 변경 없는 A의 정상 삭제도 확인했다.
- remove 함수는 삭제 성공 여부를 반환하고, saveGuestInterest의 빈 조건 저장도 그 결과를 반환한다. 실제 InterestsClient의 격리 Chromium 검사에서 removeItem 실패 시 오류 안내 1건·홈 이동 없음·기존 기록 보존을 확인했다. 정상 지역·분야 저장도 390/1280px에서 통과했고 가로 넘침은 없었다.
- f7bfd91은 승인 스냅샷을 수정 기능 커밋으로 갱신할 뿐 허용 파일 범위를 넓히지 않는다. 보안 검사 결과도 기존과 같았다.

### 검증

- pnpm test **278/280**. 실패 2건은 기존 profile-role-release 스냅샷 항목이다.
- scripts/security 전체 **104/107**. 실패 3건은 위 2건과 기존 withdrawal-only 생산 소스 비교 항목이다. 신규 guestInterest 단위 8건은 통과했다.
- web lint·production build 통과. 공개 Supabase 설정은 로컬 비접속 대체값을 사용했다.
- Git 제외 자료: data/results/ui-s5-rereview/onboarding.cjs·interests-browser.cjs, 390/1280px 스크린샷, 테스트·보안·lint·build 로그. 실제 컴포넌트를 사용하지만 전체 서비스 E2E는 아니다. 브라우저의 외부 요청은 모두 차단했고 계정·분류·라우팅·측정은 모의 처리했다.
- 실제 카카오 왕복·회원 온보딩 저장·여러 실제 탭의 완전 동시 스케줄·WebView·운영 설정은 이번 검사 범위 밖이다. 조건 비교와 삭제는 localStorage의 원자적 DB CAS를 제공하는 구조는 아니며, 재현했던 저장 요청 전후의 새 기록 보존을 검증했다. 기존 전체 서버 E2E를 새로 실행했다고 주장하지 않는다.

### 함께 요청된 콜백 push·메일 템플릿 확인

- 사용자의 명시적 push 승인에 따라 별도 fix/auth-callback-url-token-20261101 브랜치를 origin에 push했다. 원격 refs/heads/fix/auth-callback-url-token-20261101이 검토 기록을 포함한 2fbc232ff77f0474f7b3f72f18f3eeb2ef285f4c와 일치함을 ls-remote로 확인했다. main 병합·운영 배포는 하지 않았다. UI 브랜치는 push하지 않는다.
- Supabase 메일 템플릿은 미확인이다. computer-use 스킬로 기존 Chrome 창을 선택하려 했으나 Windows 컴퓨터 사용 도구가 '현재 브라우저 URL을 충분한 확신으로 확인할 수 없어 정책을 집행할 수 없다'고 중단했다. 이후 브라우저 입력이나 다른 경로의 컴퓨터 사용 우회는 하지 않았다. 대시보드/메일 템플릿을 읽거나 바꾸지 않았다.
- 실제 재설정 메일의 PKCE code 형식, 시작한 브라우저의 verifier와 교환되는 흐름은 여전히 운영 반영 전 확인 대상이다. URL 토큰 수신을 되살리는 단순 revert를 복구 방법으로 권하지 않는 기존 검토 의견도 유지한다.

검토 문서와 구현 로그의 상태만 같은 UI 브랜치에 로컬 커밋한다. 구현·기존 테스트 수정, 운영 DB·설정 변경·마이그레이션 적용·배포 없음. 콜백 기능 브랜치 push만 위 명시 승인 범위에서 실행했다. 문서 UTF-8·Prettier·git diff --check 확인.
