# 공용 콜백 URL 토큰 차단 검토

상태: 코드 검토 통과 (검토 Codex, 구현 Claude). 대상 b7b467050628aeafe6fafca6a9791f6bdf13cb4e, 브랜치 fix/auth-callback-url-token-20261101. 추가 차단 결함은 발견하지 못했다. 실제 운영 메일/로그인 검증과 배포 승인은 별도다.

## 확인

- 쿼리에 access_token 또는 refresh_token이 하나라도 있으면 PKCE code와 혼재해도 Auth 클라이언트 생성 전에 거절한다. 빈 값도 has로 차단한다. 기존 naver_at/naver_rt는 503으로 유지된다. 새 거절 응답의 no-store/no-referrer와 새 Auth 쿠키 없음은 격리 핸들러 검사에서 통과했다.
- 정상 Google/Kakao PKCE 교환, 안전한 next 정규화, 기존 회원 분기는 유지된다. Auth/프로필 오류 리다이렉트의 원문 msg가 제거됐다. 프로필 저장·권한 로직을 새로 우회하지 않는다.
- reset-password의 명시적 setSession이 없어졌고, 해시 access_token은 지우고 거절한다. 단순 소스 검색에만 의존하지 않고 설치된 @supabase/ssr와 auth-js도 확인했다. createBrowserClient는 PKCE를 강제하며 해당 auth-js는 implicit callback을 PKCE와 혼용하면 거절한다.
- 실제 설치 SDK를 번들링한 격리 Chromium에서 해시 토큰은 세션 없음·토큰 요청 0건이었다. recovery code와 브라우저 verifier가 있는 경우는 가짜 token endpoint 응답 1건으로 세션을 얻었다. 외부 네트워크는 차단했고 실제 계정·메일·Supabase를 사용하지 않았다. 이 검사는 SDK 동작 검증이며 서비스 전체 E2E나 운영 메일 형식 확인이 아니다.
- 앱 호출처와 작업 로그를 대조했다. 현재 앱은 자체 딥링크/웹뷰 세션 브릿지를 사용하며 이번 웹 callback 쿼리 토큰 경로를 호출하는 현행 코드는 발견하지 못했다. 이미 배포된 과거 앱의 실제 사용 여부는 소스 검토만으로 확정할 수 없다.

## 검증

- pnpm test 170/172. 실패 2건은 기존 profile-role-release 스냅샷 검사와 같은 항목이다.
- scripts/security 전체 102/105. 추가 실패 1건은 기존 withdrawal-only production 바이트 비교 항목이다. 보호 검사를 삭제하거나 완화하지 않았다.
- web lint·production build 통과. 공개 Supabase 설정은 로컬 비접속 값으로 대체했다.
- 자료: Git 제외 data/results/callback-review/의 sdk-browser.cjs, 테스트·보안 검사·lint·build 로그. 핸들러는 모의 Auth/쿠키를 사용하는 기존 실행 검사를 재실행했다.
- 전체 서버 기반 profile-role.spec.ts와 실제 Google/Kakao 로그인·재설정 메일 E2E는 미실행. 이전 검토에서 로컬 Next 서버 시작이 자동 승인 정책에 차단된 상태를 우회하지 않았다.

## 반영 전 확인

- Supabase 대시보드의 실제 메일 템플릿·리다이렉트 설정은 확인하지 않았다. 해당 서비스의 연결 도구가 없으며 이번 검토에서 운영 대시보드에는 접속하지 않았다. 스테이징에서 실제 재설정 메일을 보내 PKCE code와 원래 브라우저 verifier로 교환되는지 확인해야 한다. 주소만 code 형태여도 다른 브라우저에 verifier가 없으면 교환되지 않을 수 있다.
- main 병합은 운영 배포다. 기존 URL 토큰 수신을 되살리는 단순 revert를 정상 복구 절차로 권하지 않는다. 문제가 있으면 네이버 차단·URL 토큰 거절을 유지하는 수정으로 복구하고, 재설정 템플릿/PKCE 경로를 바로잡는다. 이 내용은 구현 로그의 '커밋 revert' 안내에 대한 보정이다.
- UI 브랜치에는 이번 콜백 수정이 아직 없으므로 병합 때 두 변경을 함께 대조하고 PendingActionRunner의 계정 전환 흐름도 재검증해야 한다.

작업 전 fetch·worktree·상태·AGENTS·CLAUDE·README·구현 로그 확인. 검토 문서와 상태만 같은 브랜치에 로컬 커밋한다. 구현·테스트 수정, push·배포·운영 설정·운영 DB 변경 없음. 문서는 UTF-8·Prettier·git diff --check로 확인한다.
