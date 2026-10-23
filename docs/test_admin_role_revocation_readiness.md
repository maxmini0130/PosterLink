# 테스트 관리자 권한 회수 준비 결과

후속 상태: 별도 사용자 승인 후 대상 2개를 user로 변경했고 실제 관리자 3개 및 기존 참조 데이터를 보존했다. [실행 결과와 미검증 사항](../WORK_LOG_20261023_test_admin_roles_revoked.md)을 우선 확인한다. 전역 세션 폐기·ban·삭제는 실행하지 않았다. 아래는 실행 전 준비 기록이다.

2026-10-23. 읽기 전용 조회와 실행 방법 검토만 완료했다. 역할 변경·로그인·토큰 갱신/폐기·ban·계정 삭제·운영 설정 변경은 하지 않았다. 대상 Auth ID·이메일·개별 로그인 시각·개별 참조 건수는 저장소 밖 현재 Windows 사용자 전용 ACL의 비공개 보고서에 제공한다.

## 대상과 현재 상태

이전 비공개 기준 명부의 두 테스트 Auth ID 및 이메일과 현재 Auth 관리자 GET 결과가 정확히 일치한다. 두 프로필은 여전히 super_admin이며 활성 ban은 없다. 실제 관리자 3개도 ID별 역할이 기준과 일치한다. 최근 성공 로그인은 last_sign_in_at으로 비공개 보고서에 제공했으며, 새 로그인이나 비밀번호 검증은 하지 않았다. 따라서 실제 현재 로그인 성공을 확인했다고 표시하지 않는다.

대상별 comments.user_id와 admin_actions.actor_user_id 건수를 HEAD count=exact로 조회해 연결 행이 있음을 확인했다. 실제 FK도 SELECT로 재확인했다. comments는 Auth 삭제 시 CASCADE, admin_actions는 profiles 참조 NO ACTION이다. 이번 제안은 프로필 role과 해당 updated_at만 변경하고 새 역할 변경 감사 기록을 추가하므로 기존 댓글/감사 기록·Auth ID·프로필·참조는 그대로 남는다. 계정 삭제·참조 NULL 처리·감사 기록 삭제는 하지 않는다.

실제 auth.sessions에는 대상 합계 39행, auth.refresh_tokens에는 141행이 있다. 과거·만료·폐기된 항목이 포함될 수 있어 활성 세션/유효 토큰 수로 해석하지 않는다. 토큰 문자열은 SELECT하지 않았다. 운영 보호 guard 활성 1개도 확인했다.

## 승인 후 최소 역할 회수 방법

기존 [서버 역할 API](../apps/web/app/api/admin/users/[id]/route.ts)를 사용한다. 운영자가 승인된 실제 최고 관리자 세션으로 대상별 `PATCH /api/admin/users/<비공개 보고서의 Auth ID>`에 `{"role":"user"}`를 전달하는 경로다. 이름 검색만으로 실행하지 않는다. 브라우저에서 service_role을 사용하거나 profiles.role을 직접 수정하지 않는다.

API는 getUser, DB caller super_admin, 허용 role, 자기 역할 변경 금지를 검증한 뒤 서버 service_role로 해당 ID를 수정하고 admin_actions에 감사 기록을 추가한다. 실행 직전 이메일/ID/예상 super_admin 및 유지 대상 ID 제외를 재대조한다. 두 작업은 하나의 트랜잭션이 아니므로 첫 계정 성공 후 두 번째 전에도 결과를 읽고, 오류나 예상 외 대상이면 즉시 중단한다. API는 이전 role 조건을 SQL WHERE로 원자적으로 검증하지 않으므로 동시 역할 관리 작업을 피하고 직전·직후 값을 대조해야 한다. 감사 INSERT는 역할 변경과 원자적이지 않고 오류 처리 한계가 있으므로 감사 기록 존재도 별도로 확인한다.

예상 결과는 지정된 두 ID만 super_admin → user, 실제 관리자 3개는 그대로다. 다른 변경이 없다면 관리자 분포는 super_admin 1/admin 2지만 합계만으로 성공 판정하지 않는다. 계정 자체는 일반 사용자로 남으므로 역할 회수만으로 일반 회원 로그인·서비스 사용이 금지되는 것은 아니다.

## 세션/Refresh Token 폐기 방법과 남은 실행 조건

