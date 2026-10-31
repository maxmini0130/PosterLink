# 관리자 보안 최종 검증과 세션 정리 승인 전 결과

2026-10-23. 시작 git fetch origin / git status --short --branch 확인, 기준 fde1d56, clean 상태. CLAUDE/README·역할 회수 결과·서버 역할 API·middleware·테스트/E2E 설정을 검토했다. 이번 작업은 운영 읽기 전용 확인과 격리 테스트다. 역할/계정/회원 데이터/세션/설정 변경, ban, 삭제, 운영 배포, Git push는 하지 않았다.

## 운영에서 재확인한 결과

비공개 Auth ID 명부와 현재 Auth/DB GET 결과를 대조했다. 실제 관리자 3개 역할은 기존 최고 관리자 1개/관리자 2개 그대로이며 프로필 해시도 회수 직전과 일치했다. 두 테스트 계정은 user 유지, 기존 댓글·감사 기록 해시 보존 및 역할 회수 감사 기록 4개 존재를 재확인했다. 개인정보/UUID/토큰은 Git/공개 로그에 넣지 않고 기존 사용자 전용 로컬 증빙에 보관했다.

2026-10-23 15:07:44 KST 운영 SQL SELECT 결과:

- profiles RLS=true, 정책 6개 유지.
- authenticated role INSERT/UPDATE=false, anon role UPDATE=false, service_role role UPDATE=true.
- guard 활성 O, tgtype=21, SECURITY INVOKER, search_path=pg_catalog, CRLF 본문 해시 70df87095055b5afb58ba20a645f0d71 유지.
- 기존 updated_at 트리거 활성/해시 유지.
- 대상 두 계정의 저장 세션 합계 39행. 만료/과거 행을 포함할 수 있으므로 활성 로그인 수로 해석하지 않음.

실제 최고 관리자 브라우저 세션에서 권한 관리 페이지를 reload해 정상 접근을 확인하고, 본인 프로필 폼의 닉네임 및 저장 버튼 로드를 확인했다. 실제 저장은 하지 않았다. 관리자 3개 각각과 일반 회원의 실제 로그인/OAuth·프로필 저장은 미검증이다. 기존 세션 화면 접근을 신규 로그인 성공으로 표현하지 않는다.

## 접근 차단 검증과 한계

관리자 역할 API와 목록 API, middleware 및 관리자 레이아웃은 인증 확인 뒤 현재 DB profiles.role을 읽는다. JWT/캐시의 예전 최고 관리자 표시를 권한 근거로 사용하지 않는 경로를 확인했다.

별도 보안 설정의 로컬 합성 Auth fixture로 관련 브라우저 5/5 통과:

- 기존 최고 관리자 JWT 유지 + DB user 결과에서 관리자 GET/PATCH 403, /admin 홈 redirect.
- 데스크톱/모바일 로그인·가입 UI.
- 가입 성공/실패별 role 미전송·실패 시 프로필 미저장.
- staff 정상 프로필 저장 role 미포함.
- 공통 OAuth callback의 role 없는 프로필 upsert.

이 테스트는 운영 프로젝트/키/실계정을 사용하지 않는다. 운영 두 대상의 실제 유효 세션으로 관리자 접근 차단을 재현한 결과는 **미검증**이다. 이미 저장된 access token의 exp는 지났으며 서버에 보내거나 refresh하지 않았다. 검증 범위를 모든 관리자 API/외부 서비스의 무결성 보장으로 확대하지 않는다.

## 세션 폐기 방법과 승인 대상

Supabase 공식 [admin.signOut](https://supabase.com/docs/reference/javascript/auth-admin-signout), [signout](https://supabase.com/docs/guides/auth/signout), [사용자 관리](https://supabase.com/docs/guides/auth/managing-user-data)를 재확인했다. 설치된 SDK도 서버의 auth.admin.signOut(targetUserJwt, 'global') 방식이다. 첫 인수는 Auth ID가 아닌 대상 사용자의 유효 JWT다. 두 대상 모두에 대한 실행 수단은 아직 확보되지 않았다.

실제 운영 Supabase Authentication > Users에서 대상 하나의 Overview를 읽기 전용으로 확인했다. 해당 화면에는 ban·삭제 등 버튼이 있지만 직접 전체 세션 폐기 버튼은 확인하지 못했다. Raw JSON/토큰을 열거나 복사하지 않았으며 ban/삭제도 누르지 않았다. 읽기 점검 후 상세 패널과 검색을 정리하고 원래 SQL 화면으로 복귀했다. 존재하지 않는 ID 기반 SDK나 Auth 내부 테이블 직접 DELETE를 대안으로 실행하지 않는다.

향후 실행 전 승인 범위는 비공개 명부의 정확한 테스트 Auth ID 2개에 한정한 전체 세션/refresh 자격 폐기다. 실제 관리자 3개와 다른 회원 세션, 계정/프로필/댓글/감사 기록은 제외한다. 사용자 본인의 유효 세션 또는 공식 지원으로 검증한 ID 기반 관리자 수단을 확보한 뒤 대상과 방법을 다시 제시하고 별도 승인을 받아야 한다. 새 로그인·refresh·magic link 발급을 세션 폐기 준비 명목으로 임의 수행하지 않는다.

global signOut은 refresh 자격을 폐기해도 이미 발급된 access JWT를 만료 전 즉시 무효화한다고 볼 수 없다. ban은 새 로그인 제한이며 기존 세션 폐기의 대체물이 아니다. ban 기간/로그인 차단은 별도 승인 대상이다. 현재 세션 폐기는 **미실행/실행 수단 미확보**다.

## 재승격 위험

로컬 루트 및 웹 .env.local의 E2E 관리자 자격이 한 테스트 계정을 여전히 참조하고 admin 세션 캐시도 해당 계정과 일치한다. 값은 메모리에서만 비교했고 출력하지 않았다. 기본 globalSetup은 로그인만 하며 생성/승격을 직접 수행하지 않는다. 기존 캐시를 항상 비우지 않고 운영 Supabase ref 차단이 없는 한계가 남아 있다. workflows의 현재 참조도 재검토했으며 직접 테스트 관리자 자동 생성/승격 경로는 발견하지 못했다. 외부/수동 자동화 전체는 미확인이다.

따라서 자동 재승격 방지가 완료된 것은 아니다. 운영 service_role을 테스트 seed/E2E에서 분리하고 Supabase ref 및 앱 URL allowlist, 별도 테스트 프로젝트·합성 계정, 지정된 테스트 자격/캐시 폐기를 후속으로 적용해야 한다. 이번에는 설정/캐시 변경을 하지 않았다. 일반 사용자의 role 쓰기 차단과 정당한 서비스 권한을 가진 자동화의 오용 위험은 다르다.

## 판정

운영 보호 ACL/guard와 지정된 테스트 관리자 역할 회수는 유지되고 있다. 기존 데이터 보존 및 현재 DB 역할 기반 접근 차단 경로/격리 회귀는 확인했다. 세션 정리·운영 테스트 분리·실계정 저장/로그인 최종 검증은 남아 있다. 이를 전체 보안 정리 완료나 실계정 전체 검증 성공으로 보고하지 않는다.

문서만 추가했다. UTF-8·링크·Prettier·git diff --check 확인. 앱/SQL 변경이 없어 build/lint/전체 테스트를 반복하지 않았으며 관련 격리 브라우저 검사만 재실행했다.
