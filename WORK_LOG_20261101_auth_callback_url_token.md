# 공용 로그인 콜백 URL 토큰 수신 제거 (2026-11-01)

상태: 코드 검토 통과·운영 확인 대기 (구현 Claude, 검토 Codex; b7b4670, WORK_LOG_20261101_auth_callback_url_token_review.md 참조). 브랜치 `fix/auth-callback-url-token-20261101`(`origin/main` `8f6a164`에서 분기). 로컬 커밋만, push·배포·운영 DB·설정 변경 없음.

## 문제

- [auth/callback/route.ts](apps/web/app/auth/callback/route.ts)가 `?access_token=&refresh_token=`을 받아 그대로 `setSession`했다. 공격자가 자기 토큰 쌍을 넣은 주소를 열게 하면 피해자 브라우저가 공격자 계정으로 로그인되고, 그 뒤 찜·관심 조건·신청 표시가 공격자 계정에 쌓인다(로그인 CSRF).
- [reset-password/page.tsx](apps/web/app/reset-password/page.tsx)도 `#type=recovery&access_token=&refresh_token=`을 `setSession`했다. 같은 종류의 문제다.
- 콜백이 Supabase 오류 원문을 `?msg=`로 로그인 화면에 넘겼다.
- 발견 경위: 네이버 로그인 보안 설계 검토(`docs/NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md` 7장, Codex 확인).

## 호출처 확인

- 웹 로그인·가입·마감 알림: `signInWithOAuth`의 `redirectTo` → PKCE `?code=`만 사용.
- 비밀번호 재설정: `resetPasswordForEmail`을 PKCE 브라우저 클라이언트(`@supabase/ssr` `createBrowserClient`, 기본 `flowType: pkce`)로 호출 → 메일 링크는 `?code=`. 클라이언트가 로드 시 교환한다.
- 앱(`apps/mobile/App.tsx`): Google·카카오는 네이티브 PKCE + 앱 스킴 딥링크로 세션을 받고, 웹뷰에는 스크립트로 직접 넣는다. 웹 `/auth/callback?access_token=`을 부르지 않는다.
- 토큰 분기의 기원: 2026-04 옛 네이버·implicit 흐름(`baa8147`, `162b3ee`). 현재 호출처 없음.
- 테스트만 사용: `e2e/security/profile-role.spec.ts`(로컬 가짜 서버), `scripts/security/naver-emergency-stop.test.ts`.

## 변경

- 콜백: `access_token` 또는 `refresh_token` 쿼리가 하나라도 있으면 Auth 클라이언트를 만들기 전에 `/login?error=login_failed`로 보낸다. `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, 쿠키 없음. `code`가 함께 있어도 거절한다.
- 콜백: `setSession` 분기 삭제. 오류 리다이렉트에서 `msg=` 제거(로그인 화면은 오류 종류별 기본 문구만 보여줌).
- 비밀번호 재설정: 해시에 `access_token`이 있으면 해시를 지우고 "유효하지 않은 링크" 안내 후 `/forgot-password`로 보낸다. 세션은 PKCE 교환 결과만 쓴다.
- 테스트:
  - `naver-emergency-stop.test.ts`: "native session callback 유지" 검사를 "URL 토큰 거절"로 바꿨다(5가지 쿼리, Auth 클라이언트·세션·쿠키 0건, `no-store`·`no-referrer`). 웹 코드 전체에 `.setSession(`이 없고 콜백에 `msg=`가 없음을 검사한다.
  - `e2e/security/profile-role.spec.ts`: 로컬 콜백 토큰 테스트를 "거절, 프로필 쓰기 0건"으로 바꿨다.

## 검증

- 새 검사는 수정 전 코드에서 2건 실패, 수정 후 통과(되돌려 확인).
- `scripts/security/*`: 102/105. 실패 3건은 **기존 실패**(`main` 기준선도 100/103, 같은 3건: 과거 릴리스와 바이트 비교하는 고정 검사).
- `pnpm test`: 170/172. 실패 2건은 **기존 실패**(`profile-role-release`).
- `pnpm --filter web lint`: 경고·오류 없음. `pnpm --filter web build`: 성공.
- 로컬 빌드 서버 HTTP: 토큰 쿼리 3가지 모두 307 → `/login?error=login_failed`, `Set-Cookie` 없음. 운영 Supabase로 가는 요청 없음(거절이 클라이언트 생성 전).
- `git diff --check` 통과.
- 실행하지 않음: `e2e/security/profile-role.spec.ts`(가짜 Auth 서버·전용 설정 필요), 실제 Google·카카오 로그인과 비밀번호 재설정 메일(스테이징 필요).

## 사용자 영향과 남은 일

- 정상 로그인(PKCE)·앱 로그인에는 변화 없음. URL에 토큰을 담은 옛 링크는 로그인 화면 오류로 끝난다.
- 비밀번호 재설정 메일이 implicit 형식(`#access_token`)으로 오는 설정이라면 재설정이 막힌다. 현재 웹 클라이언트는 PKCE라 `?code=` 링크가 나와야 하지만, Supabase 메일 템플릿을 바꾼 적이 있는지는 대시보드에서 확인이 필요하다(사용자 확인).
- UI 개편 브랜치의 `PendingActionRunner`(계정이 바뀔 때 대기 행동이 다른 계정으로 실행되지 않는지)는 이 브랜치에 없다. 이번 수정으로 URL을 통한 계정 전환 경로가 없어졌으므로 별도 위험은 줄었지만, UI 브랜치를 이 위에 올릴 때 다시 확인한다.
- 배포: 사용자가 push·PR·병합. `main` 병합은 운영 배포다. 되돌리기는 이 커밋 revert.