확인된 공식 SDK 메서드는 서버에서 `auth.admin.signOut(targetUserJwt, 'global')`이다. **첫 인수는 Auth ID나 서비스 키가 아니라 대상 사용자의 유효한 로그인 JWT**다. 현재 설치된 GoTrueAdminApi도 POST /logout?scope=global에 그 JWT를 보내는 구현이다. 공식 문서: [관리자 signOut](https://supabase.com/docs/reference/javascript/auth-admin-signout), [전역 로그아웃](https://supabase.com/docs/guides/auth/signout), [세션](https://supabase.com/docs/guides/auth/sessions).

로컬 관리자 세션 캐시는 한 대상과 일치하지만 access token의 exp는 이미 지났다. 이는 로컬 주장 확인일 뿐 서명/서버 유효성 검증은 아니다. 이번에 토큰을 사용하거나 refresh하지 않았다. 다른 대상의 유효 JWT 실행 수단도 확보됐다고 주장하지 않는다. 따라서 **역할 회수 방법은 확인됐지만 두 계정 모두의 전역 세션 폐기를 바로 실행할 수 있는 준비는 완료되지 않았다.**

실행 시 대상의 기존 유효 JWT가 안전한 서버 환경에서 확보돼 있다면 ID/sub 대조 후 위 global signOut을 사용하고 세션/refresh 상태를 재조회한다. 없다면 운영자가 사용하는 Supabase 관리자 도구에서 해당 ID의 전체 세션 폐기 기능 지원을 확인하거나 Supabase 지원을 통해 검증된 ID 기반 방법을 먼저 확정해야 한다. 존재가 확인되지 않은 `revokeSessions(userId)` API나 직접 Auth 내부 테이블 DELETE를 실행 절차로 제시하지 않는다. 새 로그인·magic link 발급·저장된 refresh token 사용도 이번 승인 범위에 없으므로 임의 수행하지 않는다.

전역 로그아웃은 refresh 자격을 폐기하지만 이미 발급된 access JWT의 만료를 소급시키지 않는다. 관리자 경로의 DB 역할 재검증이 그 유효 창에서 중요하다. 선택적인 ban은 새 로그인 차단이며 기존 세션 폐기의 대체물이 아니다. 로그인 차단까지 원하면 기간과 대상 ID를 포함한 별도 승인이 필요하다. [공식 사용자 관리 안내](https://supabase.com/docs/guides/auth/managing-user-data).

## 회수 후 검증 절차

1. 두 대상의 Auth ID별 profiles.role=user, 실제 관리자 3개의 기존 role 유지, 기존 댓글/감사 참조 및 새 역할 변경 감사 기록을 읽기 전용으로 대조한다.
2. 대상에게 이미 승인된 유효 세션을 사용할 수 있다면 `/admin`이 차단되는지 확인한다. middleware는 DB role을 읽어 user를 홈으로 redirect하고, 세션이 없으면 로그인으로 redirect한다. 이미 열린 관리자 화면의 표시만으로 성공/실패를 판단하지 않는다.
3. 계정 목록 조회 `GET /api/admin/users`가 403(세션 무효 시에도 해당 GET 구현은 403), 역할 변경 API는 인증 실패 401/권한 부족 403이어야 한다. 역할 PATCH를 실제 회원에게 시험하지 않는다. 일반 회원 차단은 격리 회귀를 우선 사용하고, 운영 대상 API 검사가 꼭 필요하면 별도 승인된 검증 요청/수단만 사용한다.
4. 세션 폐기는 반환 성공뿐 아니라 세션/refresh 상태와 기존 refresh 거부를 허용된 방식으로 확인한다. refresh 실제 시도도 Auth 상태를 변경할 수 있어 승인 없이 하지 않는다. access JWT 만료 전 일반 회원 기능 접근이 남을 수 있음을 분리해 보고한다.
5. 실제 관리자 3개가 본인 세션에서 각자 허용된 기능을 확인한다. 테스트 관리자 권한을 재부여해 E2E를 통과시키지 않는다. 실패 시 추가 변경을 중단하고 사전 값/감사 이력을 확인한다. 보호 guard·RLS를 해제하지 않는다.

## 운영 테스트 재생성/승격 위험

현재 로컬 루트 및 웹 환경의 E2E 관리자 이메일이 한 대상과 일치하고, 저장 관리자 캐시도 같은 대상이다. 실행 중인 로컬 E2E는 없다. globalSetup은 기존 계정 로그인만 수행하며 명시적 계정 생성/승격 코드는 없다. 그러나 운영 Supabase ref 차단이 없고 자격 제거 시 기존 캐시를 비우지 않는 경로가 남아 있다. 기본 Playwright는 원격 URL을 허용한다. 관련 코드와 workflows는 운영 기준 이후 변경되지 않았으며 이전 조사에서 CI 자동 생성/승격은 발견하지 못했다. 외부/수동 자동화 전체는 미확인이다.

권한 회수 전 해당 자격을 사용하는 테스트를 중단하고 별도 Supabase 테스트 ref·키·합성 계정으로 분리한다. 앱 URL뿐 아니라 Supabase ref allowlist를 seed/E2E에 적용하고 운영 키를 테스트에 주입하지 않는다. 지정된 관리자 캐시만 교체·폐기하고 실제 운영 관리자/일반 회원 세션은 건드리지 않는다. 서비스 관리 키를 가진 seed는 guard의 신뢰 대상이므로 보호 SQL만으로 재생성/승격 방지가 완료된 것은 아니다. 이 설정 개선은 아직 구현하지 않았고 현재 환경변수/캐시를 수정하지 않았다.
